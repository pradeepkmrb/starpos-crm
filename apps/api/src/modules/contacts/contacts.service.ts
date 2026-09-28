import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { ChannelType } from "@starpos-crm/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { CustomFieldsService } from "../custom-fields/custom-fields.service";
import {
  normalizeCustomFieldValues,
  slugifyFieldKey,
  type CustomFieldDefinition,
} from "../custom-fields/custom-field-values";
import { parseContactsCsv } from "./csv-parser";
import { ImportContactsDto } from "./dto/import-contacts.dto";
import { CreateContactDto } from "./dto/create-contact.dto";
import { UpdateContactDto } from "./dto/update-contact.dto";

export interface UpsertContactOptions {
  name?: string;
  email?: string;
  source?: string;
  markInbound?: boolean;
}

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly customFields: CustomFieldsService,
  ) {}

  /**
   * Minimal upsert-by-number used by both outbound sends (Phase 2 test-send)
   * and inbound WhatsApp webhook processing.
   */
  upsertByNumber(tenantId: string, whatsappNumber: string, opts: UpsertContactOptions = {}) {
    return this.upsertByExternalId(tenantId, "whatsapp", whatsappNumber, opts);
  }

  /**
   * The channel-agnostic version: `externalId` is the person's id on whichever
   * platform they wrote from — phone number, Messenger PSID, Instagram IGSID or
   * email address. Someone who writes from two channels becomes two contacts,
   * because no platform gives us a way to prove they are the same person.
   */
  async upsertByExternalId(
    tenantId: string,
    channelType: ChannelType,
    externalId: string,
    opts: UpsertContactOptions = {},
  ) {
    const key = { tenantId_channelType_externalId: { tenantId, channelType, externalId } };

    // Existence is checked first so callers can tell a brand-new contact from
    // a returning one — the inbound webhook path needs this to fire "welcome"
    // automations exactly once.
    const existing = await this.prisma.contact.findUnique({ where: key, select: { id: true } });

    const contact = await this.prisma.contact.upsert({
      where: key,
      update: {
        ...(opts.markInbound ? { lastInboundAt: new Date() } : {}),
        // Meta only hands out a profile name once the person has messaged the
        // Page, so a name that arrives later fills a gap but never overwrites
        // one an operator typed in.
        ...(opts.name && !existing ? { name: opts.name } : {}),
      },
      create: {
        tenantId,
        channelType,
        externalId,
        whatsappNumber: channelType === "whatsapp" ? externalId : null,
        email: channelType === "email" ? externalId : opts.email,
        name: opts.name,
        source: opts.source ?? "manual",
        ...(opts.markInbound ? { lastInboundAt: new Date() } : {}),
      },
    });

    return { contact, isNew: !existing };
  }

  listContacts(tenantId: string, take = 100) {
    return this.prisma.contact.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take,
    });
  }

  /**
   * Hard erasure: message logs and campaign recipients reference Contact with
   * the default restrict rule, so they have to go first or Postgres rejects
   * the delete. That means removing a contact also removes their delivery
   * history — the erasure semantics a marketing tool needs, but destructive,
   * so callers should confirm with the operator first.
   */
  async deleteContacts(tenantId: string, ids: string[]): Promise<{ deleted: number }> {
    // Scoped to the tenant up front so an id from another tenant is a no-op
    // rather than a cross-tenant delete.
    const owned = await this.prisma.contact.findMany({
      where: { tenantId, id: { in: ids } },
      select: { id: true },
    });
    if (owned.length === 0) return { deleted: 0 };
    const ownedIds = owned.map((c) => c.id);

    await this.prisma.$transaction([
      // CampaignRecipient points at MessageLog, so it unwinds first.
      this.prisma.campaignRecipient.deleteMany({ where: { contactId: { in: ownedIds } } }),
      this.prisma.messageLog.deleteMany({ where: { contactId: { in: ownedIds } } }),
      this.prisma.contactListMember.deleteMany({ where: { contactId: { in: ownedIds } } }),
      this.prisma.contact.deleteMany({ where: { tenantId, id: { in: ownedIds } } }),
    ]);

    return { deleted: ownedIds.length };
  }

  async deleteContact(tenantId: string, id: string): Promise<{ id: string; deleted: boolean }> {
    const { deleted } = await this.deleteContacts(tenantId, [id]);
    if (deleted === 0) throw new NotFoundException("Contact not found");
    return { id, deleted: true };
  }

  async updateContact(tenantId: string, id: string, dto: UpdateContactDto) {
    const contact = await this.prisma.contact.findFirst({ where: { id, tenantId } });
    if (!contact) throw new NotFoundException("Contact not found");

    // Only keys the caller actually sent are written, so a patch of one field
    // can't blank the others.
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name || null;
    if (dto.email !== undefined) data.email = dto.email || null;
    if (dto.languageCode !== undefined) data.languageCode = dto.languageCode || null;
    if (dto.optedIn !== undefined) data.optedIn = dto.optedIn;
    if (dto.botEnabled !== undefined) data.botEnabled = dto.botEnabled;
    if (dto.customFields !== undefined) {
      const definitions = await this.customFields.listDefinitions(tenantId, "contact");
      // Merged over what is stored, so patching one answer can't blank the rest.
      data.attributesJson = normalizeCustomFieldValues(definitions, dto.customFields, {
        existing: asRecord(contact.attributesJson),
      });
    }

    return this.prisma.contact.update({ where: { id }, data });
  }

  /** Wipes the tenant's whole audience, message history included. */
  async deleteAllContacts(tenantId: string): Promise<{ deleted: number }> {
    const ids = await this.prisma.contact.findMany({ where: { tenantId }, select: { id: true } });
    return this.deleteContacts(
      tenantId,
      ids.map((c) => c.id),
    );
  }

  /**
   * Until now a list could only come into being through a CSV import, so
   * manually added contacts had no way into one — and a broadcast has nothing
   * to target without a list.
   */
  async createList(tenantId: string, name: string, contactIds: string[] = []) {
    const list = await this.prisma.contactList.create({
      data: { tenantId, name, type: "static" },
    });
    if (contactIds.length > 0) await this.addListMembers(tenantId, list.id, contactIds);
    return this.prisma.contactList.findUniqueOrThrow({
      where: { id: list.id },
      include: { _count: { select: { members: true } } },
    });
  }

  async addListMembers(tenantId: string, listId: string, contactIds: string[]) {
    const list = await this.prisma.contactList.findFirst({ where: { id: listId, tenantId } });
    if (!list) throw new NotFoundException("List not found");

    // Scope the ids to this tenant so a foreign id can't be linked in.
    const owned = await this.prisma.contact.findMany({
      where: { tenantId, id: { in: contactIds } },
      select: { id: true },
    });
    await this.prisma.contactListMember.createMany({
      data: owned.map((c) => ({ contactId: c.id, listId })),
      skipDuplicates: true,
    });

    return this.prisma.contactList.findUniqueOrThrow({
      where: { id: listId },
      include: { _count: { select: { members: true } } },
    });
  }

  async deleteList(tenantId: string, listId: string) {
    const list = await this.prisma.contactList.findFirst({ where: { id: listId, tenantId } });
    if (!list) throw new NotFoundException("List not found");
    // Members cascade; the contacts themselves are left alone.
    await this.prisma.contactList.delete({ where: { id: listId } });
    return { id: listId, deleted: true };
  }

  async createContact(tenantId: string, dto: CreateContactDto) {
    const existing = await this.prisma.contact.findUnique({
      where: { tenantId_whatsappNumber: { tenantId, whatsappNumber: dto.whatsappNumber } },
      select: { id: true },
    });
    if (existing) throw new ConflictException("A contact with this number already exists");

    await this.entitlements.assertCanAdd(tenantId, "contacts");

    const definitions = await this.customFields.listDefinitions(tenantId, "contact");
    const attributes = normalizeCustomFieldValues(definitions, dto.customFields);

    return this.prisma.contact.create({
      // externalId mirrors the number so this contact is reachable by the same
      // channel-agnostic lookup the inbound webhooks use.
      data: {
        tenantId,
        channelType: "whatsapp",
        externalId: dto.whatsappNumber,
        whatsappNumber: dto.whatsappNumber,
        name: dto.name,
        source: "manual",
        attributesJson: attributes,
      },
    });
  }

  listContactLists(tenantId: string) {
    return this.prisma.contactList.findMany({
      where: { tenantId },
      include: { _count: { select: { members: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Imports a CSV into a new list. Beyond phone and name, any column whose
   * header matches one of the workspace's contact fields is imported as that
   * field's answer — so an export can be edited in a spreadsheet and brought
   * back without losing what it holds.
   *
   * Nothing here rejects the file: a value a field cannot hold is dropped and
   * reported, because one bad cell must not cost the operator the other rows.
   */
  async importCsv(tenantId: string, dto: ImportContactsDto) {
    const { rows, totalDataRows, invalidRowCount, duplicateInFileCount, extraHeaders } =
      parseContactsCsv(dto.csvText);

    const definitions = await this.customFields.listDefinitions(tenantId, "contact");
    const { columns, ignoredColumns } = matchColumnsToFields(extraHeaders, definitions);

    const emptyResult = {
      listId: null,
      listName: dto.listName,
      totalDataRows,
      invalidRowCount,
      duplicateInFileCount,
      newContacts: 0,
      existingContactsLinked: 0,
      updatedContacts: 0,
      customFieldColumns: columns.map((c) => ({ column: c.header, field: c.label })),
      ignoredColumns,
      invalidValueCount: 0,
      sampleIssues: [] as string[],
    };
    if (rows.length === 0) return emptyResult;

    const existing = await this.prisma.contact.findMany({
      where: { tenantId, whatsappNumber: { in: rows.map((r) => r.whatsappNumber) } },
      select: { id: true, whatsappNumber: true, attributesJson: true },
    });
    const existingByNumber = new Map(existing.map((c) => [c.whatsappNumber, c]));
    const newRows = rows.filter((r) => !existingByNumber.has(r.whatsappNumber));

    // Checked against the whole batch up front so a too-large import is
    // rejected outright rather than partially applied.
    await this.entitlements.assertCanAdd(tenantId, "contacts", newRows.length);

    // Issues are counted in full but only the first few are worth showing.
    const issues: string[] = [];
    let invalidValueCount = 0;
    const answersFor = (row: (typeof rows)[number], stored: unknown) => {
      if (columns.length === 0) return null;
      const submitted: Record<string, string> = {};
      for (const column of columns) {
        const value = row.extras[column.header];
        if (value !== undefined) submitted[column.key] = value;
      }
      if (Object.keys(submitted).length === 0) return null;

      return normalizeCustomFieldValues(definitions, submitted, {
        existing: asRecord(stored),
        enforceRequired: false,
        onInvalid: (message) => {
          invalidValueCount += 1;
          if (issues.length < 5) issues.push(`${row.whatsappNumber}: ${message}`);
        },
      });
    };

    const list = await this.prisma.contactList.create({
      data: { tenantId, name: dto.listName, type: "static" },
    });

    const createdContacts = await this.prisma.$transaction(
      newRows.map((row) => {
        const attributes = answersFor(row, null);
        return this.prisma.contact.create({
          data: {
            tenantId,
            channelType: "whatsapp",
            externalId: row.whatsappNumber,
            whatsappNumber: row.whatsappNumber,
            name: row.name,
            source: "import",
            ...(attributes ? { attributesJson: attributes } : {}),
          },
        });
      }),
    );

    // An existing contact keeps every answer the file does not carry, so a
    // partial spreadsheet tops a record up rather than hollowing it out.
    const updates = rows
      .map((row) => {
        const match = existingByNumber.get(row.whatsappNumber);
        if (!match) return null;
        const attributes = answersFor(row, match.attributesJson);
        return attributes
          ? this.prisma.contact.update({ where: { id: match.id }, data: { attributesJson: attributes } })
          : null;
      })
      .filter((update): update is NonNullable<typeof update> => update !== null);

    if (updates.length > 0) await this.prisma.$transaction(updates);

    const allContactIds = [
      ...createdContacts.map((c) => c.id),
      ...[...existingByNumber.values()].map((c) => c.id),
    ];
    await this.prisma.contactListMember.createMany({
      data: allContactIds.map((contactId) => ({ contactId, listId: list.id })),
      skipDuplicates: true,
    });

    return {
      ...emptyResult,
      listId: list.id,
      listName: list.name,
      newContacts: createdContacts.length,
      existingContactsLinked: existingByNumber.size,
      updatedContacts: updates.length,
      invalidValueCount,
      sampleIssues: issues,
    };
  }

  async getListWithContacts(tenantId: string, listId: string) {
    const list = await this.prisma.contactList.findFirst({
      where: { id: listId, tenantId },
      include: { members: { include: { contact: true } } },
    });
    if (!list) throw new NotFoundException("List not found");
    return list;
  }
}

/** Prisma hands back JsonValue; only an object shape is usable as an answer map. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

interface MatchedColumn {
  /** The header as normalized by the parser. */
  header: string;
  key: string;
  label: string;
}

/**
 * Matches CSV headers to contact fields by key or by label, ignoring case and
 * punctuation, so "Preferred City" and "preferred_city" both land on the same
 * field. A header matching nothing is reported rather than silently dropped —
 * a misspelt column is the likeliest reason an import "lost" data.
 */
export function matchColumnsToFields(
  headers: string[],
  definitions: CustomFieldDefinition[],
): { columns: MatchedColumn[]; ignoredColumns: string[] } {
  const active = definitions.filter((d) => d.isActive);
  const columns: MatchedColumn[] = [];
  const ignoredColumns: string[] = [];
  const claimed = new Set<string>();

  for (const header of headers) {
    const slug = slugifyFieldKey(header);
    const field = active.find((d) => d.key === slug || slugifyFieldKey(d.label) === slug);

    // First column wins if a file names the same field twice.
    if (!field || claimed.has(field.key)) {
      ignoredColumns.push(header);
      continue;
    }
    claimed.add(field.key);
    columns.push({ header: header.trim().toLowerCase(), key: field.key, label: field.label });
  }

  return { columns, ignoredColumns };
}
