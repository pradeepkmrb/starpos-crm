import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@digitel/db";
import {
  ACTIVITY_STATUSES,
  ACTIVITY_TYPES,
  roleAtLeast,
  type ActivityStatus,
  type ActivityType,
  type LeadStatus,
} from "@digitel/shared";
import { PrismaService } from "../../prisma/prisma.service";
import type { TenantRequestContext } from "../../common/request-context";
import { CreateActivityDto, UpdateActivityDto } from "./dto/activity.dto";
import { closedAtForStatusChange, completedAtForStatus, stageImpliedByActivity } from "./activity-rules";

export interface ListActivitiesOptions {
  leadId?: string;
  /** A user id, "me", or "unassigned". */
  owner?: string;
  status?: string;
  type?: string;
  /** Inclusive lower / exclusive upper bound on scheduledAt, as ISO strings. */
  from?: string;
  to?: string;
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

    const rows = await this.prisma.activity.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(options.leadId ? { leadId: options.leadId } : {}),
        ...ownerFilter(ctx, options.owner),
        ...(isIn(ACTIVITY_STATUSES, options.status) ? { status: options.status } : {}),
        ...(isIn(ACTIVITY_TYPES, options.type) ? { type: options.type } : {}),
        ...(options.from || options.to ? { scheduledAt } : {}),
      },
      // To-do lists read soonest first; a lead's timeline reads newest first.
      orderBy: options.leadId ? { createdAt: "desc" } : [{ scheduledAt: "asc" }, { createdAt: "asc" }],
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
    }

    return this.prisma.$transaction(async (tx) => {
      const activity = await tx.activity.update({ where: { id }, data, include: ACTIVITY_INCLUDE });
      await advanceLeadStage(tx, existing.lead, { type, status });
      return activity;
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
