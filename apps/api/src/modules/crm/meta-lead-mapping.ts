import { CUSTOM_TARGET_PREFIX, IGNORE_TARGET, LEAD_STANDARD_TARGETS, type LeadStandardTarget } from "@starpos-crm/shared";

/** One answer as Meta reports it on a lead. */
export interface MetaLeadFieldDatum {
  name: string;
  values?: string[];
}

/** A lead as returned by the Graph API, both from /{leadgen_id} and /{form_id}/leads. */
export interface MetaLeadRecord {
  id: string;
  created_time?: string;
  ad_id?: string;
  form_id?: string;
  field_data?: MetaLeadFieldDatum[];
}

export interface MappedMetaLead {
  name: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  notes: string | null;
  /** Answers destined for the tenant's custom fields, keyed by field key. */
  custom: Record<string, string>;
  /** Questions with no mapping and no matching custom field, kept for display. */
  unmapped: Record<string, string>;
}

/**
 * Meta's own question names for the standard lead fields. A form that uses
 * these needs no manual mapping at all, which covers most lead ads.
 */
const DEFAULT_TARGETS: Record<string, LeadStandardTarget> = {
  full_name: "name",
  name: "name",
  first_name: "name",
  last_name: "name",
  email: "email",
  email_address: "email",
  phone_number: "phone",
  phone: "phone",
  mobile_number: "phone",
  work_phone_number: "phone",
  company_name: "company",
  company: "company",
  job_title: "company",
};

function isStandardTarget(value: string): value is LeadStandardTarget {
  return (LEAD_STANDARD_TARGETS as readonly string[]).includes(value);
}

/** Meta sends every answer as a list; a multi-choice answer becomes a comma list. */
function readValue(datum: MetaLeadFieldDatum): string {
  return (datum.values ?? [])
    .map((value) => String(value).trim())
    .filter((value) => value.length > 0)
    .join(", ");
}

/**
 * Works out what each answer on a Meta lead becomes on our Lead row.
 *
 * Precedence: the tenant's explicit mapping wins, then a custom field whose
 * key matches the question name, then Meta's own standard question names.
 * Anything still unclaimed is returned separately rather than dropped.
 */
export function mapMetaLead(
  record: MetaLeadRecord,
  mapping: Record<string, string> | null | undefined,
  customFieldKeys: Iterable<string>,
): MappedMetaLead {
  const keys = new Set(customFieldKeys);
  const standard: Record<LeadStandardTarget, string[]> = {
    name: [],
    phone: [],
    email: [],
    company: [],
    notes: [],
  };
  const custom: Record<string, string> = {};
  const unmapped: Record<string, string> = {};

  for (const datum of record.field_data ?? []) {
    const question = String(datum.name ?? "").trim();
    if (!question) continue;
    const value = readValue(datum);
    if (!value) continue;

    const explicit = mapping?.[question];
    if (explicit === IGNORE_TARGET) continue;

    if (explicit && explicit.startsWith(CUSTOM_TARGET_PREFIX)) {
      const key = explicit.slice(CUSTOM_TARGET_PREFIX.length);
      if (keys.has(key)) custom[key] = value;
      else unmapped[question] = value;
      continue;
    }
    if (explicit && isStandardTarget(explicit)) {
      standard[explicit].push(value);
      continue;
    }

    if (keys.has(question)) {
      custom[question] = value;
      continue;
    }

    const fallback = DEFAULT_TARGETS[question.toLowerCase()];
    if (fallback) standard[fallback].push(value);
    else unmapped[question] = value;
  }

  // first_name and last_name both land on "name", so joining rather than
  // overwriting is what turns them back into a full name.
  const join = (target: LeadStandardTarget, separator = " ") => {
    const parts = Array.from(new Set(standard[target].filter(Boolean)));
    return parts.length > 0 ? parts.join(separator) : null;
  };

  return {
    name: join("name"),
    phone: join("phone", ", "),
    email: join("email", ", "),
    company: join("company", ", "),
    notes: join("notes", "\n"),
    custom,
    unmapped,
  };
}

/** Lead.name is not nullable, so a form with no name question still needs a label. */
export function leadDisplayName(mapped: MappedMetaLead): string {
  return mapped.name ?? mapped.email ?? mapped.phone ?? "Meta lead";
}
