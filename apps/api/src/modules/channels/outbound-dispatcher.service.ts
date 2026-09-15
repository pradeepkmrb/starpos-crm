import { BadRequestException, Injectable } from "@nestjs/common";
import type { Channel, Contact } from "@digitel/db";
import { PrismaService } from "../../prisma/prisma.service";
import { decryptToken } from "../../common/token-encryption";
import { MetaGraphClient } from "../whatsapp/meta-graph.client";
import { MessengerClient } from "./messenger.client";
import { EmailChannelConfig, EmailClient } from "./email.client";

export interface DispatchResult {
  /** The platform's own id for the sent message — goes in MessageLog.waMessageId. */
  externalMessageId: string;
  /** What to store as the log payload so the Inbox can render the bubble. */
  payload: Record<string, unknown>;
}

/** The subject a reply carries when the thread has none to inherit. */
export const DEFAULT_EMAIL_SUBJECT = "Re: your message";

/**
 * One place that knows how to put a free-form message on the wire for any
 * channel. Every caller that used to reach straight for MetaGraphClient —
 * the Inbox and the automation engine — goes through here instead, so adding a
 * channel does not mean revisiting each of them.
 */
@Injectable()
export class OutboundDispatcher {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metaGraphClient: MetaGraphClient,
    private readonly messengerClient: MessengerClient,
    private readonly emailClient: EmailClient,
  ) {}

  async sendText(channel: Channel, contact: Contact, body: string): Promise<DispatchResult> {
    const recipient = contactAddress(contact);
    if (!recipient) {
      throw new BadRequestException("This contact has no address to send to on their channel");
    }

    switch (channel.type) {
      case "whatsapp": {
        const { waMessageId } = await this.metaGraphClient.sendTextMessage(channel, recipient, body);
        return { externalMessageId: waMessageId, payload: { body } };
      }
      case "facebook":
      case "instagram": {
        const { messageId } = await this.messengerClient.sendTextMessage(channel, recipient, body);
        return { externalMessageId: messageId, payload: { body } };
      }
      case "email": {
        const config = emailConfig(channel);
        const thread = await this.findEmailThread(contact.tenantId, contact.id);
        const { messageId } = await this.emailClient.sendMessage(
          config,
          decryptToken(channel.accessTokenEncrypted),
          {
            to: recipient,
            subject: thread.subject,
            text: body,
            inReplyTo: thread.inReplyTo,
          },
        );
        return { externalMessageId: messageId, payload: { body, subject: thread.subject } };
      }
    }
  }

  async sendTemplate(
    channel: Channel,
    contact: Contact,
    templateName: string,
    languageCode: string,
  ): Promise<DispatchResult> {
    if (channel.type !== "whatsapp") {
      throw new BadRequestException(
        "Templates are a WhatsApp feature — send plain text on Messenger, Instagram and email.",
      );
    }
    const recipient = contactAddress(contact);
    if (!recipient) throw new BadRequestException("This contact has no WhatsApp number");

    const { waMessageId } = await this.metaGraphClient.sendTemplateMessage(
      channel,
      recipient,
      templateName,
      languageCode,
    );
    return { externalMessageId: waMessageId, payload: { templateName, languageCode } };
  }

  /**
   * An email reply has to join the existing thread, so it reuses the last
   * inbound subject (already "Re:"-prefixed if the customer replied) and quotes
   * that message's Message-ID.
   */
  private async findEmailThread(
    tenantId: string,
    contactId: string,
  ): Promise<{ subject: string; inReplyTo: string | null }> {
    const lastInbound = await this.prisma.messageLog.findFirst({
      where: { tenantId, contactId, direction: "inbound" },
      orderBy: { createdAt: "desc" },
      select: { waMessageId: true, payloadJson: true },
    });
    const subject = (lastInbound?.payloadJson as { subject?: string } | null)?.subject;
    return {
      subject: subject ? ensureReplyPrefix(subject) : DEFAULT_EMAIL_SUBJECT,
      inReplyTo: lastInbound?.waMessageId ?? null,
    };
  }
}

/** Where a message to this contact goes, whichever channel they arrived on. */
export function contactAddress(contact: Contact): string | null {
  return contact.externalId ?? contact.whatsappNumber ?? null;
}

export function ensureReplyPrefix(subject: string): string {
  return /^re:/i.test(subject.trim()) ? subject.trim() : `Re: ${subject.trim()}`;
}

export function emailConfig(channel: Channel): EmailChannelConfig {
  const config = (channel.configJson ?? {}) as Partial<EmailChannelConfig>;
  if (!config.imapHost || !config.smtpHost || !channel.externalId) {
    throw new BadRequestException("This email channel is not fully configured");
  }
  return {
    imapHost: config.imapHost,
    imapPort: config.imapPort ?? 993,
    smtpHost: config.smtpHost,
    smtpPort: config.smtpPort ?? 587,
    emailAddress: channel.externalId,
    fromName: config.fromName ?? null,
  };
}
