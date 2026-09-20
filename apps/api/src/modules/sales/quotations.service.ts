import { randomBytes } from "crypto";
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@digitel/db";
import {
  QUOTATION_STATUSES,
  QUOTATION_STATUS_LABELS,
  formatInr,
  quoteTotals,
  roleAtLeast,
  type LeadStatus,
  type QuotationStatus,
} from "@digitel/shared";
import { PrismaService } from "../../prisma/prisma.service";
import type { TenantRequestContext } from "../../common/request-context";
import { normalizeWhatsappNumber } from "../../common/phone";
import { MetaGraphClient } from "../whatsapp/meta-graph.client";
import { ChannelsService } from "../whatsapp/channels.service";
import { windowIsOpen } from "../whatsapp/inbox.service";
import { MessageLogService } from "../messages/message-log.service";
import { closedAtForStatusChange } from "../field-sales/activity-rules";
import { BusinessProfileDto, CreateQuotationDto, QuotationItemDto, UpdateQuotationDto } from "./dto/sales.dto";
import {
  canMoveQuotation,
  formatQuoteNumber,
  parseBusinessProfile,
  stageImpliedByQuotation,
  whatsappShareLink,
  type BusinessProfile,
} from "./sales-rules";

const QUOTATION_INCLUDE = {
  lead: { select: { id: true, name: true, company: true, phone: true, email: true, address: true, status: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  items: { orderBy: { position: "asc" } },
  payments: { select: { amountPaise: true } },
} satisfies Prisma.QuotationInclude;

type QuotationWithRelations = Prisma.QuotationGetPayload<{ include: typeof QUOTATION_INCLUDE }>;

/** API shape: Decimal tax rates become numbers, and paid/balance are worked out. */
function present(q: QuotationWithRelations) {
  const paidPaise = q.payments.reduce((sum, p) => sum + p.amountPaise, 0);
  const { payments: _payments, items, ...rest } = q;
  return {
    ...rest,
    items: items.map((i) => ({ ...i, taxPercent: i.taxPercent.toNumber() })),
    paidPaise,
    balancePaise: Math.max(0, q.totalPaise - paidPaise),
  };
}

export type SendResult =
  | { delivered: true; quotation: ReturnType<typeof present> }
  | {
      delivered: false;
      /** Why the business number couldn't send it; the rep can share the link instead. */
      reason: "no_phone" | "no_whatsapp_channel" | "window_closed";
      message: string;
      pdfUrl: string;
      shareLink: string | null;
    };

@Injectable()
export class QuotationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly graph: MetaGraphClient,
    private readonly channels: ChannelsService,
    private readonly messageLogs: MessageLogService,
  ) {}

  async list(ctx: TenantRequestContext, options: { leadId?: string; status?: string; take?: number } = {}) {
    const rows = await this.prisma.quotation.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(options.leadId ? { leadId: options.leadId } : {}),
        ...((QUOTATION_STATUSES as readonly string[]).includes(options.status ?? "")
          ? { status: options.status as QuotationStatus }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: options.take ?? 200,
      include: QUOTATION_INCLUDE,
    });
    return rows.map(present);
  }

  async get(ctx: TenantRequestContext, id: string) {
    const q = await this.prisma.quotation.findFirst({ where: { id, tenantId: ctx.tenantId }, include: QUOTATION_INCLUDE });
    if (!q) throw new NotFoundException("Quotation not found");
    return present(q);
  }

  async create(ctx: TenantRequestContext, dto: CreateQuotationDto) {
    const lead = await this.prisma.lead.findFirst({ where: { id: dto.leadId, tenantId: ctx.tenantId }, select: { id: true } });
    if (!lead) throw new NotFoundException("Lead not found");
    const items = await this.resolveItems(ctx.tenantId, dto.items);
    const totals = quoteTotals(items, dto.discountPaise ?? 0);
    const profile = await this.profile(ctx.tenantId);
    const validUntil =
      dto.validUntil !== undefined
        ? dto.validUntil && new Date(dto.validUntil)
        : profile.validityDays
          ? new Date(Date.now() + profile.validityDays * 86_400_000)
          : null;

    return this.prisma.$transaction(async (tx) => {
      // The counter lives on the tenant row, so concurrent quotes can't share a number.
      const { quotationSeq } = await tx.tenant.update({
        where: { id: ctx.tenantId },
        data: { quotationSeq: { increment: 1 } },
        select: { quotationSeq: true },
      });
      const q = await tx.quotation.create({
        data: {
          tenantId: ctx.tenantId,
          leadId: lead.id,
          number: formatQuoteNumber(quotationSeq),
          subtotalPaise: totals.subtotalPaise,
          discountPaise: totals.discountPaise,
          taxPaise: totals.taxPaise,
          totalPaise: totals.totalPaise,
          validUntil: validUntil || null,
          notes: dto.notes?.trim() || null,
          shareToken: randomBytes(18).toString("base64url"),
          createdByUserId: ctx.userId || null,
          items: {
            create: items.map((item, position) => ({ ...item, taxPercent: new Prisma.Decimal(item.taxPercent), position })),
          },
        },
        include: QUOTATION_INCLUDE,
      });
      return present(q);
    });
  }

  async update(ctx: TenantRequestContext, id: string, dto: UpdateQuotationDto) {
    const existing = await this.prisma.quotation.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { lead: { select: { id: true, status: true } } },
    });
    if (!existing) throw new NotFoundException("Quotation not found");

    const editsContent = dto.items !== undefined || dto.discountPaise !== undefined;
    if (editsContent && existing.status !== "draft") {
      throw new BadRequestException("Only a draft can be changed. Create a new quotation instead.");
    }
    if (dto.status !== undefined && !canMoveQuotation(existing.status, dto.status)) {
      throw new BadRequestException(
        `A ${QUOTATION_STATUS_LABELS[existing.status].toLowerCase()} quotation can't be marked ${QUOTATION_STATUS_LABELS[dto.status].toLowerCase()}`,
      );
    }

    const data: Prisma.QuotationUpdateInput = {};
    let items: ResolvedItem[] | null = null;
    if (editsContent) {
      items =
        dto.items !== undefined
          ? await this.resolveItems(ctx.tenantId, dto.items)
          : (
              await this.prisma.quotationItem.findMany({ where: { quotationId: id }, orderBy: { position: "asc" } })
            ).map((i) => ({ ...i, taxPercent: i.taxPercent.toNumber() }));
      const totals = quoteTotals(items, dto.discountPaise ?? existing.discountPaise);
      Object.assign(data, {
        subtotalPaise: totals.subtotalPaise,
        discountPaise: totals.discountPaise,
        taxPaise: totals.taxPaise,
        totalPaise: totals.totalPaise,
      });
    }
    if (dto.validUntil !== undefined) data.validUntil = dto.validUntil ? new Date(dto.validUntil) : null;
    if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;
    if (dto.status !== undefined) {
      data.status = dto.status;
      if (dto.status === "sent") data.sentAt = existing.sentAt ?? new Date();
      if (dto.status === "accepted" || dto.status === "rejected") data.respondedAt = new Date();
    }

    return this.prisma.$transaction(async (tx) => {
      if (items && dto.items !== undefined) {
        await tx.quotationItem.deleteMany({ where: { quotationId: id } });
        await tx.quotationItem.createMany({
          data: items.map((item, position) => ({
            ...item,
            quotationId: id,
            taxPercent: new Prisma.Decimal(item.taxPercent),
            position,
          })),
        });
      }
      const q = await tx.quotation.update({ where: { id }, data, include: QUOTATION_INCLUDE });
      if (dto.status !== undefined) {
        await this.onStatusChange(tx, ctx, existing.lead, q, dto.status);
      }
      return present(q);
    });
  }

  /** Drafts can be discarded by whoever made them; anything already sent needs an admin. */
  async remove(ctx: TenantRequestContext, id: string) {
    const q = await this.prisma.quotation.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, status: true, createdByUserId: true },
    });
    if (!q) throw new NotFoundException("Quotation not found");
    const isAdmin = roleAtLeast(ctx.role, "admin");
    if (!isAdmin && (q.status !== "draft" || q.createdByUserId !== ctx.userId)) {
      throw new ForbiddenException("Only an admin can delete a quotation that has been sent");
    }
    await this.prisma.quotation.delete({ where: { id } });
    return { id, deleted: true };
  }

  /**
   * Sends the PDF from the business WhatsApp number when the customer's
   * 24-hour window is open. Otherwise nothing is sent and the caller gets a
   * click-to-chat link, so the rep can forward it from their own WhatsApp.
   */
  async send(ctx: TenantRequestContext, id: string, publicBaseUrl: string): Promise<SendResult> {
    const q = await this.prisma.quotation.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { lead: { select: { name: true, company: true, phone: true } }, tenant: { select: { name: true } } },
    });
    if (!q) throw new NotFoundException("Quotation not found");

    const pdfUrl = this.pdfUrl(publicBaseUrl, q.shareToken);
    const caption = `Quotation ${q.number} from ${q.tenant.name} — ${formatInr(q.totalPaise)}`;
    const digits = q.lead.phone ? normalizeWhatsappNumber(q.lead.phone) : null;
    const shareLink = digits ? whatsappShareLink(digits, `${caption}\n${pdfUrl}`) : null;
    if (!digits) {
      return { delivered: false, reason: "no_phone", message: "This lead has no valid mobile number.", pdfUrl, shareLink };
    }

    const contact = await this.prisma.contact.findFirst({
      where: { tenantId: ctx.tenantId, channelType: "whatsapp", externalId: digits },
    });
    if (!contact || !windowIsOpen("whatsapp", contact.lastInboundAt)) {
      return {
        delivered: false,
        reason: "window_closed",
        message:
          "WhatsApp only lets your business number send documents within 24 hours of the customer's last message. Share it from your own WhatsApp instead.",
        pdfUrl,
        shareLink,
      };
    }

    const channelRow = await this.prisma.channel.findFirst({
      where: { tenantId: ctx.tenantId, type: "whatsapp", status: "active" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!channelRow) {
      return {
        delivered: false,
        reason: "no_whatsapp_channel",
        message: "No WhatsApp number is connected. Share it from your own WhatsApp instead.",
        pdfUrl,
        shareLink,
      };
    }
    const channel = await this.channels.getChannelWithCredentials(ctx.tenantId, channelRow.id);
    const { waMessageId } = await this.graph.sendMediaMessage(channel, digits, "document", {
      link: pdfUrl,
      filename: `${q.number}.pdf`,
      caption,
    });
    await this.messageLogs.recordOutbound({
      tenantId: ctx.tenantId,
      channelId: channel.id,
      contactId: contact.id,
      waMessageId,
      payload: { type: "document", body: caption, link: pdfUrl },
    });

    const quotation = q.status === "draft" || q.status === "rejected" ? await this.update(ctx, id, { status: "sent" }) : await this.get(ctx, id);
    return { delivered: true, quotation };
  }

  /** The quote plus everything needed to print it — used by the public PDF link. */
  async forPdf(shareToken: string) {
    const q = await this.prisma.quotation.findUnique({
      where: { shareToken },
      include: {
        items: { orderBy: { position: "asc" } },
        lead: { select: { name: true, company: true, phone: true, email: true, address: true } },
        tenant: { select: { name: true, businessProfileJson: true } },
      },
    });
    if (!q) throw new NotFoundException("Quotation not found");
    return {
      ...q,
      items: q.items.map((i) => ({ ...i, taxPercent: i.taxPercent.toNumber() })),
      profile: parseBusinessProfile(q.tenant.businessProfileJson),
    };
  }

  pdfUrl(publicBaseUrl: string, shareToken: string) {
    return `${publicBaseUrl.replace(/\/$/, "")}/public/quotations/${shareToken}/pdf`;
  }

  async profile(tenantId: string): Promise<BusinessProfile> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { businessProfileJson: true } });
    return parseBusinessProfile(tenant?.businessProfileJson);
  }

  async saveProfile(tenantId: string, dto: BusinessProfileDto) {
    const profile = parseBusinessProfile({ ...dto });
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { businessProfileJson: profile as Prisma.InputJsonValue },
    });
    return profile;
  }

  /** Lead stage and timeline follow the quote: sent → proposal, accepted → won at the quote's value. */
  private async onStatusChange(
    tx: Prisma.TransactionClient,
    ctx: TenantRequestContext,
    lead: { id: string; status: LeadStatus },
    q: { number: string; totalPaise: number },
    status: QuotationStatus,
  ) {
    const next = stageImpliedByQuotation(lead.status, status);
    if (next) {
      const closedAt = closedAtForStatusChange(lead.status, next);
      await tx.lead.update({
        where: { id: lead.id },
        data: {
          status: next,
          ...(closedAt !== undefined ? { closedAt } : {}),
          ...(status === "accepted" ? { valuePaise: q.totalPaise } : {}),
        },
      });
    }
    await tx.activity.create({
      data: {
        tenantId: ctx.tenantId,
        leadId: lead.id,
        type: "note",
        status: "completed",
        completedAt: new Date(),
        title: `Quotation ${q.number} ${QUOTATION_STATUS_LABELS[status].toLowerCase()}`,
        notes: `Quotation ${q.number} (${formatInr(q.totalPaise)}) marked ${QUOTATION_STATUS_LABELS[status].toLowerCase()}.`,
        ownerUserId: ctx.userId || null,
        createdByUserId: ctx.userId || null,
      },
    });
  }

  /** Fills catalogue lines from the product, keeping any price or tax the rep overrode. */
  private async resolveItems(tenantId: string, items: QuotationItemDto[]): Promise<ResolvedItem[]> {
    const ids = [...new Set(items.map((i) => i.productId).filter((id): id is string => !!id))];
    const products = ids.length
      ? await this.prisma.product.findMany({ where: { tenantId, id: { in: ids } } })
      : [];
    const byId = new Map(products.map((p) => [p.id, p]));

    return items.map((item, i) => {
      const product = item.productId ? byId.get(item.productId) : undefined;
      if (item.productId && !product) throw new BadRequestException(`Line ${i + 1}: that product isn't in your catalogue`);
      const name = item.name?.trim() || product?.name;
      if (!name) throw new BadRequestException(`Line ${i + 1} needs a name`);
      const unitPricePaise =
        item.unitPricePaise ?? (product ? Math.round(product.price.toNumber() * 100) : undefined);
      if (unitPricePaise === undefined) throw new BadRequestException(`Line ${i + 1} needs a price`);
      return {
        productId: product?.id ?? null,
        name,
        description: item.description?.trim() || product?.description || null,
        quantity: item.quantity,
        unitPricePaise,
        taxPercent: item.taxPercent ?? (product ? product.taxPercent.toNumber() : 0),
      };
    });
  }
}

interface ResolvedItem {
  productId: string | null;
  name: string;
  description: string | null;
  quantity: number;
  unitPricePaise: number;
  taxPercent: number;
}
