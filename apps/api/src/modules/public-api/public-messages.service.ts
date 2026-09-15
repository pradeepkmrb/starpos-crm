import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ChannelsService } from "../whatsapp/channels.service";
import { MetaGraphClient } from "../whatsapp/meta-graph.client";
import { MessageLogService } from "../messages/message-log.service";
import { ContactsService } from "../contacts/contacts.service";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { windowExpiresAt, windowIsOpen } from "../whatsapp/inbox.service";
import { normalizeWhatsappNumber } from "../../common/phone";
import { SendTextDto } from "./dto/send-text.dto";
import { SendTemplateDto } from "./dto/send-template.dto";
import { SendMediaDto } from "./dto/send-media.dto";
import { SendInteractiveDto } from "./dto/send-interactive.dto";

const DEFAULT_TEMPLATE_LANGUAGE = "en_US";

export interface SentMessage {
  id: string;
  waMessageId: string | null;
  to: string;
  type: string;
  status: string;
  contactId: string;
  channelId: string;
  createdAt: Date;
}

/**
 * The send half of the public REST API. Everything an integration can post
 * funnels through here so the rules that make a send legal — a resolved
 * channel, a known contact, and Meta's 24-hour customer-service window for
 * anything that is not a template — are applied identically whichever
 * endpoint was called.
 */
@Injectable()
export class PublicMessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channelsService: ChannelsService,
    private readonly metaGraphClient: MetaGraphClient,
    private readonly messageLogService: MessageLogService,
    private readonly contactsService: ContactsService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async sendText(tenantId: string, dto: SendTextDto): Promise<SentMessage> {
    const { channel, contact } = await this.prepare(tenantId, dto.to, dto.channelId);
    this.assertSessionWindowOpen(contact.lastInboundAt);

    const { waMessageId } = await this.metaGraphClient.sendTextMessage(
      channel,
      contact.whatsappNumber,
      dto.text,
      dto.previewUrl ?? false,
    );

    return this.record(tenantId, channel.id, contact.id, waMessageId, "text", { body: dto.text });
  }

  /** The only send that works outside the 24-hour window, by design. */
  async sendTemplate(tenantId: string, dto: SendTemplateDto): Promise<SentMessage> {
    const { channel, contact } = await this.prepare(tenantId, dto.to, dto.channelId);
    const languageCode = dto.languageCode ?? DEFAULT_TEMPLATE_LANGUAGE;
    const components = dto.components ?? buildTemplateComponents(dto);

    const { waMessageId } = await this.metaGraphClient.sendTemplateMessage(
      channel,
      contact.whatsappNumber,
      dto.templateName,
      languageCode,
      components.length > 0 ? components : undefined,
    );

    return this.record(tenantId, channel.id, contact.id, waMessageId, "template", {
      templateName: dto.templateName,
      languageCode,
      components,
    });
  }

  async sendMedia(tenantId: string, dto: SendMediaDto): Promise<SentMessage> {
    if (!dto.link && !dto.mediaId) {
      throw new BadRequestException("Provide either a link or a mediaId for the media to send");
    }
    if (dto.link && dto.mediaId) {
      throw new BadRequestException("Provide only one of link or mediaId, not both");
    }
    if (dto.link && !/^https:\/\//i.test(dto.link)) {
      throw new BadRequestException("link must be a publicly reachable https URL that Meta can fetch");
    }

    const { channel, contact } = await this.prepare(tenantId, dto.to, dto.channelId);
    this.assertSessionWindowOpen(contact.lastInboundAt);

    const { waMessageId } = await this.metaGraphClient.sendMediaMessage(
      channel,
      contact.whatsappNumber,
      dto.type,
      { link: dto.link, id: dto.mediaId, caption: dto.caption, filename: dto.filename },
    );

    return this.record(tenantId, channel.id, contact.id, waMessageId, dto.type, {
      body: dto.caption ?? `[${dto.type}]`,
      mediaType: dto.type,
      link: dto.link,
      mediaId: dto.mediaId,
      filename: dto.filename,
    });
  }

  async sendInteractive(tenantId: string, dto: SendInteractiveDto): Promise<SentMessage> {
    const interactive = buildInteractive(dto);

    const { channel, contact } = await this.prepare(tenantId, dto.to, dto.channelId);
    this.assertSessionWindowOpen(contact.lastInboundAt);

    const { waMessageId } = await this.metaGraphClient.sendInteractiveMessage(
      channel,
      contact.whatsappNumber,
      interactive,
    );

    return this.record(tenantId, channel.id, contact.id, waMessageId, "interactive", {
      body: dto.bodyText,
      interactive,
    });
  }

  /** Delivery state, as last reported by Meta's status webhook. */
  async getMessage(tenantId: string, idOrWaMessageId: string) {
    const log = await this.prisma.messageLog.findFirst({
      where: {
        tenantId,
        OR: [{ id: idOrWaMessageId }, { waMessageId: idOrWaMessageId }],
      },
      include: { contact: { select: { id: true, whatsappNumber: true, name: true } } },
    });
    if (!log) throw new NotFoundException("Message not found");

    return {
      id: log.id,
      waMessageId: log.waMessageId,
      direction: log.direction,
      status: log.status,
      channelId: log.channelId,
      campaignId: log.campaignId,
      contact: log.contact,
      payload: log.payloadJson,
      createdAt: log.createdAt,
      statusUpdatedAt: log.statusUpdatedAt,
    };
  }

  /**
   * Resolves the two things every send needs. The channel is the one the
   * caller named, or the workspace's single active channel — guessing between
   * several would silently send from the wrong number.
   */
  private async prepare(tenantId: string, to: string, channelId?: string) {
    const whatsappNumber = normalizeWhatsappNumber(to);
    if (!whatsappNumber) {
      throw new BadRequestException(
        `"${to}" is not a valid phone number. Use international format, e.g. +919876543210.`,
      );
    }

    const channel = await this.resolveChannel(tenantId, channelId);
    const contact = await this.resolveContact(tenantId, whatsappNumber);
    return { channel, contact };
  }

  private async resolveChannel(tenantId: string, channelId?: string) {
    if (channelId) {
      const channel = await this.channelsService.getChannelWithCredentials(tenantId, channelId);
      if (channel.status !== "active") {
        throw new BadRequestException("That WhatsApp channel is disconnected");
      }
      return channel;
    }

    const active = await this.prisma.whatsappChannel.findMany({
      where: { tenantId, status: "active" },
      orderBy: { createdAt: "asc" },
    });
    if (active.length === 0) {
      throw new BadRequestException(
        "No active WhatsApp channel. Connect one under Connections before sending.",
      );
    }
    if (active.length > 1) {
      throw new BadRequestException(
        "This workspace has more than one active channel — pass channelId to say which number to send from.",
      );
    }
    return active[0];
  }

  /** Creating a contact through the API counts against the plan like any other. */
  private async resolveContact(tenantId: string, whatsappNumber: string) {
    const existing = await this.prisma.contact.findUnique({
      where: { tenantId_whatsappNumber: { tenantId, whatsappNumber } },
    });
    if (existing) return existing;

    await this.entitlements.assertCanAdd(tenantId, "contacts");
    const { contact } = await this.contactsService.upsertByNumber(tenantId, whatsappNumber, {
      source: "api",
    });
    return contact;
  }

  /**
   * Meta rejects a free-form send outside the window anyway; failing here
   * costs no quota and says what to do instead.
   */
  private assertSessionWindowOpen(lastInboundAt: Date | null) {
    if (windowIsOpen(lastInboundAt)) return;
    const expired = windowExpiresAt(lastInboundAt);
    throw new BadRequestException(
      expired
        ? `The 24-hour customer-service window closed at ${expired.toISOString()}. Send an approved template instead.`
        : "This contact has never messaged you, so there is no open 24-hour window. Send an approved template instead.",
    );
  }

  private async record(
    tenantId: string,
    channelId: string,
    contactId: string,
    waMessageId: string,
    type: string,
    payload: Record<string, unknown>,
  ): Promise<SentMessage> {
    const log = await this.messageLogService.recordOutbound({
      tenantId,
      channelId,
      contactId,
      waMessageId,
      payload: { ...payload, source: "api" },
    });

    const contact = await this.prisma.contact.findUniqueOrThrow({
      where: { id: contactId },
      select: { whatsappNumber: true },
    });

    return {
      id: log.id,
      waMessageId: log.waMessageId,
      to: contact.whatsappNumber,
      type,
      status: log.status,
      contactId,
      channelId,
      createdAt: log.createdAt,
    };
  }
}

