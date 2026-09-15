import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@digitel/db";
import { LEAD_STATUSES, type LeadStatus } from "@digitel/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { LeadFieldsService } from "./lead-fields.service";
import { CreateLeadDto } from "./dto/create-lead.dto";
import { UpdateLeadDto } from "./dto/update-lead.dto";
import { normalizeCustomFieldValues } from "./lead-custom-values";

export interface ListLeadsOptions {
  status?: string;
  search?: string;
  take?: number;
}

/** What every lead response carries alongside the row itself. */
const LEAD_INCLUDE = {
  owner: { select: { id: true, name: true, email: true } },
  metaFormLink: { select: { id: true, formId: true, formName: true, pageName: true } },
} satisfies Prisma.LeadInclude;

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leadFields: LeadFieldsService,
  ) {}

  list(tenantId: string, options: ListLeadsOptions = {}) {
    const search = options.search?.trim();
    return this.prisma.lead.findMany({
      where: {
        tenantId,
        ...(isLeadStatus(options.status) ? { status: options.status } : {}),
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

  async create(tenantId: string, dto: CreateLeadDto) {
    const definitions = await this.leadFields.listDefinitions(tenantId);
    const customFields = normalizeCustomFieldValues(definitions, dto.customFields);
    const ownerUserId = await this.resolveOwner(tenantId, dto.ownerUserId);

    return this.prisma.lead.create({
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
      },
      include: LEAD_INCLUDE,
    });
  }

  async update(tenantId: string, id: string, dto: UpdateLeadDto) {
    const lead = await this.prisma.lead.findFirst({ where: { id, tenantId } });
    if (!lead) throw new NotFoundException("Lead not found");

    // Only keys the caller actually sent are written, so a patch of one
    // field can't blank the others.
    const data: Prisma.LeadUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.phone !== undefined) data.phone = emptyToNull(dto.phone);
    if (dto.email !== undefined) data.email = emptyToNull(dto.email);
    if (dto.company !== undefined) data.company = emptyToNull(dto.company);
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.source !== undefined) data.source = dto.source?.trim() || "manual";
    if (dto.valuePaise !== undefined) data.valuePaise = dto.valuePaise;
    if (dto.notes !== undefined) data.notes = emptyToNull(dto.notes);
    if (dto.ownerUserId !== undefined) {
      const ownerUserId = await this.resolveOwner(tenantId, dto.ownerUserId);
      data.owner = ownerUserId ? { connect: { id: ownerUserId } } : { disconnect: true };
    }
    if (dto.customFields !== undefined) {
      const definitions = await this.leadFields.listDefinitions(tenantId);
      data.customFieldsJson = normalizeCustomFieldValues(definitions, dto.customFields, {
        existing: asRecord(lead.customFieldsJson),
      });
    }

    return this.prisma.lead.update({ where: { id }, data, include: LEAD_INCLUDE });
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
