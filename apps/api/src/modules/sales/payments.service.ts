import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@starpos-crm/db";
import { PAYMENT_MODE_LABELS, formatInr, roleAtLeast } from "@starpos-crm/shared";
import { PrismaService } from "../../prisma/prisma.service";
import type { TenantRequestContext } from "../../common/request-context";
import { parseDate } from "../field-sales/activities.service";
import { CreatePaymentDto } from "./dto/sales.dto";

const PAYMENT_INCLUDE = {
  lead: { select: { id: true, name: true, company: true } },
  quotation: { select: { id: true, number: true, totalPaise: true } },
  collectedBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.PaymentInclude;

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  list(
    ctx: TenantRequestContext,
    options: { leadId?: string; quotationId?: string; collector?: string; from?: string; to?: string; take?: number } = {},
  ) {
    const receivedAt: Prisma.DateTimeFilter = {};
    if (options.from) receivedAt.gte = parseDate(options.from, "from");
    if (options.to) receivedAt.lt = parseDate(options.to, "to");
    const collector =
      options.collector === "me" ? ctx.userId || "__nobody__" : options.collector ? options.collector : undefined;

    return this.prisma.payment.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(options.leadId ? { leadId: options.leadId } : {}),
        ...(options.quotationId ? { quotationId: options.quotationId } : {}),
        ...(collector ? { collectedByUserId: collector } : {}),
        ...(options.from || options.to ? { receivedAt } : {}),
      },
      orderBy: { receivedAt: "desc" },
      take: options.take ?? 200,
      include: PAYMENT_INCLUDE,
    });
  }

  async create(ctx: TenantRequestContext, dto: CreatePaymentDto) {
    const lead = await this.prisma.lead.findFirst({ where: { id: dto.leadId, tenantId: ctx.tenantId }, select: { id: true } });
    if (!lead) throw new NotFoundException("Lead not found");
    if (dto.quotationId) {
      const quote = await this.prisma.quotation.findFirst({
        where: { id: dto.quotationId, tenantId: ctx.tenantId },
        select: { leadId: true },
      });
      if (!quote) throw new NotFoundException("Quotation not found");
      if (quote.leadId !== lead.id) throw new BadRequestException("That quotation belongs to a different lead");
    }
    const receivedAt = dto.receivedAt ? new Date(dto.receivedAt) : new Date();
    if (receivedAt.getTime() > Date.now() + 5 * 60_000) {
      throw new BadRequestException("A payment can't be received in the future");
    }

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          tenantId: ctx.tenantId,
          leadId: lead.id,
          quotationId: dto.quotationId ?? null,
          amountPaise: dto.amountPaise,
          mode: dto.mode,
          reference: dto.reference?.trim() || null,
          notes: dto.notes?.trim() || null,
          receivedAt,
          collectedByUserId: ctx.userId || null,
        },
        include: PAYMENT_INCLUDE,
      });
      // Shows on the lead's timeline next to the calls and visits.
      await tx.activity.create({
        data: {
          tenantId: ctx.tenantId,
          leadId: lead.id,
          type: "note",
          status: "completed",
          completedAt: receivedAt,
          title: "Payment received",
          notes: `${formatInr(dto.amountPaise)} by ${PAYMENT_MODE_LABELS[dto.mode]}${
            payment.quotation ? ` against ${payment.quotation.number}` : ""
          }${payment.reference ? ` (ref ${payment.reference})` : ""}.`,
          ownerUserId: ctx.userId || null,
          createdByUserId: ctx.userId || null,
        },
      });
      return payment;
    });
  }

  /** Admins can remove any payment; a rep only one they recorded. */
  async remove(ctx: TenantRequestContext, id: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, collectedByUserId: true },
    });
    if (!payment) throw new NotFoundException("Payment not found");
    if (!roleAtLeast(ctx.role, "admin") && payment.collectedByUserId !== ctx.userId) {
      throw new ForbiddenException("You can only delete payments you recorded");
    }
    await this.prisma.payment.delete({ where: { id } });
    return { id, deleted: true };
  }
}
