import { Injectable, Logger } from "@nestjs/common";
import { ImapFlow } from "imapflow";
import { type ParsedMail, simpleParser } from "mailparser";
import nodemailer from "nodemailer";

/** Non-secret half of an email channel's settings; the password lives encrypted on the row. */
export interface EmailChannelConfig {
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  emailAddress: string;
  fromName?: string | null;
}

export interface FetchedEmail {
  uid: number;
  messageId: string;
  fromAddress: string;
  fromName: string | null;
  subject: string;
  text: string;
  receivedAt: Date;
  inReplyTo: string | null;
}

/**
 * A first sync would otherwise drag in years of archived mail and bury the
 * inbox, so it starts from the newest few and lets the UID cursor take over.
 */
export const FIRST_SYNC_MESSAGE_LIMIT = 25;

/** Guards against one runaway poll importing a whole mailbox in a single job. */
export const MAX_MESSAGES_PER_SYNC = 100;

export class EmailChannelError extends Error {}

@Injectable()
export class EmailClient {
  private readonly logger = new Logger(EmailClient.name);

  /**
   * Pulls everything that arrived after `sinceUid` and returns it with the new
   * high-water mark. IMAP has no "give me what's new" primitive — the UID is
   * the only stable, monotonic cursor a mailbox offers.
   */
  async fetchNewMessages(
    config: EmailChannelConfig,
    password: string,
    sinceUid: number | null,
  ): Promise<{ messages: FetchedEmail[]; lastUid: number | null }> {
    const client = new ImapFlow({
      host: config.imapHost,
      port: config.imapPort,
      secure: config.imapPort === 993,
      auth: { user: config.emailAddress, pass: password },
      logger: false,
    });

    try {
      await client.connect();
    } catch (err) {
      throw new EmailChannelError(describeConnectionError("IMAP", config.imapHost, err));
    }

    const messages: FetchedEmail[] = [];
    let lastUid = sinceUid;

    try {
      const lock = await client.getMailboxLock("INBOX");
      try {
        const mailbox = client.mailbox;
        const total = typeof mailbox === "object" ? mailbox.exists : 0;
        if (total === 0) return { messages, lastUid };

        // `uid:*` always yields at least the newest message even when nothing
        // is newer than the cursor, so the uid is re-checked below.
        const range = sinceUid
          ? `${sinceUid + 1}:*`
          : `${Math.max(1, total - FIRST_SYNC_MESSAGE_LIMIT + 1)}:*`;
        const options = sinceUid ? { uid: true } : undefined;

        for await (const message of client.fetch(range, { uid: true, source: true }, options)) {
          if (sinceUid !== null && message.uid <= sinceUid) continue;
          if (lastUid === null || message.uid > lastUid) lastUid = message.uid;
          if (messages.length >= MAX_MESSAGES_PER_SYNC) continue;

          if (!message.source) continue;
          const parsed: ParsedMail = await simpleParser(message.source);
          const from = parsed.from?.value?.[0];
          if (!from?.address) continue; // nothing to reply to

          messages.push({
            uid: message.uid,
            // Falling back to the UID keeps the MessageLog dedupe key unique
            // for the rare sender that omits Message-ID.
            messageId: parsed.messageId ?? `imap-uid-${message.uid}@${config.emailAddress}`,
            fromAddress: from.address.toLowerCase(),
            fromName: from.name || null,
            subject: parsed.subject ?? "(no subject)",
            text: extractBody(parsed.text, parsed.html),
            receivedAt: parsed.date ?? new Date(),
            inReplyTo: parsed.inReplyTo ?? null,
          });
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => client.close());
    }

    return { messages, lastUid };
  }

  async sendMessage(
    config: EmailChannelConfig,
    password: string,
    params: { to: string; subject: string; text: string; inReplyTo?: string | null },
  ): Promise<{ messageId: string }> {
    const transport = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      // 465 is implicit TLS; 587 and 25 start plaintext and upgrade with STARTTLS.
      secure: config.smtpPort === 465,
      auth: { user: config.emailAddress, pass: password },
    });

    try {
      const info = await transport.sendMail({
        from: config.fromName ? `"${config.fromName}" <${config.emailAddress}>` : config.emailAddress,
        to: params.to,
        subject: params.subject,
        text: params.text,
        // Both headers, so every mail client threads the reply rather than
        // starting a new conversation.
        ...(params.inReplyTo
          ? { inReplyTo: params.inReplyTo, references: [params.inReplyTo] }
          : {}),
      });
      return { messageId: info.messageId };
    } catch (err) {
      throw new EmailChannelError(describeConnectionError("SMTP", config.smtpHost, err));
    } finally {
      transport.close();
    }
  }

  /** Used by "Sync now" and on save, so a wrong password is reported immediately. */
  async verify(config: EmailChannelConfig, password: string): Promise<void> {
    const client = new ImapFlow({
      host: config.imapHost,
      port: config.imapPort,
      secure: config.imapPort === 993,
      auth: { user: config.emailAddress, pass: password },
      logger: false,
    });
    try {
      await client.connect();
      await client.logout();
    } catch (err) {
      throw new EmailChannelError(describeConnectionError("IMAP", config.imapHost, err));
    }
  }
}

/** Prefers the plain-text part; falls back to stripping tags off the HTML one. */
function extractBody(text: string | undefined, html: string | false | undefined): string {
  if (text?.trim()) return text.trim();
  if (typeof html === "string" && html.trim()) {
    return html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  return "[no text content]";
}

/**
 * Raw IMAP/SMTP failures read like "Invalid credentials (Failure)" with no clue
 * which server refused, so the host is named and the common causes spelled out —
 * for Gmail this is almost always a missing app password.
 */
function describeConnectionError(protocol: "IMAP" | "SMTP", host: string, err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/auth|credential|password|login/i.test(raw)) {
    return `${protocol} login to ${host} was rejected. For Gmail and Outlook you need a 16-character app password, not your normal one. (${raw})`;
  }
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|timed out/i.test(raw)) {
    return `Could not reach the ${protocol} server ${host}. Check the host and port. (${raw})`;
  }
  return `${protocol} error from ${host}: ${raw}`;
}
