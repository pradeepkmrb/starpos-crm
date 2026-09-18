import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Prisma } from "@digitel/db";
import {
  ACTIVITY_STATUSES,
  ACTIVITY_TYPES,
  VISIT_CHECK_IN_RADIUS_METERS,
  formatDistance,
  roleAtLeast,
  type ActivityStatus,
  type ActivityType,
  type LeadStatus,
} from "@digitel/shared";
import { PrismaService } from "../../prisma/prisma.service";
import type { TenantRequestContext } from "../../common/request-context";
import { CheckInDto, CheckOutDto, CreateActivityDto, UpdateActivityDto } from "./dto/activity.dto";
import {
  checkInDecision,
  closedAtForStatusChange,
  completedAtForStatus,
  stageImpliedByActivity,
} from "./activity-rules";

export interface ListActivitiesOptions {
  leadId?: string;
  /** A user id, "me", or "unassigned". */
  owner?: string;
  status?: string;
  type?: string;
  /** Inclusive lower / exclusive upper bound on scheduledAt, as ISO strings. */
  from?: string;
  to?: string;
  /** Same, on startedAt: visits checked in during a window. */
  startedFrom?: string;
  startedTo?: string;
  take?: number;
}

/** Lead fields a rep needs on a to-do row: who, where, and how to reach them. */
export const ACTIVITY_INCLUDE = {
  lead: {
    select: {
      id: true,
      name: true,
      company: true,
      phone: true,
      status: true,
      address: true,
      latitude: true,
      longitude: true,
    },
  },
  owner: { select: { id: true, name: true, email: true } },
} satisfies Prisma.ActivityInclude;

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ctx: TenantRequestContext, options: ListActivitiesOptions = {}) {
    const scheduledAt: Prisma.DateTimeNullableFilter = {};
    if (options.from) scheduledAt.gte = parseDate(options.from, "from");
    if (options.to) scheduledAt.lt = parseDate(options.to, "to");
    const startedAt: Prisma.DateTimeNullableFilter = {};
    if (options.startedFrom) startedAt.gte = parseDate(options.startedFrom, "startedFrom");
    if (options.startedTo) startedAt.lt = parseDate(options.startedTo, "startedTo");

    const rows = await this.prisma.activity.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(options.leadId ? { leadId: options.leadId } : {}),
        ...ownerFilter(ctx, options.owner),
        ...(isIn(ACTIVITY_STATUSES, options.status) ? { status: options.status } : {}),
        ...(isIn(ACTIVITY_TYPES, options.type) ? { type: options.type } : {}),
        ...(options.from || options.to ? { scheduledAt } : {}),
        ...(options.startedFrom || options.startedTo ? { startedAt } : {}),
      },
      // To-do lists read soonest first; a lead's timeline and visit logs read newest first.
      orderBy: options.leadId
        ? { createdAt: "desc" }
        : options.startedFrom || options.startedTo
          ? { startedAt: "desc" }
          : [{ scheduledAt: "asc" }, { createdAt: "asc" }],
      take: options.take ?? 200,
      include: ACTIVITY_INCLUDE,
    });
    return options.leadId ? rows.sort((a, b) => happenedAt(b) - happenedAt(a)) : rows;
  }

  async create(ctx: TenantRequestContext, dto: CreateActivityDto) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: dto.leadId, tenantId: ctx.tenantId },
      select: { id: true, status: true },
    });
    if (!lead) throw new NotFoundException("Lead not found");

    // A note is a record of something already said, so it's never "to do".
    const status: ActivityStatus = dto.type === "note" ? "completed" : (dto.status ?? "scheduled");
    const ownerUserId =
      dto.ownerUserId === undefined
        ? ctx.userId || null
        : await this.resolveOwner(ctx.tenantId, dto.ownerUserId);

    return this.prisma.$transaction(async (tx) => {
      const activity = await tx.activity.create({
        data: {
          tenantId: ctx.tenantId,
          leadId: lead.id,
          type: dto.type,
          status,
          title: emptyToNull(dto.title),
          notes: emptyToNull(dto.notes),
          outcome: emptyToNull(dto.outcome),
          ownerUserId,
          createdByUserId: ctx.userId || null,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
          completedAt: completedAtForStatus(status, dto.completedAt ? new Date(dto.completedAt) : null),
          durationSeconds: dto.durationSeconds ?? null,
          latitude: dto.latitude ?? null,
          longitude: dto.longitude ?? null,
        },
        include: ACTIVITY_INCLUDE,
      });
      await advanceLeadStage(tx, lead, { type: dto.type, status });
      return activity;
    });
  }

  async update(ctx: TenantRequestContext, id: string, dto: UpdateActivityDto) {
    const existing = await this.prisma.activity.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { lead: { select: { id: true, status: true } } },
    });
    if (!existing) throw new NotFoundException("Activity not found");

    const type = dto.type ?? existing.type;
    const status = dto.status ?? existing.status;
    const data: Prisma.ActivityUncheckedUpdateInput = { type, status };
    if (dto.title !== undefined) data.title = emptyToNull(dto.title);
    if (dto.notes !== undefined) data.notes = emptyToNull(dto.notes);
    if (dto.outcome !== undefined) data.outcome = emptyToNull(dto.outcome);
    if (dto.scheduledAt !== undefined) data.scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    if (dto.durationSeconds !== undefined) data.durationSeconds = dto.durationSeconds;
    if (dto.latitude !== undefined) data.latitude = dto.latitude;
    if (dto.longitude !== undefined) data.longitude = dto.longitude;
    if (dto.ownerUserId !== undefined) data.ownerUserId = await this.resolveOwner(ctx.tenantId, dto.ownerUserId);
    if (dto.status !== undefined || dto.completedAt !== undefined) {
      const requested = dto.completedAt ? new Date(dto.completedAt) : dto.completedAt === null ? null : existing.completedAt;
      data.completedAt = completedAtForStatus(status, requested);
      // Ending a visit this way still records how long it took.
      if (existing.status === "in_progress" && status === "completed" && existing.startedAt && data.completedAt) {
        data.durationSeconds = secondsBetween(existing.startedAt, data.completedAt as Date);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const activity = await tx.activity.update({ where: { id }, data, include: ACTIVITY_INCLUDE });
      await advanceLeadStage(tx, existing.lead, { type, status });
      return activity;
    });
  }

  /**
   * Starts a visit where the rep is standing. The server does the distance
   * check (the app only displays it), a rep can have one visit open at a
   * time, and a lead with no location yet is pinned to this spot.
   */
  async checkIn(ctx: TenantRequestContext, dto: CheckInDto) {
    if (!ctx.userId) throw new BadRequestException("Check-in needs a signed-in user");
    const lead = await this.prisma.lead.findFirst({
      where: { id: dto.leadId, tenantId: ctx.tenantId },
      select: { id: true, name: true, company: true, latitude: true, longitude: true },
    });
    if (!lead) throw new NotFoundException("Lead not found");

    const open = await this.prisma.activity.findFirst({
      where: { tenantId: ctx.tenantId, ownerUserId: ctx.userId, status: "in_progress" },
      select: { id: true, lead: { select: { name: true, company: true } } },
    });
    if (open) {
      throw new ConflictException({
        message: `You're still checked in at ${open.lead.company || open.lead.name}. End that visit first.`,
        activeVisitId: open.id,
      });
    }

    const decision = checkInDecision(lead, { latitude: dto.latitude, longitude: dto.longitude });
    if (!decision.allowed) {
      throw new UnprocessableEntityException({
        message: `You're ${formatDistance(decision.distanceMeters)} from ${lead.company || lead.name}. Check in within ${VISIT_CHECK_IN_RADIUS_METERS} m of their location.`,
        distanceMeters: decision.distanceMeters,
      });
    }

    let scheduledVisitId: string | null = null;
    if (dto.activityId) {
      const scheduled = await this.prisma.activity.findFirst({
        where: { id: dto.activityId, tenantId: ctx.tenantId, leadId: lead.id, type: "visit", status: "scheduled" },
        select: { id: true },
      });
      if (!scheduled) throw new BadRequestException("That isn't a scheduled visit for this lead");
      scheduledVisitId = scheduled.id;
    }

    const visitData = {
      status: "in_progress" as const,
      startedAt: new Date(),
      ownerUserId: ctx.userId,
      latitude: dto.latitude,
      longitude: dto.longitude,
      accuracyMeters: dto.accuracyMeters ?? null,
      distanceMeters: decision.distanceMeters,
      ...(dto.title?.trim() ? { title: dto.title.trim() } : {}),
      ...(dto.notes?.trim() ? { notes: dto.notes.trim() } : {}),
    };

    return this.prisma.$transaction(async (tx) => {
      if (decision.pinLead) {
        await tx.lead.update({ where: { id: lead.id }, data: { latitude: dto.latitude, longitude: dto.longitude } });
      }
      return scheduledVisitId
        ? tx.activity.update({ where: { id: scheduledVisitId }, data: visitData, include: ACTIVITY_INCLUDE })
        : tx.activity.create({
            data: { ...visitData, tenantId: ctx.tenantId, leadId: lead.id, type: "visit", createdByUserId: ctx.userId },
            include: ACTIVITY_INCLUDE,
          });
    });
  }

  /** Ends a visit: how long it took, what came of it, and where the rep was. */
  async checkOut(ctx: TenantRequestContext, id: string, dto: CheckOutDto) {
    const visit = await this.prisma.activity.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { lead: { select: { id: true, status: true } } },
    });
    if (!visit) throw new NotFoundException("Visit not found");
    if (visit.status !== "in_progress") throw new BadRequestException("This visit isn't in progress");
    if (visit.ownerUserId !== ctx.userId && !roleAtLeast(ctx.role, "admin")) {
      throw new ForbiddenException("Only the rep on this visit can end it");
    }

    const completedAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      const done = await tx.activity.update({
        where: { id },
        data: {
          status: "completed",
          completedAt,
          durationSeconds: visit.startedAt ? secondsBetween(visit.startedAt, completedAt) : null,
          ...(dto.outcome !== undefined ? { outcome: emptyToNull(dto.outcome) } : {}),
          ...(dto.notes !== undefined ? { notes: emptyToNull(dto.notes) } : {}),
          endLatitude: dto.latitude ?? null,
          endLongitude: dto.longitude ?? null,
        },
        include: ACTIVITY_INCLUDE,
      });
      await advanceLeadStage(tx, visit.lead, { type: "visit", status: "completed" });
      return done;
    });
  }

  /** Admins can remove anything; everyone else only what they logged themselves. */
  async remove(ctx: TenantRequestContext, id: string) {
    const existing = await this.prisma.activity.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, createdByUserId: true },
    });
    if (!existing) throw new NotFoundException("Activity not found");
    if (!roleAtLeast(ctx.role, "admin") && existing.createdByUserId !== ctx.userId) {
      throw new ForbiddenException("You can only delete activities you logged");
    }
    await this.prisma.activity.delete({ where: { id } });
    return { id, deleted: true };
  }

  private async resolveOwner(tenantId: string, ownerUserId: string | null): Promise<string | null> {
    if (!ownerUserId) return null;
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { tenantId, userId: ownerUserId, status: "active" },
      select: { userId: true },
    });
    if (!membership) throw new BadRequestException("That owner is not a member of this workspace");
    return membership.userId;
  }
}

