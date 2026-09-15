import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Channel } from "@digitel/db";
import { type ChannelType, describeChannel } from "@digitel/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { decryptToken, encryptToken } from "../../common/token-encryption";
import { MessengerClient } from "./messenger.client";
import { EmailChannelConfig, EmailClient } from "./email.client";
import { ConnectMessengerDto } from "./dto/connect-messenger.dto";
import { ConnectInstagramDto } from "./dto/connect-instagram.dto";
import { ConnectEmailDto } from "./dto/connect-email.dto";

/**
 * What the Connections page is allowed to see. Never includes
 * accessTokenEncrypted — a connected channel reports *that* it has a secret,
 * never the secret itself, so a stolen session cannot exfiltrate a Page token
 * or a mailbox password.
 */
export interface ChannelConnectionView {
  id: string;
  type: ChannelType;
  label: string;
  externalId: string | null;
  displayName: string | null;
  displayPhoneNumber: string | null;
  wabaId: string | null;
  phoneNumberId: string | null;
  status: "active" | "disconnected";
  hasCredentials: boolean;
  /** Email settings only; never the password. */
  email: (Omit<EmailChannelConfig, "emailAddress"> & { emailAddress: string }) | null;
  /** Instagram only: the Page its token came from. */
  pageId: string | null;
  lastSyncedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
}

export function toConnectionView(channel: Channel): ChannelConnectionView {
  const config = (channel.configJson ?? {}) as Partial<EmailChannelConfig> & { pageId?: string };
  return {
    id: channel.id,
    type: channel.type,
    label: describeChannel(channel),
    externalId: channel.externalId,
    displayName: channel.displayName,
    displayPhoneNumber: channel.displayPhoneNumber,
    wabaId: channel.wabaId,
    phoneNumberId: channel.phoneNumberId,
    status: channel.status,
    hasCredentials: channel.accessTokenEncrypted.length > 0,
    email:
      channel.type === "email" && config.imapHost
        ? {
            imapHost: config.imapHost,
            imapPort: config.imapPort ?? 993,
            smtpHost: config.smtpHost ?? "",
            smtpPort: config.smtpPort ?? 587,
            emailAddress: channel.externalId ?? "",
            fromName: config.fromName ?? null,
          }
        : null,
    pageId: config.pageId ?? null,
    lastSyncedAt: channel.lastSyncedAt,
    lastError: channel.lastError,
    createdAt: channel.createdAt,
  };
}

/**
 * Connect, edit and disable the non-WhatsApp channels. Each type is one row per
 * tenant — a business has one support mailbox and one Page, and letting them
 * have several would make "which one does a reply go out on?" ambiguous for no
 * gain. Saving the same type twice therefore updates in place.
 */
