import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@digitel/db";
import { isChoiceFieldType } from "@digitel/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateLeadFieldDto } from "./dto/create-lead-field.dto";
import { UpdateLeadFieldDto } from "./dto/update-lead-field.dto";
import { slugifyFieldKey, uniqueFieldKey, type CustomFieldDefinition } from "./lead-custom-values";

/** A tenant can't add unlimited questions to one form and still have it usable. */
const MAX_FIELDS_PER_TENANT = 50;

@Injectable()
export class LeadFieldsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every field, retired ones included — the builder screen needs to show both. */
  list(tenantId: string) {
    return this.prisma.leadCustomField.findMany({
      where: { tenantId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });
  }

  /** Just what the lead entry screen renders and what validation runs against. */
  async listDefinitions(tenantId: string): Promise<CustomFieldDefinition[]> {
    const fields = await this.list(tenantId);
    return fields.map((field) => ({
      key: field.key,
      label: field.label,
      type: field.type,
      required: field.required,
      isActive: field.isActive,
      optionsJson: field.optionsJson,
    }));
  }

  async create(tenantId: string, dto: CreateLeadFieldDto) {
    const existing = await this.prisma.leadCustomField.findMany({
      where: { tenantId },
      select: { key: true, order: true },
    });
    if (existing.length >= MAX_FIELDS_PER_TENANT) {
      throw new BadRequestException(`A lead form can hold at most ${MAX_FIELDS_PER_TENANT} custom fields`);
    }

    const options = normalizeOptions(dto.type, dto.options);
    const key = uniqueFieldKey(
      slugifyFieldKey(dto.label),
      existing.map((f) => f.key),
    );
    const nextOrder = existing.reduce((max, f) => Math.max(max, f.order), -1) + 1;

    return this.prisma.leadCustomField.create({
      data: {
        tenantId,
        key,
        label: dto.label.trim(),
        type: dto.type,
        optionsJson: options ?? Prisma.DbNull,
        required: dto.required ?? false,
        placeholder: dto.placeholder?.trim() || null,
        helpText: dto.helpText?.trim() || null,
        order: nextOrder,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateLeadFieldDto) {
    const field = await this.prisma.leadCustomField.findFirst({ where: { id, tenantId } });
    if (!field) throw new NotFoundException("Field not found");

    // Only keys the caller actually sent are written, so a patch of one
    // property can't blank the others.
    const data: Record<string, unknown> = {};
    if (dto.label !== undefined) data.label = dto.label.trim();
    if (dto.options !== undefined) {
      data.optionsJson = normalizeOptions(field.type, dto.options) ?? Prisma.DbNull;
    }
    if (dto.required !== undefined) data.required = dto.required;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.placeholder !== undefined) data.placeholder = dto.placeholder.trim() || null;
    if (dto.helpText !== undefined) data.helpText = dto.helpText.trim() || null;

    return this.prisma.leadCustomField.update({ where: { id }, data });
  }

  /**
   * Removes the definition. Answers already stored on leads stay in their
   * JSON column untouched — deactivating instead of deleting is the
   * non-destructive option, which is why the UI offers both.
   */
  async remove(tenantId: string, id: string) {
    const field = await this.prisma.leadCustomField.findFirst({ where: { id, tenantId } });
    if (!field) throw new NotFoundException("Field not found");
    await this.prisma.leadCustomField.delete({ where: { id } });
    return { id, deleted: true };
  }

  /** Writes the order the operator dragged the fields into. */
  async reorder(tenantId: string, ids: string[]) {
    const owned = await this.prisma.leadCustomField.findMany({
      where: { tenantId, id: { in: ids } },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((f) => f.id));

    await this.prisma.$transaction(
      ids
        .filter((id) => ownedIds.has(id))
        .map((id, index) =>
          this.prisma.leadCustomField.update({ where: { id }, data: { order: index } }),
        ),
    );
    return this.list(tenantId);
  }
}

/** Choice fields need a non-empty, de-duplicated option list; other types keep none. */
function normalizeOptions(type: string, options?: string[]): string[] | null {
  if (!isChoiceFieldType(type as never)) return null;

  const cleaned = Array.from(
    new Set((options ?? []).map((option) => option.trim()).filter((option) => option.length > 0)),
  );
  if (cleaned.length === 0) {
    throw new BadRequestException("A dropdown or radio field needs at least one choice");
  }
  return cleaned;
}
