import { BadRequestException } from "@nestjs/common";
import { isChoiceFieldType, type CustomFieldType } from "@digitel/shared";

/** The slice of a CustomField row this module needs. */
export interface CustomFieldDefinition {
  key: string;
  label: string;
  type: CustomFieldType;
  required: boolean;
  isActive: boolean;
  optionsJson: unknown;
}

export type CustomFieldValue = string | number | boolean;

const MAX_TEXT_LENGTH = 2000;
const MAX_KEY_LENGTH = 40;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Keys that would land on Object.prototype if a stored answer map were ever
 * spread into a plain object. Never derived from a label, never accepted.
 */
const RESERVED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Options are stored as free-form JSON; anything that isn't a string list reads as "no choices". */
export function readOptions(optionsJson: unknown): string[] {
  if (!Array.isArray(optionsJson)) return [];
  return optionsJson.filter((option): option is string => typeof option === "string");
}

/**
 * Turns a human label into the stable machine key the answers are stored
 * under. The key never changes afterwards, so renaming a field's label keeps
 * every answer already on file.
 */
export function slugifyFieldKey(label: string): string {
  const slug = label
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_KEY_LENGTH)
    .replace(/_+$/, "");
  if (!slug) return "field";
  return RESERVED_KEYS.has(slug) ? `f_${slug}` : slug;
}

/** Appends a numeric suffix until the key is free within the tenant. */
export function uniqueFieldKey(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base.slice(0, MAX_KEY_LENGTH - 4)}_${n}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new BadRequestException("Too many fields share this name — give this one a different label");
}

/** Reads whatever came off the wire for one field and rejects anything the type can't hold. */
function coerceValue(definition: CustomFieldDefinition, raw: unknown): CustomFieldValue | null {
  const { label, type } = definition;

  if (type === "checkbox") {
    if (typeof raw === "boolean") return raw;
    const text = String(raw ?? "").trim().toLowerCase();
    if (["true", "yes", "1", "on"].includes(text)) return true;
    if (["", "false", "no", "0", "off"].includes(text)) return false;
    throw new BadRequestException(`${label} must be a yes/no answer`);
  }

  if (raw === null || raw === undefined) return null;
  const text = typeof raw === "string" ? raw.trim() : String(raw);
  if (text === "") return null;

  switch (type) {
    case "number": {
      const parsed = Number(text);
      if (!Number.isFinite(parsed)) throw new BadRequestException(`${label} must be a number`);
      return parsed;
    }
    case "date": {
      // Both checks are needed: the pattern rejects "2026-1-5", the parse
      // rejects a well-shaped but impossible date like "2026-02-31".
      if (!ISO_DATE.test(text)) throw new BadRequestException(`${label} must be a date (YYYY-MM-DD)`);
      const parsed = new Date(`${text}T00:00:00Z`);
      if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
        throw new BadRequestException(`${label} must be a real date`);
      }
      return text;
    }
    case "dropdown":
    case "radio": {
      const options = readOptions(definition.optionsJson);
      if (!options.includes(text)) {
        throw new BadRequestException(`${label} must be one of: ${options.join(", ")}`);
      }
      return text;
    }
    default: {
      if (text.length > MAX_TEXT_LENGTH) {
        throw new BadRequestException(`${label} must be ${MAX_TEXT_LENGTH} characters or fewer`);
      }
      return text;
    }
  }
}

export interface NormalizeOptions {
  /** Answers already on file — a patch that omits a field must not blank it. */
  existing?: Record<string, unknown> | null;
  /**
   * Whether a required field with no answer is an error. Manual lead entry
   * says yes; a lead arriving from a Meta ad says no, because rejecting it
   * would drop a real lead the tenant paid for.
   */
  enforceRequired?: boolean;
}

/**
 * Validates the answers to a tenant's custom fields and returns the map to
 * store. Answers to fields that were since retired are carried through
 * untouched, and keys with no definition at all are dropped rather than
 * stored, so the JSON column can't be used as arbitrary storage.
 */
export function normalizeCustomFieldValues(
  definitions: CustomFieldDefinition[],
  submitted: Record<string, unknown> | null | undefined,
  options: NormalizeOptions = {},
): Record<string, CustomFieldValue> {
  const { existing, enforceRequired = true } = options;
  const resolved: Record<string, CustomFieldValue> = {};

  // Start from what is already stored, including answers to retired fields.
  const activeKeys = new Set(definitions.filter((d) => d.isActive).map((d) => d.key));
  for (const [key, value] of Object.entries(existing ?? {})) {
    if (RESERVED_KEYS.has(key)) continue;
    if (value === null || value === undefined) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      resolved[key] = value;
    }
  }

  for (const definition of definitions) {
    if (!definition.isActive) continue;
    const wasSubmitted =
      submitted != null && Object.prototype.hasOwnProperty.call(submitted, definition.key);

    if (wasSubmitted) {
      const value = coerceValue(definition, submitted![definition.key]);
      if (value === null) delete resolved[definition.key];
      else resolved[definition.key] = value;
    }

    if (enforceRequired && definition.required) {
      const value = resolved[definition.key];
      // A required tick-box means "must be ticked" — that is what consent
      // and terms-acceptance fields are for.
      const answered = definition.type === "checkbox" ? value === true : value !== undefined;
      if (!answered) throw new BadRequestException(`${definition.label} is required`);
    }
  }

  // Drop anything the tenant never defined (or defined and then deleted).
  for (const key of Object.keys(resolved)) {
    if (!activeKeys.has(key) && !(existing && key in existing)) delete resolved[key];
  }

  return resolved;
}
