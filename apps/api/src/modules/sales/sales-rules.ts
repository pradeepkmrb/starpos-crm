import { CLOSED_LEAD_STATUSES, LEAD_STATUSES, type LeadStatus, type QuotationStatus } from "@digitel/shared";

/**
 * The lead stage a quotation implies: sending one means a proposal is out,
 * and acceptance means the deal is won. Only ever moves a lead forward, and
 * never reopens a closed lead (a rejected quote leaves the stage alone).
 */
export function stageImpliedByQuotation(current: LeadStatus, status: QuotationStatus): LeadStatus | null {
  if (CLOSED_LEAD_STATUSES.includes(current)) return null;
  if (status === "accepted") return "won";
  if (status === "sent") {
    return LEAD_STATUSES.indexOf("proposal") > LEAD_STATUSES.indexOf(current) ? "proposal" : null;
  }
  return null;
}

/**
 * Which status changes a quotation may make. A draft goes out; a sent quote
 * gets an answer; an answer can be revised (a customer changes their mind),
 * and a rejected quote can be re-sent. Nothing goes back to draft.
 */
export function canMoveQuotation(from: QuotationStatus, to: QuotationStatus): boolean {
  if (from === to) return false;
  if (to === "draft") return false;
  if (from === "draft") return to === "sent" || to === "accepted";
  return true;
}

export function formatQuoteNumber(seq: number): string {
  return `QT-${seq}`;
}

/** The business details printed on quotation PDFs, stored on Tenant.businessProfileJson. */
export interface BusinessProfile {
  legalName?: string;
  address?: string;
  gstin?: string;
  phone?: string;
  email?: string;
  /** Terms and conditions printed at the foot of every quote. */
  terms?: string;
  /** Default number of days a new quote stays valid. */
  validityDays?: number;
}

export function parseBusinessProfile(value: unknown): BusinessProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const v = value as Record<string, unknown>;
  const text = (key: string) => (typeof v[key] === "string" && (v[key] as string).trim() ? (v[key] as string).trim() : undefined);
  const days = typeof v.validityDays === "number" && v.validityDays > 0 ? Math.round(v.validityDays) : undefined;
  return {
    legalName: text("legalName"),
    address: text("address"),
    gstin: text("gstin"),
    phone: text("phone"),
    email: text("email"),
    terms: text("terms"),
    validityDays: days,
  };
}

/**
 * A click-to-chat link that opens the rep's own WhatsApp with the quote link
 * ready to send — the fallback when the business number can't message the
 * customer (no open 24-hour window).
 */
export function whatsappShareLink(phoneDigits: string, message: string): string {
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`;
}
