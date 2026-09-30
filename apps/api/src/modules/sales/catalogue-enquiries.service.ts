import { BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import { FULL_ACCESS, formatInr } from "@starpos-crm/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { normalizeWhatsappNumber } from "../../common/phone";
import { PushService } from "../push/push.service";
import { QuotationsService } from "./quotations.service";
import { CatalogueEnquiryDto } from "./dto/catalogue-enquiry.dto";

/** Per shopper: a few genuine requests, not a flood. */
const PER_CLIENT_LIMIT = { max: 5, windowMs: 10 * 60_000 };
/** Per workspace: caps how many leads a script could inject through one link. */
const PER_TENANT_LIMIT = { max: 60, windowMs: 60 * 60_000 };

/** In-memory sliding window — enough for one API instance guarding a public form. */
class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly limit: { max: number; windowMs: number }) {}

  take(key: string): boolean {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.limit.windowMs);
    if (recent.length >= this.limit.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.prune(now);
    return true;
  }

  private prune(now: number) {
    for (const [key, times] of this.hits) {
      if (times.every((t) => now - t >= this.limit.windowMs)) this.hits.delete(key);
    }
  }
}

const digits = (phone: string) => phone.replace(/\D/g, "");

/**
 * A shopper's "request a quote" from the public catalogue. It lands in the
 * CRM as a lead (an open one with the same phone number is reused), a draft
 * quotation with the requested quantities, and a note on the lead's timeline,
 * and the team is notified so someone follows up.
 */
@Injectable()
export class CatalogueEnquiriesService {
  private readonly perClient = new RateLimiter(PER_CLIENT_LIMIT);
  private readonly perTenant = new RateLimiter(PER_TENANT_LIMIT);

  constructor(
    private readonly prisma: PrismaService,
    private readonly quotations: QuotationsService,
    private readonly push: PushService,
  ) {}

  async submit(slug: string, dto: CatalogueEnquiryDto, clientKey: string) {
    // Bots fill every field; people never see this one. Pretend it worked.
    if (dto.website?.trim()) return { ok: true as const, reference: null };

    if (!this.perClient.take(`${slug}:${clientKey}`)) {
      throw new HttpException("Too many requests — please try again in a few minutes", HttpStatus.TOO_MANY_REQUESTS);
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { slug }, select: { id: true, status: true } });
    if (!tenant || tenant.status !== "active") throw new NotFoundException("Catalogue not found");

    if (!this.perTenant.take(tenant.id)) {
      throw new HttpException("This catalogue is busy — please try again later", HttpStatus.TOO_MANY_REQUESTS);
    }

    const phone = normalizeWhatsappNumber(dto.phone);
    if (!phone) throw new BadRequestException("Enter a valid phone number");

    // Merge repeated lines for the same product; every product must be this tenant's.
    const quantities = new Map<string, number>();
    for (const item of dto.items) quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
    const products = await this.prisma.product.findMany({
      where: { tenantId: tenant.id, id: { in: [...quantities.keys()] } },
      select: { id: true, name: true },
    });
    if (products.length !== quantities.size) {
      throw new BadRequestException("Some products are no longer in the catalogue — refresh the page and try again");
    }
    const names = new Map(products.map((p) => [p.id, p.name]));

    const lead = await this.findOrCreateLead(tenant.id, dto, phone);
    const message = dto.message?.trim() || null;

    const quotation = await this.quotations.create(
      // Acts for the workspace, like an API key: the shopper has no role.
      { tenantId: tenant.id, userId: "", role: "owner", permissions: FULL_ACCESS, dataScope: "all" },
      {
        leadId: lead.id,
        items: [...quantities].map(([productId, quantity]) => ({ productId, quantity })),
        notes: message ? `Customer's note: ${message}` : null,
      },
    );

    const lines = [...quantities].map(([productId, quantity]) => `${quantity} × ${names.get(productId)}`);
    await this.prisma.activity.create({
      data: {
        tenantId: tenant.id,
        leadId: lead.id,
        type: "note",
        status: "completed",
        completedAt: new Date(),
        title: "Quote requested from the catalogue",
        notes: [
          ...lines,
          `Draft quotation ${quotation.number} (${formatInr(quotation.totalPaise)}) is ready to review and send.`,
          ...(message ? ["", `Customer's note: ${message}`] : []),
        ].join("\n"),
        ownerUserId: lead.ownerUserId,
      },
    });
    if (lead.valuePaise === null) {
      await this.prisma.lead.update({ where: { id: lead.id }, data: { valuePaise: quotation.totalPaise } });
    }

    void this.notifyTeam(tenant.id, lead, lines.length, quotation.totalPaise);
    return { ok: true as const, reference: quotation.number };
  }

  /** Reuses the newest open lead with this phone number, so a returning shopper isn't duplicated. */
  private async findOrCreateLead(tenantId: string, dto: CatalogueEnquiryDto, phone: string) {
    const tail = phone.slice(-10);
    const candidates = await this.prisma.lead.findMany({
      where: { tenantId, status: { notIn: ["won", "lost"] }, phone: { contains: tail.slice(-4) } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, phone: true, ownerUserId: true, valuePaise: true },
      take: 50,
    });
    const existing = candidates.find((c) => c.phone && digits(c.phone).endsWith(tail));
    if (existing) return existing;

    return this.prisma.lead.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        phone: dto.phone.trim(),
        email: dto.email?.trim() || null,
        company: dto.company?.trim() || null,
        source: "catalogue",
        status: "new",
      },
      select: { id: true, name: true, phone: true, ownerUserId: true, valuePaise: true },
    });
  }

  /** The lead's owner if it has one; otherwise the workspace's owners and admins. */
  private async notifyTeam(
    tenantId: string,
    lead: { id: string; name: string; ownerUserId: string | null },
    itemCount: number,
    totalPaise: number,
  ) {
    const recipients = lead.ownerUserId
      ? [lead.ownerUserId]
      : (
          await this.prisma.tenantMembership.findMany({
            where: { tenantId, status: "active", role: { in: ["owner", "admin"] } },
            select: { userId: true },
          })
        ).map((m) => m.userId);
    await this.push.notifyUsers(tenantId, recipients, {
      title: "New quote request",
      body: `${lead.name} · ${itemCount} ${itemCount === 1 ? "item" : "items"} · ${formatInr(totalPaise)}`,
      url: `/lead/${lead.id}`,
    });
  }
}
