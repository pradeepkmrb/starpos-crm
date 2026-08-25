import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Inject,
  Logger,
  Post,
  RawBodyRequest,
  Req,
} from "@nestjs/common";
import { createHash } from "crypto";
import { Request } from "express";
import { PrismaService } from "../../prisma/prisma.service";
import { BillingService } from "./billing.service";
import { PAYMENT_PROVIDER, type PaymentProvider } from "./payment-provider.interface";

interface RazorpayWebhookPayload {
  event: string;
  payload?: {
    subscription?: { entity?: { id: string; status: string; current_start?: number; current_end?: number } };
    invoice?: { entity?: { id: string; subscription_id?: string; amount?: number; status?: string } };
  };
}

@Controller("webhooks/razorpay")
export class RazorpayWebhooksController {
  private readonly logger = new Logger(RazorpayWebhooksController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  @Post()
  async receive(@Req() req: RawBodyRequest<Request>, @Body() payload: RazorpayWebhookPayload) {
    const signature = req.headers["x-razorpay-signature"];
    if (typeof signature !== "string" || !req.rawBody) {
      throw new BadRequestException("Missing webhook signature");
    }
    if (!this.provider.verifyWebhookSignature(req.rawBody, signature)) {
      throw new ForbiddenException("Invalid webhook signature");
    }

    const externalEventId = createHash("sha256").update(req.rawBody).digest("hex");
    const existing = await this.prisma.webhookEvent.findUnique({
      where: { provider_externalEventId: { provider: "razorpay", externalEventId } },
    });
    if (existing) return { received: true, duplicate: true };

    // Unlike the Meta webhook (which enqueues to Redis and so records its
    // dedupe row only after a successful enqueue), billing events are
    // handled inline in the same transaction-less request — so recording
    // after successful handling keeps the retry-safe ordering.
    await this.dispatch(payload);

    await this.prisma.webhookEvent.create({
      data: {
        provider: "razorpay",
        externalEventId,
        rawPayloadJson: payload as never,
        processedAt: new Date(),
      },
    });
    return { received: true };
  }

  private async dispatch(payload: RazorpayWebhookPayload) {
    const subscription = payload.payload?.subscription?.entity;
    const invoice = payload.payload?.invoice?.entity;

    switch (payload.event) {
      case "subscription.activated":
      case "subscription.resumed":
        if (subscription) await this.billingService.handleSubscriptionActivated(subscription);
        break;
      case "subscription.charged":
        if (subscription) await this.billingService.handleSubscriptionCharged(subscription, invoice);
        break;
      case "subscription.pending":
      case "subscription.halted":
        if (subscription) await this.billingService.handleSubscriptionPaymentFailed(subscription);
        break;
      case "subscription.cancelled":
      case "subscription.completed":
        if (subscription) await this.billingService.handleSubscriptionCancelled(subscription);
        break;
      default:
        this.logger.log(`Ignoring unhandled Razorpay event: ${payload.event}`);
    }
  }
}
