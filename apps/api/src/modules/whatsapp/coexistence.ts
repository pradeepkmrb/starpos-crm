import type { MetaCoexistenceMessage } from "./webhook-payload.types";

/**
 * Helpers for WhatsApp Business app "coexistence" numbers — ones that stay on
 * the phone app while also connected to Cloud API. Meta replays the app's
 * chat history (`history`) and mirrors messages the business types on the
 * phone (`smb_message_echoes`); these turn both into MessageLog rows.
 */

/** Tags rows that came from the phone app, not from this platform. */
export const BUSINESS_APP_SOURCE = "whatsapp_business_app";

/** The bubble text for a message: its body, or its type for media and the like. */
export function coexistenceMessageText(message: MetaCoexistenceMessage): string {
  return message.text?.body ?? `[${message.type ?? "message"}]`;
}

/**
 * A history thread is keyed by the customer's number, so anything not sent
 * from that number was sent by the business. Comparing against the thread id
 * avoids depending on how the business number is formatted in metadata.
 */
export function historyDirection(threadId: string, message: MetaCoexistenceMessage): "inbound" | "outbound" {
  return message.from === threadId ? "inbound" : "outbound";
}

/** History reports statuses upper-cased ("READ"); MessageLog stores ours lower-cased. */
export function historyStatus(direction: "inbound" | "outbound", status?: string): string {
  if (direction === "inbound") return "received";
  const normalized = status?.toLowerCase();
  if (normalized === "delivered" || normalized === "read" || normalized === "failed") return normalized;
  return "sent";
}

/** Meta timestamps are unix seconds as strings; fall back to now when absent or garbled. */
export function metaTimestampToDate(timestamp?: string): Date {
  const seconds = Number(timestamp);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : new Date();
}
