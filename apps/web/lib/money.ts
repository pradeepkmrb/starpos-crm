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
