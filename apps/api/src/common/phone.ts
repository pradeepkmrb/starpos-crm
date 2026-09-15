/** E.164-ish: optional leading +, 7–15 digits, no leading zero on the country code. */
const PHONE_RE = /^\+?[1-9]\d{6,14}$/;

/**
 * Normalises a phone number to the digits-only form Meta expects and the
 * form Contact.whatsappNumber is stored in, or null when it is not a
 * plausible number. Spaces, dashes, dots and brackets are tolerated so a
 * pasted "+91 98765-43210" works.
 */
export function normalizeWhatsappNumber(raw: string): string | null {
  const cleaned = raw.trim().replace(/[\s\-().]/g, "");
  return PHONE_RE.test(cleaned) ? cleaned.replace(/^\+/, "") : null;
}
