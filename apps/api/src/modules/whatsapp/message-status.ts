import type { MetaStatusUpdate } from "./webhook-payload.types";

const RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3 };

/**
 * Whether a status webhook should overwrite the stored status. Meta does not
 * guarantee ordering, so a late "delivered" must not demote a "read". A
 * "failed" replaces sent/delivered (Meta accepted the send, then couldn't
 * deliver it) but not "read", and nothing moves a message out of "failed".
 */
export function shouldApplyStatus(current: string, next: string): boolean {
  if (current === next || current === "failed") return false;
  if (next === "failed") return current !== "read";
  const nextRank = RANK[next];
  if (nextRank === undefined) return false;
  return nextRank > (RANK[current] ?? 0);
}

/**
 * The reason Meta attaches to an asynchronous "failed" status, e.g.
 * "(#131026) Message undeliverable". Null when Meta sent no error.
 */
export function describeStatusError(status: MetaStatusUpdate): string | null {
  const err = status.errors?.[0];
  if (!err) return null;
  const detail = err.error_data?.details ?? err.message ?? err.title ?? "Delivery failed";
  return err.code ? `(#${err.code}) ${detail}` : detail;
}
