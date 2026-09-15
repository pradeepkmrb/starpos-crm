export const EMAIL_SYNC_QUEUE = "email-sync";

/** How often every connected mailbox is polled. IMAP has no webhooks, so this is the floor on inbox latency. */
export const EMAIL_SYNC_INTERVAL_MS = Number(process.env.EMAIL_SYNC_INTERVAL_MS ?? 60_000);
