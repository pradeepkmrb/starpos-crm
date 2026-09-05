import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { parseContactsCsv } from "./csv-parser";
import { ImportContactsDto } from "./dto/import-contacts.dto";
import { CreateContactDto } from "./dto/create-contact.dto";

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /**
   * Minimal upsert-by-number used by both outbound sends (Phase 2 test-send)
   * and inbound webhook processing.
   */
  async upsertByNumber(
    tenantId: string,
    whatsappNumber: string,
    opts: { name?: string; markInbound?: boolean } = {},
  ) {
    // Existence is checked first so callers can tell a brand-new contact from
    // a returning one — the inbound webhook path needs this to fire "welcome"
    // automations exactly once.
    const existing = await this.prisma.contact.findUnique({
      where: { tenantId_whatsappNumber: { tenantId, whatsappNumber } },
      select: { id: true },
    });

    const contact = await this.prisma.contact.upsert({
      where: { tenantId_whatsappNumber: { tenantId, whatsappNumber } },
      update: opts.markInbound ? { lastInboundAt: new Date() } : {},
      create: {
        tenantId,
        whatsappNumber,
        name: opts.name,
        source: "manual",
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

  async createContact(tenantId: string, dto: CreateContactDto) {
    const existing = await this.prisma.contact.findUnique({
      where: { tenantId_whatsappNumber: { tenantId, whatsappNumber: dto.whatsappNumber } },
      select: { id: true },
    });
    if (existing) throw new ConflictException("A contact with this number already exists");

    await this.entitlements.assertCanAdd(tenantId, "contacts");

    return this.prisma.contact.create({
      data: { tenantId, whatsappNumber: dto.whatsappNumber, name: dto.name, source: "manual" },
    });
  }

  listContactLists(tenantId: string) {
    return this.prisma.contactList.findMany({
      where: { tenantId },
      include: { _count: { select: { members: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async importCsv(tenantId: string, dto: ImportContactsDto) {
    const { rows, totalDataRows, invalidRowCount, duplicateInFileCount } = parseContactsCsv(
      dto.csvText,
    );

    if (rows.length === 0) {
      return {
        listId: null,
        listName: dto.listName,
        totalDataRows,
        invalidRowCount,
        duplicateInFileCount,
        newContacts: 0,
        existingContactsLinked: 0,
      };
    }

    const existing = await this.prisma.contact.findMany({
      where: { tenantId, whatsappNumber: { in: rows.map((r) => r.whatsappNumber) } },
      select: { id: true, whatsappNumber: true },
    });
    const existingByNumber = new Map(existing.map((c) => [c.whatsappNumber, c.id]));
    const newRows = rows.filter((r) => !existingByNumber.has(r.whatsappNumber));

    // Checked against the whole batch up front so a too-large import is
    // rejected outright rather than partially applied.
    await this.entitlements.assertCanAdd(tenantId, "contacts", newRows.length);

    const list = await this.prisma.contactList.create({
      data: { tenantId, name: dto.listName, type: "static" },
    });

    const createdContacts = await this.prisma.$transaction(
      newRows.map((row) =>
        this.prisma.contact.create({
          data: { tenantId, whatsappNumber: row.whatsappNumber, name: row.name, source: "import" },
        }),
      ),
    );

    const allContactIds = [...createdContacts.map((c) => c.id), ...existingByNumber.values()];
    await this.prisma.contactListMember.createMany({
      data: allContactIds.map((contactId) => ({ contactId, listId: list.id })),
      skipDuplicates: true,
    });

    return {
      listId: list.id,
      listName: list.name,
      totalDataRows,
      invalidRowCount,
      duplicateInFileCount,
      newContacts: createdContacts.length,
      existingContactsLinked: existingByNumber.size,
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
