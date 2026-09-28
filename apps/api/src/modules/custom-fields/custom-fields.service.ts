import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@starpos-crm/db";
import { isChoiceFieldType, type CustomFieldEntity } from "@starpos-crm/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateCustomFieldDto } from "./dto/create-custom-field.dto";
import { UpdateCustomFieldDto } from "./dto/update-custom-field.dto";
import { slugifyFieldKey, uniqueFieldKey, type CustomFieldDefinition } from "./custom-field-values";

/** A tenant can't add unlimited questions to one form and still have it usable. */
const MAX_FIELDS_PER_ENTITY = 50;

/**
 * The field builder behind every entry screen that has one. Each entity —
 * leads, contacts — keeps its own set, so the two never collide, but the
 * rules for keys, choices and ordering live here once.
 */
@Injectable()
export class CustomFieldsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every field for this entity, retired ones included — the builder shows both. */
  list(tenantId: string, entity: CustomFieldEntity) {
    return this.prisma.customField.findMany({
      where: { tenantId, entity },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });
  }

  /** Just what an entry screen renders and what validation runs against. */
  async listDefinitions(
    tenantId: string,
    entity: CustomFieldEntity,
  ): Promise<CustomFieldDefinition[]> {
    const fields = await this.list(tenantId, entity);
    return fields.map((field) => ({
      key: field.key,
      label: field.label,
      type: field.type,
      required: field.required,
      isActive: field.isActive,
      optionsJson: field.optionsJson,
    }));
  }

  async create(tenantId: string, entity: CustomFieldEntity, dto: CreateCustomFieldDto) {
    const existing = await this.prisma.customField.findMany({
      where: { tenantId, entity },
      select: { key: true, order: true },
    });
    if (existing.length >= MAX_FIELDS_PER_ENTITY) {
      throw new BadRequestException(`A form can hold at most ${MAX_FIELDS_PER_ENTITY} custom fields`);
    }

    const options = normalizeOptions(dto.type, dto.options);
    const key = uniqueFieldKey(
      slugifyFieldKey(dto.label),
      existing.map((f) => f.key),
    );
    const nextOrder = existing.reduce((max, f) => Math.max(max, f.order), -1) + 1;

    return this.prisma.customField.create({
      data: {
        tenantId,
        entity,
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

  async update(tenantId: string, entity: CustomFieldEntity, id: string, dto: UpdateCustomFieldDto) {
    const field = await this.requireField(tenantId, entity, id);

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

    return this.prisma.customField.update({ where: { id }, data });
  }

  /**
   * Removes the definition. Answers already stored stay in their JSON column
   * untouched — deactivating instead of deleting is the non-destructive
   * option, which is why the UI offers both.
   */
  async remove(tenantId: string, entity: CustomFieldEntity, id: string) {
    await this.requireField(tenantId, entity, id);
    await this.prisma.customField.delete({ where: { id } });
    return { id, deleted: true };
  }

  /** Writes the order the operator dragged the fields into. */
  async reorder(tenantId: string, entity: CustomFieldEntity, ids: string[]) {
    const owned = await this.prisma.customField.findMany({
      where: { tenantId, entity, id: { in: ids } },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((f) => f.id));

    await this.prisma.$transaction(
      ids
        .filter((id) => ownedIds.has(id))
        .map((id, index) => this.prisma.customField.update({ where: { id }, data: { order: index } })),
    );
    return this.list(tenantId, entity);
  }

  /** Scoped by entity as well as tenant, so a lead field id can't be edited through the contact route. */
  private async requireField(tenantId: string, entity: CustomFieldEntity, id: string) {
    const field = await this.prisma.customField.findFirst({ where: { id, tenantId, entity } });
    if (!field) throw new NotFoundException("Field not found");
    return field;
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