@Injectable()
export class ChannelConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly messengerClient: MessengerClient,
    private readonly emailClient: EmailClient,
  ) {}

  async list(tenantId: string): Promise<ChannelConnectionView[]> {
    const channels = await this.prisma.channel.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
    });
    return channels.map(toConnectionView);
  }

  async connectMessenger(tenantId: string, dto: ConnectMessengerDto): Promise<ChannelConnectionView> {
    const existing = await this.findByType(tenantId, "facebook");
    await this.assertCanAdd(tenantId, existing);

    const accessTokenEncrypted = encryptToken(dto.accessToken);
    // Verified before the row is written: a token that cannot read its own Page
    // will never be able to send, and finding that out now beats finding out on
    // the first customer message.
    const page = await this.messengerClient.getPage(
      { tenantId, type: "facebook", externalId: dto.pageId, accessTokenEncrypted },
      dto.pageId,
    );

    const channel = await this.upsert(existing, {
      tenantId,
      type: "facebook",
      externalId: page.id,
      displayName: page.name,
      accessTokenEncrypted,
      status: dto.enabled === false ? "disconnected" : "active",
      configJson: { pageId: page.id },
    });

    // Best-effort: the channel is connected either way, and an operator who
    // subscribed the Page by hand in the App Dashboard needs nothing from us.
    await this.trySubscribePage(channel, page.id);
    return toConnectionView(channel);
  }

  async connectInstagram(tenantId: string, dto: ConnectInstagramDto): Promise<ChannelConnectionView> {
    const existing = await this.findByType(tenantId, "instagram");
    await this.assertCanAdd(tenantId, existing);

    // The setup flow says "no separate token needed", so an Instagram channel
    // borrows the Page token from the Messenger channel unless one is given.
    const messenger = await this.findByType(tenantId, "facebook");
    const accessTokenEncrypted = dto.accessToken
      ? encryptToken(dto.accessToken)
      : (existing?.accessTokenEncrypted ?? messenger?.accessTokenEncrypted);
    if (!accessTokenEncrypted) {
      throw new BadRequestException(
        "Connect Facebook Messenger first, or paste a Page access token — Instagram DMs are delivered with the Page's token.",
      );
    }

    const account = await this.messengerClient.getInstagramAccount(
      { tenantId, type: "instagram", externalId: dto.instagramAccountId, accessTokenEncrypted },
      dto.instagramAccountId,
    );

    const pageId = dto.pageId ?? messenger?.externalId ?? null;
    const channel = await this.upsert(existing, {
      tenantId,
      type: "instagram",
      externalId: account.id,
      displayName: account.username ? `@${account.username}` : null,
      accessTokenEncrypted,
      status: dto.enabled === false ? "disconnected" : "active",
      configJson: pageId ? { pageId } : {},
    });

    if (pageId) await this.trySubscribePage(channel, pageId);
    return toConnectionView(channel);
  }

  async connectEmail(tenantId: string, dto: ConnectEmailDto): Promise<ChannelConnectionView> {
    const existing = await this.findByType(tenantId, "email");
    await this.assertCanAdd(tenantId, existing);

    const accessTokenEncrypted = dto.password
      ? encryptToken(dto.password)
      : existing?.accessTokenEncrypted;
    if (!accessTokenEncrypted) {
      throw new BadRequestException("Enter the mailbox password or app password");
    }

    const config: EmailChannelConfig = {
      imapHost: dto.imapHost.trim(),
      imapPort: dto.imapPort,
      smtpHost: dto.smtpHost.trim(),
      smtpPort: dto.smtpPort,
      emailAddress: dto.emailAddress.trim().toLowerCase(),
      fromName: dto.fromName?.trim() || null,
    };

    // A mailbox that will not accept a login is not a connection, so this one
    // is verified up front rather than best-effort like the Meta subscribe.
    await this.emailClient.verify(config, decryptToken(accessTokenEncrypted));

    const channel = await this.upsert(existing, {
      tenantId,
      type: "email",
      externalId: config.emailAddress,
      displayName: config.fromName ?? config.emailAddress,
      accessTokenEncrypted,
      status: dto.enabled === false ? "disconnected" : "active",
      configJson: { ...config },
      lastError: null,
    });
    return toConnectionView(channel);
  }

  /** Flips a connection off without discarding its credentials or its history. */
  async setEnabled(tenantId: string, channelId: string, enabled: boolean): Promise<ChannelConnectionView> {
    const channel = await this.prisma.channel.findFirst({ where: { id: channelId, tenantId } });
    if (!channel) throw new NotFoundException("Channel not found");
    if (enabled) await this.assertCanAdd(tenantId, channel.status === "active" ? channel : null);

    const updated = await this.prisma.channel.update({
      where: { id: channelId },
      data: { status: enabled ? "active" : "disconnected" },
    });
    return toConnectionView(updated);
  }

  /**
   * Removes the connection outright. Message history survives because
   * MessageLog restricts the delete, so a channel that has ever been used is
   * disconnected instead — the operator's intent (stop using it) is met either
   * way, and nobody loses a conversation.
   */
  async remove(tenantId: string, channelId: string): Promise<{ id: string; deleted: boolean }> {
    const channel = await this.prisma.channel.findFirst({ where: { id: channelId, tenantId } });
    if (!channel) throw new NotFoundException("Channel not found");

    const used = await this.prisma.messageLog.count({ where: { tenantId, channelId } });
    if (used > 0) {
      await this.prisma.channel.update({ where: { id: channelId }, data: { status: "disconnected" } });
      return { id: channelId, deleted: false };
    }
    await this.prisma.channel.delete({ where: { id: channelId } });
    return { id: channelId, deleted: true };
  }

  findByType(tenantId: string, type: ChannelType) {
    return this.prisma.channel.findFirst({ where: { tenantId, type } });
  }

  /** Includes the encrypted secret — internal callers only, never a controller response. */
  async getWithCredentials(tenantId: string, channelId: string) {
    const channel = await this.prisma.channel.findFirst({ where: { id: channelId, tenantId } });
    if (!channel) throw new NotFoundException("Channel not found");
    return channel;
  }

  /**
   * Inbound routing: the Page id, Instagram account id or mailbox a message
   * arrived at. Deliberately not tenant-scoped — a webhook names an account,
   * not a tenant, and the pair is unique across the table. Callers run in the
   * queue worker, outside the tenant-scoping middleware's request context.
   */
  findByExternalId(type: ChannelType, externalId: string) {
    return this.prisma.channel.findFirst({ where: { type, externalId } });
  }

  private async assertCanAdd(tenantId: string, existing: { id: string } | null) {
    // Re-saving an existing connection is an edit, not a new channel, so it
    // must not be charged against the plan's channel limit.
    if (!existing) await this.entitlements.assertCanAdd(tenantId, "channels");
  }

  private upsert(
    existing: { id: string } | null,
    data: {
      tenantId: string;
      type: ChannelType;
      externalId: string;
      displayName: string | null;
      accessTokenEncrypted: string;
      status: "active" | "disconnected";
      configJson: Record<string, unknown>;
      lastError?: string | null;
    },
  ) {
    if (existing) {
      const { tenantId: _tenantId, ...updatable } = data;
      return this.prisma.channel.update({
        where: { id: existing.id },
        data: { ...updatable, configJson: data.configJson as never },
      });
    }
    return this.prisma.channel.create({ data: { ...data, configJson: data.configJson as never } });
  }

  private async trySubscribePage(channel: Channel, pageId: string) {
    try {
      await this.messengerClient.subscribePageToApp(channel, pageId);
      await this.prisma.channel.update({ where: { id: channel.id }, data: { lastError: null } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not subscribe the Page to webhooks";
      await this.prisma.channel.update({
        where: { id: channel.id },
        data: {
          lastError: `Connected, but subscribing the Page to webhooks failed — subscribe it by hand in the Meta App Dashboard. (${message})`,
        },
      });
    }
  }
}
