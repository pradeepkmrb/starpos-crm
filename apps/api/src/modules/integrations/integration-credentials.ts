import { BadRequestException } from "@nestjs/common";
import type { IntegrationSpec } from "@digitel/shared";

export type CredentialMap = Record<string, string>;

/** How much of a secret is safe to echo back so an operator can recognise it. */
const VISIBLE_TAIL = 4;

/**
 * Shows enough of a value to tell two keys apart and nothing more. Short
 * values are masked whole rather than mostly revealed.
 */
export function maskValue(value: string): string {
  if (!value) return "";
  if (value.length <= VISIBLE_TAIL * 2) return "••••••";
  return `••••••${value.slice(-VISIBLE_TAIL)}`;
}

/**
 * Validates what the operator submitted against the provider's field spec.
 *
 * A blank secret means "keep what is stored", so rotating one key does not
 * force the others to be retyped. Fields the spec does not define are
 * dropped rather than stored, so the encrypted blob can only ever hold what
 * the provider asked for.
 */
export function normalizeCredentials(
  spec: IntegrationSpec,
  submitted: Record<string, unknown> | null | undefined,
  existing?: CredentialMap | null,
): CredentialMap {
  const result: CredentialMap = {};

  for (const field of spec.fields) {
    const raw = submitted?.[field.key];
    const value = typeof raw === "string" ? raw.trim() : raw === undefined || raw === null ? "" : String(raw).trim();

    if (value) {
      result[field.key] = value;
      continue;
    }

    // Blank on a secret keeps the stored one; blank on a visible field
    // clears it, because the operator can see exactly what they erased.
    const kept = field.secret ? existing?.[field.key] : undefined;
    if (kept) {
      result[field.key] = kept;
      continue;
    }

    if (field.required) {
      throw new BadRequestException(`${spec.name}: ${field.label} is required`);
    }
  }

  return result;
}

/** Reads "test" or "live" off the key prefix the provider uses. */
export function detectMode(spec: IntegrationSpec, credentials: CredentialMap): string | null {
  if (!spec.modeFrom) return null;
  const value = credentials[spec.modeFrom.field] ?? "";
  if (value.startsWith(spec.modeFrom.livePrefix)) return "live";
  if (value.startsWith(spec.modeFrom.testPrefix)) return "test";
  return null;
}

/** The non-secret half of a connection, safe to hand back to the dashboard. */
export function buildPublicView(spec: IntegrationSpec, credentials: CredentialMap) {
  const values: Record<string, string> = {};
  for (const field of spec.fields) {
    const value = credentials[field.key];
    if (!value) continue;
    values[field.key] = field.secret ? maskValue(value) : value;
  }
  return values;
}