/** Moves the lead to the stage the activity implies, keeping closedAt in step. */
async function advanceLeadStage(
  tx: Prisma.TransactionClient,
  lead: { id: string; status: LeadStatus },
  activity: { type: ActivityType; status: ActivityStatus },
) {
  const next = stageImpliedByActivity(lead.status, activity);
  if (!next) return;
  const closedAt = closedAtForStatusChange(lead.status, next);
  await tx.lead.update({
    where: { id: lead.id },
    data: { status: next, ...(closedAt !== undefined ? { closedAt } : {}) },
  });
}

export function ownerFilter(ctx: TenantRequestContext, owner?: string): Prisma.ActivityWhereInput {
  if (!owner) return {};
  if (owner === "unassigned") return { ownerUserId: null };
  // An API-key caller has no user, so "me" must match nothing rather than everything.
  if (owner === "me") return ctx.userId ? { ownerUserId: ctx.userId } : { id: { in: [] } };
  return { ownerUserId: owner };
}

function secondsBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000));
}

function happenedAt(activity: { completedAt: Date | null; scheduledAt: Date | null; createdAt: Date }): number {
  return (activity.completedAt ?? activity.scheduledAt ?? activity.createdAt).getTime();
}

function isIn<T extends string>(values: readonly T[], value?: string): value is T {
  return !!value && (values as readonly string[]).includes(value);
}

export function parseDate(value: string, name: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`"${name}" must be an ISO date`);
  return date;
}

function emptyToNull(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
