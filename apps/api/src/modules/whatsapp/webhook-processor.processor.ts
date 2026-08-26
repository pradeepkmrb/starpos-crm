import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger, forwardRef } from "@nestjs/common";
import { Job } from "bullmq";
import { PrismaService } from "../../prisma/prisma.service";
import { ChannelsService } from "./channels.service";
import { ContactsService } from "../contacts/contacts.service";
import { AutomationEngineService } from "../automations/automation-engine.service";
import {
  MetaInboundMessage,
  MetaStatusUpdate,
  MetaTemplateStatusUpdate,
  MetaWebhookPayload,
} from "./webhook-payload.types";
import { WEBHOOK_QUEUE } from "./whatsapp.constants";
import { mapMetaStatus } from "./templates.service";

/**
 * Runs the actual webhook side-effects: contact upserts, MessageLog writes,
 * delivery-status updates. The controller only ACKs Meta and enqueues here.
 * Automation evaluation on inbound messages is added in Phase 4.
 */
@Processor(WEBHOOK_QUEUE)
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly channelsService: ChannelsService,
    private readonly contactsService: ContactsService,
    @Inject(forwardRef(() => AutomationEngineService))
    private readonly automationEngine: AutomationEngineService,
  ) {
    super();
  }

  async process(job: Job<MetaWebhookPayload>) {
    for (const entry of job.data.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const { value } = change;

        // Template-approval callbacks arrive at the WABA level, not nested
        // under a phone number, so this is handled before the phoneNumberId
        // gate below (and looked up by metaTemplateId, which is unique on
        // Meta's side, rather than needing a WABA-to-channel lookup).
        if (change.field === "message_template_status_update" && value.message_template_id) {
          await this.handleTemplateStatusUpdate(value as MetaTemplateStatusUpdate);
          continue;
        }

        const phoneNumberId = value.metadata?.phone_number_id;
        if (!phoneNumberId) continue;

        const channel = await this.channelsService.findByPhoneNumberId(phoneNumberId);
        if (!channel) {
          this.logger.warn(`No channel found for phone_number_id ${phoneNumberId}`);
          continue;
        }

        for (const message of value.messages ?? []) {
          await this.handleInboundMessage(channel.tenantId, channel.id, message);
        }
        for (const status of value.statuses ?? []) {
          await this.handleStatusUpdate(status);
        }
      }
    }
  }

  private async handleInboundMessage(tenantId: string, channelId: string, message: MetaInboundMessage) {
    const existing = await this.prisma.messageLog.findUnique({ where: { waMessageId: message.id } });
    if (existing) return; // already processed (Meta may redeliver)

    const { contact, isNew } = await this.contactsService.upsertByNumber(tenantId, message.from, {
      markInbound: true,
    });

    await this.prisma.messageLog.create({
      data: {
        tenantId,
        channelId,
        contactId: contact.id,
        direction: "inbound",
        waMessageId: message.id,
        status: "received",
        payloadJson: message as never,
      },
    });

    await this.automationEngine.evaluate({
      tenantId,
      channelId,
      contactId: contact.id,
      messageText: message.text?.body ?? "",
      isNewContact: isNew,
    });
  }

  private async handleStatusUpdate(status: MetaStatusUpdate) {
    const log = await this.prisma.messageLog.findUnique({ where: { waMessageId: status.id } });
    if (!log) {
      this.logger.warn(`Status update for unknown message ${status.id}`);
      return;
    }
    await this.prisma.messageLog.update({
      where: { id: log.id },
      data: { status: status.status, statusUpdatedAt: new Date() },
    });
  }

  private async handleTemplateStatusUpdate(value: MetaTemplateStatusUpdate) {
    const template = await this.prisma.messageTemplate.findFirst({
      where: { metaTemplateId: value.message_template_id },
    });
    if (!template) {
      this.logger.warn(`Template status update for unknown metaTemplateId ${value.message_template_id}`);
      return;
    }
    await this.prisma.messageTemplate.update({
      where: { id: template.id },
      data: { status: mapMetaStatus(value.event ?? "pending") },
    });
  }
}
