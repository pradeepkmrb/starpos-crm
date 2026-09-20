import type { Product } from "./api";

/** Formats a catalogue price for display; shared by the dashboard and the public catalogue. */
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    // An operator can save any 3-letter code; Intl throws on the ones it
    // doesn't know rather than falling back on its own.
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** Tax is added on top of the price, so what the shopper pays is price + tax. */
export function priceWithTax(product: Product): number {
  return Math.round(product.price * (1 + product.taxPercent / 100) * 100) / 100;
}

/** "1,234.50" or "1234.5" typed by a person, as paise; null when it isn't a number. */
export function rupeesToPaise(input: string): number | null {
  const cleaned = input.replace(/[,\s₹]/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
}

/** Paise as the plain number a rupee input box shows: 250000 → "2500", 250050 → "2500.5". */
export function paiseToInput(paise: number): string {
  return String(Math.round(paise) / 100);
}

/** Today as a date input value (YYYY-MM-DD) in local time. */
export function todayInput(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The current month as YYYY-MM in local time. */
export function currentMonthInput(now = new Date()): string {
  return todayInput(now).slice(0, 7);
}
