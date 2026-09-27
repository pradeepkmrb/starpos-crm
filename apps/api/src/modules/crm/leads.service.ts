import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@digitel/db";
import { LEAD_STATUSES, boundingBox, distanceMeters, type LatLng, type LeadStatus } from "@digitel/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { CustomFieldsService } from "../custom-fields/custom-fields.service";
import { CreateLeadDto } from "./dto/create-lead.dto";
import { UpdateLeadDto } from "./dto/update-lead.dto";
import { normalizeCustomFieldValues } from "../custom-fields/custom-field-values";
import { closedAtForStatusChange } from "../field-sales/activity-rules";
import { PushService } from "../push/push.service";

export interface ListLeadsOptions {
  status?: string;
  search?: string;
  take?: number;
  /** Only this owner's leads; resolve "me" in the controller. Null means unassigned. */
  ownerUserId?: string | null;
  hot?: boolean;
}

/** What every lead response carries alongside the row itself. */
const LEAD_INCLUDE = {
  owner: { select: { id: true, name: true, email: true, avatarUrl: true } },
  metaFormLink: { select: { id: true, formId: true, formName: true, pageName: true } },
} satisfies Prisma.LeadInclude;

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customFields: CustomFieldsService,
    private readonly push: PushService,
  ) {}

  list(tenantId: string, options: ListLeadsOptions = {}) {
    const search = options.search?.trim();
    return this.prisma.lead.findMany({
      where: {
        tenantId,
        ...(isLeadStatus(options.status) ? { status: options.status } : {}),
        ...(options.ownerUserId !== undefined ? { ownerUserId: options.ownerUserId } : {}),
        ...(options.hot ? { isHot: true } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" as const } },
                { company: { contains: search, mode: "insensitive" as const } },
                { email: { contains: search, mode: "insensitive" as const } },
                { phone: { contains: search } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: options.take ?? 200,
      include: LEAD_INCLUDE,
    });
  }

  /**
   * Leads with a pinned location near a point, closest first, each carrying
   * its distance. A lat/lng box narrows the rows in the database; the exact
   * distance then trims the box's corners.
   */
  async nearby(
    tenantId: string,
    center: LatLng,
    radiusMeters: number,
    options: { ownerUserId?: string | null; take?: number } = {},
  ) {
    const box = boundingBox(center, radiusMeters);
    const rows = await this.prisma.lead.findMany({
      where: {
        tenantId,
        latitude: { gte: box.minLat, lte: box.maxLat },
        longitude: { gte: box.minLng, lte: box.maxLng },
        ...(options.ownerUserId !== undefined ? { ownerUserId: options.ownerUserId } : {}),
      },
      include: LEAD_INCLUDE,
      take: 2000,
    });
    return rows
      .map((lead) => ({
        ...lead,
        distanceMeters: Math.round(distanceMeters(center, { latitude: lead.latitude!, longitude: lead.longitude! })),
      }))
      .filter((lead) => lead.distanceMeters <= radiusMeters)
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, options.take ?? 200);
  }

  /** Pipeline counts for the header tiles, in one grouped query. */
  async summary(tenantId: string) {
    const rows = await this.prisma.lead.groupBy({
      by: ["status"],
      where: { tenantId },
      _count: { _all: true },
    });
    const byStatus = Object.fromEntries(LEAD_STATUSES.map((status) => [status, 0])) as Record<
      LeadStatus,
      number
    >;
    for (const row of rows) byStatus[row.status] = row._count._all;
    return { total: rows.reduce((sum, row) => sum + row._count._all, 0), byStatus };
  }

  async get(tenantId: string, id: string) {
    const lead = await this.prisma.lead.findFirst({ where: { id, tenantId }, include: LEAD_INCLUDE });
    if (!lead) throw new NotFoundException("Lead not found");
    return lead;
  }

  /** `actorUserId` is who is saving; they are never notified about their own change. */
  async create(tenantId: string, dto: CreateLeadDto, actorUserId?: string) {
    const definitions = await this.customFields.listDefinitions(tenantId, "lead");
    const customFields = normalizeCustomFieldValues(definitions, dto.customFields);
    const ownerUserId = await this.resolveOwner(tenantId, dto.ownerUserId);

    const lead = await this.prisma.lead.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        phone: emptyToNull(dto.phone),
        email: emptyToNull(dto.email),
        company: emptyToNull(dto.company),
        status: dto.status ?? "new",
        source: dto.source?.trim() || "manual",
        valuePaise: dto.valuePaise ?? null,
        notes: emptyToNull(dto.notes),
        ownerUserId,
        customFieldsJson: customFields,
        address: emptyToNull(dto.address),
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        isHot: dto.isHot ?? false,
        imageUrl: dto.imageUrl ?? null,
        expectedCloseAt: dto.expectedCloseAt ? new Date(dto.expectedCloseAt) : null,
        closedAt: closedAtForStatusChange("new", dto.status ?? "new") ?? null,
      },
      include: LEAD_INCLUDE,
    });
    this.notifyAssigned(tenantId, lead, actorUserId);
    return lead;
  }

  async update(tenantId: string, id: string, dto: UpdateLeadDto, actorUserId?: string) {
    const lead = await this.prisma.lead.findFirst({ where: { id, tenantId } });
    if (!lead) throw new NotFoundException("Lead not found");

    // Only keys the caller actually sent are written, so a patch of one
    // field can't blank the others.
    const data: Prisma.LeadUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.phone !== undefined) data.phone = emptyToNull(dto.phone);
    if (dto.email !== undefined) data.email = emptyToNull(dto.email);
    if (dto.company !== undefined) data.company = emptyToNull(dto.company);
    if (dto.status !== undefined) {
      data.status = dto.status;
      const closedAt = closedAtForStatusChange(lead.status, dto.status);
      if (closedAt !== undefined) data.closedAt = closedAt;
    }
    if (dto.address !== undefined) data.address = emptyToNull(dto.address);
    if (dto.latitude !== undefined) data.latitude = dto.latitude;
    if (dto.longitude !== undefined) data.longitude = dto.longitude;
    if (dto.isHot !== undefined) data.isHot = dto.isHot;
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl;
    if (dto.expectedCloseAt !== undefined) {
      data.expectedCloseAt = dto.expectedCloseAt ? new Date(dto.expectedCloseAt) : null;
    }
    if (dto.source !== undefined) data.source = dto.source?.trim() || "manual";
    if (dto.valuePaise !== undefined) data.valuePaise = dto.valuePaise;
    if (dto.notes !== undefined) data.notes = emptyToNull(dto.notes);
    if (dto.ownerUserId !== undefined) {
      const ownerUserId = await this.resolveOwner(tenantId, dto.ownerUserId);
      data.owner = ownerUserId ? { connect: { id: ownerUserId } } : { disconnect: true };
    }
    if (dto.customFields !== undefined) {
      const definitions = await this.customFields.listDefinitions(tenantId, "lead");
      data.customFieldsJson = normalizeCustomFieldValues(definitions, dto.customFields, {
        existing: asRecord(lead.customFieldsJson),
      });
    }

    const updated = await this.prisma.lead.update({ where: { id }, data, include: LEAD_INCLUDE });
    if (updated.ownerUserId !== lead.ownerUserId) this.notifyAssigned(tenantId, updated, actorUserId);
    return updated;
  }

  /** "New lead assigned" on the owner's phone — unless they assigned it to themselves. */
  private notifyAssigned(
    tenantId: string,
    lead: { id: string; name: string; company: string | null; address: string | null; ownerUserId: string | null },
    actorUserId?: string,
  ) {
    if (!lead.ownerUserId || lead.ownerUserId === actorUserId) return;
    void this.push.notifyUsers(tenantId, [lead.ownerUserId], {
      title: "New lead assigned",
      body: [lead.company || lead.name, lead.address].filter(Boolean).join(" · "),
      url: `/lead/${lead.id}`,
    });
  }

  async remove(tenantId: string, id: string) {
    const lead = await this.prisma.lead.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!lead) throw new NotFoundException("Lead not found");
    await this.prisma.lead.delete({ where: { id } });
    return { id, deleted: true };
  }

  /** An owner has to be an active member of this tenant, not just any user id. */
  private async resolveOwner(tenantId: string, ownerUserId?: string | null): Promise<string | null> {
    if (!ownerUserId) return null;
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { tenantId, userId: ownerUserId, status: "active" },
      select: { userId: true },
    });
    if (!membership) throw new BadRequestException("That owner is not a member of this workspace");
    return membership.userId;
  }
}

function isLeadStatus(value?: string): value is LeadStatus {
  return !!value && (LEAD_STATUSES as readonly string[]).includes(value);
}

function emptyToNull(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Prisma hands back JsonValue; only an object shape is usable as an answer map. */
export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
