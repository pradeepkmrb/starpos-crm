import { BadRequestException, Inject, Injectable, NotFoundException, forwardRef } from "@nestjs/common";
import { CHANNEL_LABELS, type ChannelType, channelHasReplyWindow } from "@digitel/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { ChannelsService } from "./channels.service";
import { MessageLogService } from "../messages/message-log.service";
import { OutboundDispatcher, contactAddress } from "../channels/outbound-dispatcher.service";

/**
 * Meta only allows free-form (non-template) replies inside 24 hours of the
 * contact's last inbound message. Outside it, the only way to re-open the
 * conversation is a template — which is the Broadcasts path, not this one.
 * The same 24-hour rule governs Messenger and Instagram; email has no window.
 */
export const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function windowExpiresAt(channelType: ChannelType, lastInboundAt: Date | null): Date | null {
  if (!channelHasReplyWindow(channelType) || !lastInboundAt) return null;
  return new Date(lastInboundAt.getTime() + CUSTOMER_SERVICE_WINDOW_MS);
}

export function windowIsOpen(
  channelType: ChannelType,
  lastInboundAt: Date | null,
  now = new Date(),
): boolean {
  // Email threads never close, so there is nothing to wait for.
  if (!channelHasReplyWindow(channelType)) return true;
  const expiry = windowExpiresAt(channelType, lastInboundAt);
  return expiry !== null && expiry.getTime() > now.getTime();
}

/**
 * Each channel logs its own payload shape — WhatsApp stores Meta's raw message
 * object, Messenger and Instagram a flattened `{text}`, email a `{subject, body}`.
 * This narrows all three to something the chat bubble can render.
 */
function describeInbound(payload: unknown): { text: string; kind: string } {
  const p = (payload ?? {}) as {
    channel?: string;
    type?: string;
    text?: { body?: string } | string;
    subject?: string;
    body?: string;
    button?: { text?: string };
    interactive?: {
      button_reply?: { title?: string };
      list_reply?: { title?: string };
    };
    caption?: string;
  };
  const kind = p.type ?? "unknown";

  if (p.channel === "email") {
    const subject = p.subject ? `${p.subject}\n\n` : "";
    return { text: `${subject}${p.body ?? ""}`.trim() || "[empty email]", kind: "email" };
  }
  // Messenger and Instagram flatten the text; WhatsApp nests it under text.body.
  if (typeof p.text === "string") return { text: p.text, kind };
  if (p.text?.body) return { text: p.text.body, kind };
  if (p.button?.text) return { text: p.button.text, kind };
  const interactiveTitle = p.interactive?.button_reply?.title ?? p.interactive?.list_reply?.title;
  if (interactiveTitle) return { text: interactiveTitle, kind };
  // Media and everything else: name the type rather than render an empty bubble.
  return { text: `[${kind}]`, kind };
}

function describeOutbound(payload: unknown): { text: string; kind: string } {
  const p = (payload ?? {}) as { body?: string; templateName?: string; languageCode?: string };
  if (p.body) return { text: p.body, kind: "text" };
  if (p.templateName) return { text: `[template: ${p.templateName}]`, kind: "template" };
  return { text: "[sent]", kind: "unknown" };
}

export interface InboxMessage {
  id: string;
  direction: "inbound" | "outbound";
  text: string;
  kind: string;
  status: string;
  createdAt: Date;
}

