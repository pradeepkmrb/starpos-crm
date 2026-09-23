import { BadRequestException, Body, Controller, ForbiddenException, Get, Post, Query, RawBodyRequest, Req } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { Request } from "express";
import { PrismaService } from "../../prisma/prisma.service";
import { withTimeout } from "../../common/with-timeout";
import { PlatformSettingsService } from "../platform/platform-settings.service";
import { MetaWebhookPayload } from "./webhook-payload.types";
import { WEBHOOK_QUEUE } from "./whatsapp.constants";

@Controller("webhooks/meta")
export class WebhooksController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformSettings: PlatformSettingsService,
    @InjectQueue(WEBHOOK_QUEUE) private readonly webhookQueue: Queue,
  ) {}

  /** Meta's one-time subscription challenge when the webhook URL is registered. */
  @Get()
  verifyChallenge(
    @Query("hub.mode") mode: string,
    @Query("hub.verify_token") token: string,
    @Query("hub.challenge") challenge: string,
  ) {
    if (mode !== "subscribe" || token !== process.env.META_WEBHOOK_VERIFY_TOKEN) {
      throw new ForbiddenException("Invalid verify token");
    }
    return challenge;
  }

  @Post()
  async receive(@Req() req: RawBodyRequest<Request>, @Body() payload: MetaWebhookPayload) {
    await this.verifySignature(req);

    const externalEventId = createHash("sha256").update(req.rawBody ?? Buffer.from("")).digest("hex");

    const existing = await this.prisma.webhookEvent.findUnique({
      where: { provider_externalEventId: { provider: "meta", externalEventId } },
    });
    if (existing) {
      // Meta retries webhook deliveries; already recorded, ack without reprocessing.
      return { received: true, duplicate: true };
    }

    // Enqueue BEFORE recording the dedupe row: if the queue is unreachable
    // (e.g. Redis down) this throws instead of hanging, and since nothing
    // was recorded, Meta's automatic redelivery will retry cleanly rather
    // than being silently swallowed by the dedupe check above.
    await withTimeout(this.webhookQueue.add("process", payload), 5000, "Webhook queue unavailable");

    await this.prisma.webhookEvent.create({
      data: { provider: "meta", externalEventId, rawPayloadJson: payload as never },
    });
    return { received: true };
  }

  /**
   * The same app secret used for the Embedded Signup OAuth exchange — set
   * once in Platform Admin and stored encrypted in the database, not as an
   * env var, since it is a platform-wide credential the agency configures
   * through the UI rather than at deploy time.
   */
  private async verifySignature(req: RawBodyRequest<Request>) {
    const signatureHeader = req.headers["x-hub-signature-256"];
    const secret = await this.platformSettings.getDecryptedAppSecret();
    if (!secret || typeof signatureHeader !== "string" || !req.rawBody) {
      throw new BadRequestException("Missing webhook signature");
    }
    const expected =
      "sha256=" + createHmac("sha256", secret).update(req.rawBody).digest("hex");

    const a = Buffer.from(expected);
    const b = Buffer.from(signatureHeader);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ForbiddenException("Invalid webhook signature");
    }
  }
}