/**
 * Turns the convenience fields into Meta's `components` array. Order does not
 * matter to Meta, but the parameter order inside each component does — it is
 * positional, mapping to {{1}}, {{2}} and so on.
 */
export function buildTemplateComponents(dto: SendTemplateDto): Record<string, unknown>[] {
  const components: Record<string, unknown>[] = [];

  if (dto.headerMedia) {
    const { type, link, filename } = dto.headerMedia;
    components.push({
      type: "header",
      parameters: [
        { type, [type]: { link, ...(type === "document" && filename ? { filename } : {}) } },
      ],
    });
  } else if (dto.headerVariables?.length) {
    components.push({
      type: "header",
      parameters: dto.headerVariables.map((text) => ({ type: "text", text })),
    });
  }

  if (dto.bodyVariables?.length) {
    components.push({
      type: "body",
      parameters: dto.bodyVariables.map((text) => ({ type: "text", text })),
    });
  }

  // Each URL button is its own component, addressed by its index in the
  // template — which is why these arrive as an ordered list.
  dto.buttonUrlVariables?.forEach((text, index) => {
    components.push({
      type: "button",
      sub_type: "url",
      index: String(index),
      parameters: [{ type: "text", text }],
    });
  });

  return components;
}

export function buildInteractive(dto: SendInteractiveDto): Record<string, unknown> {
  const base: Record<string, unknown> = {
    type: dto.type,
    body: { text: dto.bodyText },
    ...(dto.headerText ? { header: { type: "text", text: dto.headerText } } : {}),
    ...(dto.footerText ? { footer: { text: dto.footerText } } : {}),
  };

  if (dto.type === "button") {
    if (!dto.buttons?.length) {
      throw new BadRequestException('Interactive type "button" needs between one and three buttons');
    }
    return {
      ...base,
      action: {
        buttons: dto.buttons.map((b) => ({ type: "reply", reply: { id: b.id, title: b.title } })),
      },
    };
  }

  if (!dto.sections?.length) {
    throw new BadRequestException('Interactive type "list" needs at least one section of rows');
  }
  return {
    ...base,
    action: {
      button: dto.buttonText ?? "Choose",
      sections: dto.sections.map((section) => ({
        ...(section.title ? { title: section.title } : {}),
        rows: section.rows.map((row) => ({
          id: row.id,
          title: row.title,
          ...(row.description ? { description: row.description } : {}),
        })),
      })),
    },
  };
}