@Injectable()
export class InboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channelsService: ChannelsService,
    private readonly messageLogService: MessageLogService,
    @Inject(forwardRef(() => OutboundDispatcher))
    private readonly dispatcher: OutboundDispatcher,
  ) {}

  /**
   * One row per contact that has any message history, newest activity first.
   * Built from a grouped scan of MessageLog rather than a per-contact query so
   * the list stays one round trip regardless of how many conversations exist.
   */
  async listConversations(tenantId: string, take = 100) {
    const latest = await this.prisma.messageLog.groupBy({
      by: ["contactId"],
      where: { tenantId },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: "desc" } },
      take,
    });
    if (latest.length === 0) return [];

    const contactIds = latest.map((row) => row.contactId);
    const [contacts, lastMessages] = await Promise.all([
      this.prisma.contact.findMany({
        where: { tenantId, id: { in: contactIds } },
        select: {
          id: true,
          channelType: true,
          externalId: true,
          whatsappNumber: true,
          name: true,
          lastInboundAt: true,
          assignedUserId: true,
          assignedUser: { select: { id: true, name: true, email: true } },
          labels: { select: { label: true } },
        },
      }),
      this.prisma.messageLog.findMany({
        where: { tenantId, contactId: { in: contactIds } },
        orderBy: { createdAt: "desc" },
        select: { contactId: true, direction: true, payloadJson: true, createdAt: true },
      }),
    ]);

    const contactById = new Map(contacts.map((c) => [c.id, c]));
    const lastByContact = new Map<string, (typeof lastMessages)[number]>();
    for (const m of lastMessages) {
      if (!lastByContact.has(m.contactId)) lastByContact.set(m.contactId, m);
    }

    return latest.flatMap((row) => {
      const contact = contactById.get(row.contactId);
      if (!contact) return [];
      const last = lastByContact.get(row.contactId);
      const preview = last
        ? last.direction === "inbound"
          ? describeInbound(last.payloadJson)
          : describeOutbound(last.payloadJson)
        : { text: "", kind: "unknown" };

      return [
        {
          contactId: contact.id,
          channelType: contact.channelType,
          /** Their address on that channel — number, @handle or email. */
          handle: contact.externalId ?? contact.whatsappNumber ?? "",
          whatsappNumber: contact.whatsappNumber,
          name: contact.name,
          lastMessageAt: row._max.createdAt,
          lastMessagePreview: preview.text,
          lastMessageDirection: last?.direction ?? null,
          windowOpen: windowIsOpen(contact.channelType, contact.lastInboundAt),
          windowExpiresAt: windowExpiresAt(contact.channelType, contact.lastInboundAt),
          assignedUserId: contact.assignedUserId,
          assignedUser: contact.assignedUser,
          labels: contact.labels.map((cl) => cl.label),
        },
      ];
    });
  }

  /**
   * Assignment is by tenant member, so an id that isn't on this tenant is
   * rejected rather than silently stored.
   */
  async assign(tenantId: string, contactId: string, userId: string | null) {
    const contact = await this.prisma.contact.findFirst({ where: { id: contactId, tenantId } });
    if (!contact) throw new NotFoundException("Contact not found");

    if (userId) {
      const membership = await this.prisma.tenantMembership.findFirst({
        where: { tenantId, userId, status: "active" },
      });
      if (!membership) throw new BadRequestException("That user is not an active member of this workspace");
    }

    return this.prisma.contact.update({
      where: { id: contactId },
      data: { assignedUserId: userId },
      select: {
        id: true,
        assignedUserId: true,
        assignedUser: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async getConversation(tenantId: string, contactId: string, take = 200) {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, tenantId },
      include: {
        assignedUser: { select: { id: true, name: true, email: true } },
        labels: { select: { label: true } },
      },
    });
    if (!contact) throw new NotFoundException("Contact not found");

    const logs = await this.prisma.messageLog.findMany({
      where: { tenantId, contactId },
      orderBy: { createdAt: "asc" },
      take,
    });

    const messages: InboxMessage[] = logs.map((log) => {
      const described =
        log.direction === "inbound" ? describeInbound(log.payloadJson) : describeOutbound(log.payloadJson);
      return {
        id: log.id,
        direction: log.direction as "inbound" | "outbound",
        text: described.text,
        kind: described.kind,
        status: log.status,
        createdAt: log.createdAt,
      };
    });

    return {
      contact: {
        id: contact.id,
        channelType: contact.channelType,
        handle: contact.externalId ?? contact.whatsappNumber ?? "",
        whatsappNumber: contact.whatsappNumber,
        name: contact.name,
        email: contact.email,
        languageCode: contact.languageCode,
        optedIn: contact.optedIn,
        botEnabled: contact.botEnabled,
        createdAt: contact.createdAt,
        assignedUserId: contact.assignedUserId,
        assignedUser: contact.assignedUser,
        labels: contact.labels.map((cl) => cl.label),
      },
      windowOpen: windowIsOpen(contact.channelType, contact.lastInboundAt),
      windowExpiresAt: windowExpiresAt(contact.channelType, contact.lastInboundAt),
      messages,
    };
  }

  async reply(tenantId: string, contactId: string, body: string) {
    const contact = await this.prisma.contact.findFirst({ where: { id: contactId, tenantId } });
    if (!contact) throw new NotFoundException("Contact not found");
    if (!contactAddress(contact)) {
      throw new BadRequestException("This contact has no address to reply to");
    }

    // Enforced here as well as in the UI: Meta rejects the send anyway, but a
    // clear message beats surfacing a raw Graph API error. Email skips this —
    // there is no window to miss.
    if (!windowIsOpen(contact.channelType, contact.lastInboundAt)) {
      throw new BadRequestException(
        contact.channelType === "whatsapp"
          ? "The 24-hour reply window has closed. Send a template from Broadcasts to reopen the conversation."
          : "The 24-hour reply window has closed. They need to message you again before you can reply.",
      );
    }

    const channel = await this.resolveChannel(tenantId, contact.channelType, contactId);
    const { externalMessageId, payload } = await this.dispatcher.sendText(channel, contact, body);

    return this.messageLogService.recordOutbound({
      tenantId,
      channelId: channel.id,
      contactId: contact.id,
      waMessageId: externalMessageId,
      payload,
    });
  }

  /**
   * Replies go out on whichever channel the conversation already used, and
   * never on a different one — a WhatsApp number cannot answer an Instagram DM.
   */
  private async resolveChannel(tenantId: string, channelType: ChannelType, contactId: string) {
    const lastLog = await this.prisma.messageLog.findFirst({
      where: { tenantId, contactId, channel: { type: channelType } },
      orderBy: { createdAt: "desc" },
      select: { channelId: true },
    });
    if (lastLog) return this.channelsService.getChannelWithCredentials(tenantId, lastLog.channelId);

    const channel = await this.prisma.channel.findFirst({
      where: { tenantId, type: channelType, status: "active" },
      orderBy: { createdAt: "asc" },
    });
    if (!channel) {
      throw new BadRequestException(`No active ${CHANNEL_LABELS[channelType]} channel to reply from`);
    }
    return channel;
  }
}
