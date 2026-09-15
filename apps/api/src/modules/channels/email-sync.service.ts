import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { decryptToken } from "../../common/token-encryption";
import { ContactsService } from "../contacts/contacts.service";
import { AutomationEngineService } from "../automations/automation-engine.service";
import { EmailChannelError, EmailClient } from "./email.client";
import { emailConfig } from "./outbound-dispatcher.service";

export interface EmailSyncResult {
  channelId: string;
  fetched: number;
  imported: number;
  lastSyncedAt: Date;
}

/**
 * Pulls new mail into the Inbox. Email is the one channel with no webhook, so
 * it is polled — by a repeatable queue job, and on demand from the "Sync now"
 * button on the Connections page.
 */
@Injectable()
export class EmailSyncService {
  private readonly logger = new Logger(EmailSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailClient: EmailClient,
    private readonly contactsService: ContactsService,
    private readonly automationEngine: AutomationEngineService,
  ) {}

  /** Every active mailbox across every tenant — the repeatable job's entry point. */
  async syncAllChannels(): Promise<EmailSyncResult[]> {
    const channels = await this.prisma.channel.findMany({
      where: { type: "email", status: "active" },
      select: { id: true, tenantId: true },
    });

    const results: EmailSyncResult[] = [];
    for (const channel of channels) {
      try {
        results.push(await this.syncChannel(channel.tenantId, channel.id));
      } catch (err) {
        // One unreachable mailbox must not stop the others; the failure is
        // already recorded on the channel row for the operator to see.
        this.logger.warn(
          `Email sync failed for channel ${channel.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    return results;
  }

  async syncChannel(tenantId: string, channelId: string): Promise<EmailSyncResult> {
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, tenantId, type: "email" },
    });
    if (!channel) throw new NotFoundException("Email channel not found");

    const config = emailConfig(channel);
    const sinceUid = channel.syncCursor ? Number(channel.syncCursor) : null;

    let fetched: Awaited<ReturnType<EmailClient["fetchNewMessages"]>>;
    try {
      fetched = await this.emailClient.fetchNewMessages(
        config,
        decryptToken(channel.accessTokenEncrypted),
        Number.isFinite(sinceUid) ? sinceUid : null,
      );
    } catch (err) {
      const message = err instanceof EmailChannelError ? err.message : "Mailbox sync failed";
      await this.prisma.channel.update({
        where: { id: channel.id },
        data: { lastError: message, lastSyncedAt: new Date() },
      });
      throw err;
    }

    let imported = 0;
    for (const message of fetched.messages) {
      // The mailbox sees our own sent replies too on some providers; skipping
      // our address keeps the thread from echoing back at us.
      if (message.fromAddress === config.emailAddress) continue;
      if (await this.recordInbound(channel.tenantId, channel.id, message)) imported += 1;
    }

    const lastSyncedAt = new Date();
    await this.prisma.channel.update({
      where: { id: channel.id },
      data: {
        // Advancing the cursor even when nothing was imported stops the next
        // poll from re-reading the same messages forever.
        syncCursor: fetched.lastUid !== null ? String(fetched.lastUid) : channel.syncCursor,
        lastSyncedAt,
        lastError: null,
      },
    });

    return { channelId: channel.id, fetched: fetched.messages.length, imported, lastSyncedAt };
  }

  private async recordInbound(
    tenantId: string,
    channelId: string,
    message: Awaited<ReturnType<EmailClient["fetchNewMessages"]>>["messages"][number],
  ): Promise<boolean> {
    const existing = await this.prisma.messageLog.findUnique({
      where: { waMessageId: message.messageId },
    });
    if (existing) return false;

    const { contact, isNew } = await this.contactsService.upsertByExternalId(
      tenantId,
      "email",
      message.fromAddress,
      { name: message.fromName ?? undefined, markInbound: true, source: "email" },
    );

    await this.prisma.messageLog.create({
      data: {
        tenantId,
        channelId,
        contactId: contact.id,
        direction: "inbound",
        waMessageId: message.messageId,
        status: "received",
        payloadJson: {
          channel: "email",
          type: "email",
          subject: message.subject,
          body: message.text,
          from: message.fromAddress,
          receivedAt: message.receivedAt.toISOString(),
        },
        createdAt: message.receivedAt,
      },
    });

    await this.automationEngine.evaluate({
      tenantId,
      channelId,
      contactId: contact.id,
      // Subject and body both count as trigger text — a keyword rule for
      // "refund" should fire on a subject line that says Refund request.
      messageText: `${message.subject}\n${message.text}`,
      isNewContact: isNew,
    });
    return true;
  }
}
