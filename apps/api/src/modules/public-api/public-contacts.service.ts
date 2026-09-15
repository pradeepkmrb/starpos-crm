import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@digitel/db";
import { PrismaService } from "../../prisma/prisma.service";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { windowExpiresAt, windowIsOpen } from "../whatsapp/inbox.service";
import { normalizeWhatsappNumber } from "../../common/phone";
import { UpdateContactApiDto, UpsertContactDto } from "./dto/upsert-contact.dto";

const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 50;

/**
 * Read and write access to the workspace's audience over the public API.
 * Deleting is deliberately absent: erasing a contact here also erases their
 * whole delivery history (see ContactsService.deleteContacts), which is not
 * something an integration should be able to do by accident.
 */
@Injectable()
export class PublicContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /**
   * Cursor pagination on contact id. Keyset rather than offset, so a page
   * stays stable while contacts are being added underneath it.
   */
  async list(
    tenantId: string,
    query: { limit?: string; cursor?: string; search?: string; listId?: string; optedIn?: string },
  ) {
    const take = clampLimit(query.limit);

    const where: Prisma.ContactWhereInput = { tenantId };
    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { whatsappNumber: { contains: normalizeWhatsappNumber(term) ?? term } },
        { name: { contains: term, mode: "insensitive" } },
        { email: { contains: term, mode: "insensitive" } },
      ];
    }
    if (query.listId) where.listMemberships = { some: { listId: query.listId } };
    if (query.optedIn !== undefined) where.optedIn = query.optedIn === "true";

    const rows = await this.prisma.contact.findMany({
      where,
      orderBy: { id: "asc" },
      // One extra row tells us whether another page exists without a count.
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: { labels: { select: { label: { select: { id: true, name: true, color: true } } } } },
    });

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;

    return {
      data: page.map(serializeContact),
      nextCursor: hasMore ? page[page.length - 1].id : null,
      hasMore,
    };
  }

  async get(tenantId: string, id: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { tenantId, id },
      include: { labels: { select: { label: { select: { id: true, name: true, color: true } } } } },
    });
    if (!contact) throw new NotFoundException("Contact not found");
    return serializeContact(contact);
  }

  /** Lookup by phone number, so a caller holding only a number need not search. */
  async getByNumber(tenantId: string, rawNumber: string) {
    const whatsappNumber = requireNumber(rawNumber);
    const contact = await this.prisma.contact.findUnique({
      where: { tenantId_whatsappNumber: { tenantId, whatsappNumber } },
      include: { labels: { select: { label: { select: { id: true, name: true, color: true } } } } },
    });
    if (!contact) throw new NotFoundException("Contact not found");
    return serializeContact(contact);
  }

  /**
   * Create-or-update on the phone number, which is what an integration
   * syncing its own CRM actually wants — repeated calls converge rather than
   * conflicting.
   */
  async upsert(tenantId: string, dto: UpsertContactDto) {
    const whatsappNumber = requireNumber(dto.whatsappNumber);

    const existing = await this.prisma.contact.findUnique({
      where: { tenantId_whatsappNumber: { tenantId, whatsappNumber } },
      select: { id: true },
    });
    if (!existing) await this.entitlements.assertCanAdd(tenantId, "contacts");

    const writable = {
      ...(dto.name !== undefined ? { name: dto.name || null } : {}),
      ...(dto.email !== undefined ? { email: dto.email || null } : {}),
      ...(dto.languageCode !== undefined ? { languageCode: dto.languageCode || null } : {}),
      ...(dto.optedIn !== undefined ? { optedIn: dto.optedIn } : {}),
      ...(dto.attributes !== undefined ? { attributesJson: dto.attributes as Prisma.InputJsonValue } : {}),
    };

    const contact = await this.prisma.contact.upsert({
      where: { tenantId_whatsappNumber: { tenantId, whatsappNumber } },
      update: writable,
      create: { tenantId, whatsappNumber, source: "api", ...writable },
      include: { labels: { select: { label: { select: { id: true, name: true, color: true } } } } },
    });

    return { ...serializeContact(contact), created: !existing };
  }

  async update(tenantId: string, id: string, dto: UpdateContactApiDto) {
    const existing = await this.prisma.contact.findFirst({ where: { tenantId, id }, select: { id: true } });
    if (!existing) throw new NotFoundException("Contact not found");

    // Only the keys actually sent are written, so a partial update cannot
    // blank the fields it left out.
    const data = {
      ...(dto.name !== undefined ? { name: dto.name || null } : {}),
      ...(dto.email !== undefined ? { email: dto.email || null } : {}),
      ...(dto.languageCode !== undefined ? { languageCode: dto.languageCode || null } : {}),
      ...(dto.optedIn !== undefined ? { optedIn: dto.optedIn } : {}),
      ...(dto.botEnabled !== undefined ? { botEnabled: dto.botEnabled } : {}),
      ...(dto.attributes !== undefined ? { attributesJson: dto.attributes as Prisma.InputJsonValue } : {}),
    };
    if (Object.keys(data).length === 0) throw new BadRequestException("No fields to update");

    const contact = await this.prisma.contact.update({
      where: { id },
      data,
      include: { labels: { select: { label: { select: { id: true, name: true, color: true } } } } },
    });
    return serializeContact(contact);
  }

  listLists(tenantId: string) {
    return this.prisma.contactList
      .findMany({
        where: { tenantId },
        include: { _count: { select: { members: true } } },
        orderBy: { createdAt: "desc" },
      })
      .then((lists) =>
        lists.map((list) => ({
          id: list.id,
          name: list.name,
          type: list.type,
          contactCount: list._count.members,
          createdAt: list.createdAt,
        })),
      );
  }
}

function requireNumber(raw: string): string {
  const normalized = normalizeWhatsappNumber(raw);
  if (!normalized) {
    throw new BadRequestException(
      `"${raw}" is not a valid phone number. Use international format, e.g. +919876543210.`,
    );
  }
  return normalized;
}

function clampLimit(raw?: string): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(parsed), MAX_PAGE_SIZE);
}

interface ContactRow {
  id: string;
  whatsappNumber: string;
  name: string | null;
  email: string | null;
  languageCode: string | null;
  optedIn: boolean;
  botEnabled: boolean;
  source: string | null;
  attributesJson: unknown;
  lastInboundAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  labels?: { label: { id: string; name: string; color: string } }[];
}

/**
 * The public shape of a contact. Flattens the label join and adds the
 * 24-hour window state, which is the field that decides whether a free-form
 * send to this contact will succeed.
 */
function serializeContact(contact: ContactRow) {
  return {
    id: contact.id,
    whatsappNumber: contact.whatsappNumber,
    name: contact.name,
    email: contact.email,
    languageCode: contact.languageCode,
    optedIn: contact.optedIn,
    botEnabled: contact.botEnabled,
    source: contact.source,
    attributes: contact.attributesJson ?? null,
    labels: (contact.labels ?? []).map((cl) => cl.label),
    lastInboundAt: contact.lastInboundAt,
    sessionWindowOpen: windowIsOpen(contact.lastInboundAt),
    sessionWindowExpiresAt: windowExpiresAt(contact.lastInboundAt),
    createdAt: contact.createdAt,
    updatedAt: contact.updatedAt,
  };
}
