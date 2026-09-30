/** Quotations, payments and targets — shared by the API, web builder and mobile app. */

export const QUOTATION_STATUSES = ["draft", "sent", "accepted", "rejected"] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export const QUOTATION_STATUS_LABELS: Record<QuotationStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  rejected: "Rejected",
};

export const PAYMENT_MODES = ["cash", "upi", "cheque", "bank_transfer", "card", "other"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  cash: "Cash",
  upi: "UPI",
  cheque: "Cheque",
  bank_transfer: "Bank transfer",
  card: "Card",
  other: "Other",
};

export interface QuoteLineInput {
  quantity: number;
  unitPricePaise: number;
  /** Percentage, e.g. 18 for 18% GST. */
  taxPercent: number;
}

export interface QuoteTotals {
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  totalPaise: number;
  /** Tax per distinct rate, for the "GST (18%)" lines on the quote. */
  taxByRate: { taxPercent: number; taxablePaise: number; taxPaise: number }[];
  /** Each line's own pre-tax amount (quantity × unit price). */
  lineAmountsPaise: number[];
}

/**
 * Quote maths, in whole paise. The discount comes off before tax — so a
 * ₹23,500 order with ₹2,000 off at 18% GST is ₹21,500 + ₹3,870 = ₹25,370 —
 * and is spread across lines in proportion to their value so each line is
 * taxed at its own rate. Rounding leftovers go to the last line, so the
 * spread discount always adds back up to exactly the discount given.
 */
export function quoteTotals(lines: QuoteLineInput[], discountPaise = 0): QuoteTotals {
  const lineAmountsPaise = lines.map((l) => Math.round(Math.max(0, l.quantity) * Math.max(0, l.unitPricePaise)));
  const subtotalPaise = lineAmountsPaise.reduce((sum, a) => sum + a, 0);
  const discount = Math.min(Math.max(0, Math.round(discountPaise)), subtotalPaise);

  let discountLeft = discount;
  const byRate = new Map<number, { taxablePaise: number; taxPaise: number }>();
  let taxPaise = 0;

  lineAmountsPaise.forEach((amount, i) => {
    const isLast = i === lineAmountsPaise.length - 1;
    const share = subtotalPaise === 0 ? 0 : isLast ? discountLeft : Math.floor((discount * amount) / subtotalPaise);
    discountLeft -= share;
    const taxable = amount - share;
    const rate = Math.max(0, lines[i].taxPercent);
    const tax = Math.round((taxable * rate) / 100);
    taxPaise += tax;
    const entry = byRate.get(rate) ?? { taxablePaise: 0, taxPaise: 0 };
    entry.taxablePaise += taxable;
    entry.taxPaise += tax;
    byRate.set(rate, entry);
  });

  return {
    subtotalPaise,
    discountPaise: discount,
    taxPaise,
    totalPaise: subtotalPaise - discount + taxPaise,
    taxByRate: [...byRate.entries()]
      .filter(([rate]) => rate > 0)
      .sort(([a], [b]) => a - b)
      .map(([taxPercent, v]) => ({ taxPercent, ...v })),
    lineAmountsPaise,
  };
}

/** ₹25,370 or ₹25,370.50 — Indian digit grouping, paise only when present. */
export function formatInr(paise: number): string {
  const rupees = paise / 100;
  const hasPaise = paise % 100 !== 0;
  return `₹${rupees.toLocaleString("en-IN", {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

/** The "YYYY-MM" month a moment falls in, in the given time zone. */
export function monthKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  return `${year}-${month}`;
}

/**
 * The UTC instants a "YYYY-MM" month starts and ends at in a time zone —
 * e.g. 2026-09 in Asia/Kolkata runs from 2026-08-31T18:30Z to 2026-09-30T18:30Z.
 */
export function monthRange(month: string, timeZone: string): { start: Date; end: Date } {
  const [year, m] = month.split("-").map(Number);
  return { start: zonedMidnight(year, m, 1, timeZone), end: zonedMidnight(m === 12 ? year + 1 : year, m === 12 ? 1 : m + 1, 1, timeZone) };
}

/** The "YYYY-MM-DD" calendar day a moment falls on, in the given time zone. */
export function dayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** The UTC instants a "YYYY-MM-DD" day starts and ends at in a time zone. */
export function dayRange(day: string, timeZone: string): { start: Date; end: Date } {
  const [year, month, d] = day.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, d + 1));
  return {
    start: zonedMidnight(year, month, d, timeZone),
    end: zonedMidnight(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), timeZone),
  };
}

/** Midnight on a calendar date in a time zone, as a UTC Date. */
function zonedMidnight(year: number, month: number, day: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day);
  const offset = zoneOffsetMs(new Date(guess), timeZone);
  // Re-check at the corrected instant in case the offset differs (DST edges).
  const corrected = guess - offset;
  return new Date(guess - zoneOffsetMs(new Date(corrected), timeZone));
}

/** How far ahead of UTC a zone's wall clock is at a moment, in ms. */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return wall - Math.floor(date.getTime() / 1000) * 1000;
}
