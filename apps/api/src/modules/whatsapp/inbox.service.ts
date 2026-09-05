import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ChannelsService } from "./channels.service";
import { MetaGraphClient } from "./meta-graph.client";
import { MessageLogService } from "../messages/message-log.service";

/**
 * Meta only allows free-form (non-template) replies inside 24 hours of the
 * contact's last inbound message. Outside it, the only way to re-open the
 * conversation is a template — which is the Broadcasts path, not this one.
 */
export const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function windowExpiresAt(lastInboundAt: Date | null): Date | null {
  return lastInboundAt ? new Date(lastInboundAt.getTime() + CUSTOMER_SERVICE_WINDOW_MS) : null;
}

export function windowIsOpen(lastInboundAt: Date | null, now = new Date()): boolean {
  const expiry = windowExpiresAt(lastInboundAt);
  return expiry !== null && expiry.getTime() > now.getTime();
}

/** Meta's inbound payload is a tagged union; this pulls out something displayable. */
function describeInbound(payload: unknown): { text: string; kind: string } {
  const p = (payload ?? {}) as {
    type?: string;
    text?: { body?: string };
    button?: { text?: string };
    interactive?: {
      button_reply?: { title?: string };
      list_reply?: { title?: string };
    };
    caption?: string;
  };
  const kind = p.type ?? "unknown";
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
    private readonly metaGraphClient: MetaGraphClient,
    private readonly messageLogService: MessageLogService,
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
          whatsappNumber: contact.whatsappNumber,
          name: contact.name,
          lastMessageAt: row._max.createdAt,
          lastMessagePreview: preview.text,
          lastMessageDirection: last?.direction ?? null,
          windowOpen: windowIsOpen(contact.lastInboundAt),
          windowExpiresAt: windowExpiresAt(contact.lastInboundAt),
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
      windowOpen: windowIsOpen(contact.lastInboundAt),
      windowExpiresAt: windowExpiresAt(contact.lastInboundAt),
      messages,
    };
  }

  async reply(tenantId: string, contactId: string, body: string) {
    const contact = await this.prisma.contact.findFirst({ where: { id: contactId, tenantId } });
    if (!contact) throw new NotFoundException("Contact not found");

    // Enforced here as well as in the UI: Meta rejects the send anyway, but a
    // clear message beats surfacing a raw Graph API error.
    if (!windowIsOpen(contact.lastInboundAt)) {
      throw new BadRequestException(
        "The 24-hour reply window has closed. Send a template from Broadcasts to reopen the conversation.",
      );
    }

    const channel = await this.resolveChannel(tenantId, contactId);
    const { waMessageId } = await this.metaGraphClient.sendTextMessage(
      channel,
      contact.whatsappNumber,
      body,
    );

    return this.messageLogService.recordOutbound({
      tenantId,
      channelId: channel.id,
      contactId: contact.id,
      waMessageId,
      payload: { body },
    });
  }

  /** Replies go out on whichever channel the conversation already used. */
  private async resolveChannel(tenantId: string, contactId: string) {
    const lastLog = await this.prisma.messageLog.findFirst({
      where: { tenantId, contactId },
      orderBy: { createdAt: "desc" },
      select: { channelId: true },
    });
    if (lastLog) return this.channelsService.getChannelWithCredentials(tenantId, lastLog.channelId);

    const channel = await this.prisma.whatsappChannel.findFirst({
      where: { tenantId, status: "active" },
      orderBy: { createdAt: "asc" },
    });
    if (!channel) throw new BadRequestException("No active WhatsApp channel to reply from");
    return channel;
  }
}
