import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger, forwardRef } from "@nestjs/common";
import { Job } from "bullmq";
import type { ChannelType } from "@digitel/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { ChannelsService } from "./channels.service";
import { ContactsService } from "../contacts/contacts.service";
import { ChannelConnectionsService } from "../channels/channel-connections.service";
import { MessengerClient } from "../channels/messenger.client";
import { AutomationEngineService } from "../automations/automation-engine.service";
import { MetaLeadsService } from "../crm/meta-leads.service";
import {
  MetaInboundMessage,
  MetaLeadgenNotification,
  MetaMessagingEvent,
  MetaStatusUpdate,
  MetaTemplateStatusUpdate,
  MetaWebhookPayload,
} from "./webhook-payload.types";
import { WEBHOOK_QUEUE } from "./whatsapp.constants";
import { mapMetaStatus } from "./templates.service";

/**
 * Runs the actual webhook side-effects: contact upserts, MessageLog writes,
 * delivery-status updates. The controller only ACKs Meta and enqueues here.
 *
 * One queue handles every Meta product, because they share one app and one
 * webhook URL: WhatsApp messages and lead-ad notifications arrive under
 * `entry[].changes[]`, while Messenger and Instagram arrive under
 * `entry[].messaging[]`. A Page entry can carry both at once.
 */
@Processor(WEBHOOK_QUEUE)
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly channelsService: ChannelsService,
    private readonly contactsService: ContactsService,
    private readonly connectionsService: ChannelConnectionsService,
    private readonly messengerClient: MessengerClient,
    @Inject(forwardRef(() => AutomationEngineService))
    private readonly automationEngine: AutomationEngineService,
    private readonly metaLeads: MetaLeadsService,
  ) {
    super();
  }

  async process(job: Job<MetaWebhookPayload>) {
    const messagingType = messagingChannelType(job.data.object);

    for (const entry of job.data.entry ?? []) {
      // Messenger and Instagram messages. Deliberately not a `continue`: a Page
      // entry can carry messaging[] and changes[] in the same delivery, and the
      // lead-ad notifications below live in changes[].
      if (messagingType) {
        for (const event of entry.messaging ?? []) {
          await this.handleMessagingEvent(messagingType, entry.id, event);
        }
      }

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

        // Lead ads arrive on the Page object, so they carry a leadgen id
        // instead of phone-number metadata — handled before the gate below.
        if (change.field === "leadgen" && value.leadgen_id) {
          await this.handleLeadgen(value as MetaLeadgenNotification);
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

  private async handleLeadgen(notification: MetaLeadgenNotification) {
    const outcome = await this.metaLeads.ingestLeadgen({
      leadgenId: notification.leadgen_id,
      formId: notification.form_id,
      pageId: notification.page_id,
      adId: notification.ad_id,
    });
    this.logger.log(
      `Leadgen ${notification.leadgen_id}: ${outcome.created} lead(s) created, ${outcome.skipped} skipped`,
    );
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

  /**
   * Messenger and Instagram. `recipient.id` is our own Page or Instagram
   * account, so it is what identifies the channel; `entry.id` is the fallback
   * for the event shapes that omit it.
   */
  private async handleMessagingEvent(type: ChannelType, entryId: string, event: MetaMessagingEvent) {
    // An echo is Meta replaying a message the Page sent — including the ones
    // this app just sent. Logging it would duplicate every outbound message.
    if (event.message?.is_echo) return;

    const accountId = event.recipient?.id ?? entryId;
    const channel = await this.connectionsService.findByExternalId(type, accountId);
    if (!channel) {
      this.logger.warn(`No ${type} channel found for account ${accountId}`);
      return;
    }
    if (channel.status !== "active") return;

    if (event.delivery?.mids?.length) {
      await this.markStatus(event.delivery.mids, "delivered");
      return;
    }
    if (event.read?.watermark) {
      await this.markReadUpTo(channel.tenantId, channel.id, event.read.watermark);
      return;
    }

    const senderId = event.sender?.id;
    const text = event.message?.text ?? event.postback?.title;
    const messageId = event.message?.mid ?? event.postback?.mid;
    if (!senderId || !messageId) return;

    const existing = await this.prisma.messageLog.findUnique({ where: { waMessageId: messageId } });
    if (existing) return;

    const profile = await this.messengerClient.fetchProfile(channel, senderId);
    const { contact, isNew } = await this.contactsService.upsertByExternalId(
      channel.tenantId,
      type,
      senderId,
      {
        name: profile.name ?? (profile.username ? `@${profile.username}` : undefined),
        markInbound: true,
        source: type,
      },
    );

    await this.prisma.messageLog.create({
      data: {
        tenantId: channel.tenantId,
        channelId: channel.id,
        contactId: contact.id,
        direction: "inbound",
        waMessageId: messageId,
        status: "received",
        payloadJson: {
          channel: type,
          // Attachments have no text; naming the type beats an empty bubble.
          type: event.message?.text
            ? "text"
            : event.postback
              ? "postback"
              : (event.message?.attachments?.[0]?.type ?? "unknown"),
          text: text ?? null,
          payload: event.postback?.payload ?? null,
        } as never,
      },
    });

    await this.automationEngine.evaluate({
      tenantId: channel.tenantId,
      channelId: channel.id,
      contactId: contact.id,
      messageText: text ?? "",
      isNewContact: isNew,
    });
  }

  private async markStatus(messageIds: string[], status: string) {
    await this.prisma.messageLog.updateMany({
      where: { waMessageId: { in: messageIds } },
      data: { status, statusUpdatedAt: new Date() },
    });
  }

  /**
   * Messenger reports reads as a watermark — "everything up to this moment has
   * been seen" — rather than per message, so this sweeps the conversation.
   */
  private async markReadUpTo(tenantId: string, channelId: string, watermark: number) {
    await this.prisma.messageLog.updateMany({
      where: {
        tenantId,
        channelId,
        direction: "outbound",
        createdAt: { lte: new Date(watermark) },
        status: { in: ["sent", "delivered"] },
      },
      data: { status: "read", statusUpdatedAt: new Date() },
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

/** Messenger and Instagram events are recognised by the webhook's `object` field. */
export function messagingChannelType(object: string): ChannelType | null {
  if (object === "page") return "facebook";
  if (object === "instagram") return "instagram";
  return null;
}
