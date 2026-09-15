/** Lead pipeline stages, ordered from first touch to closed. */
export const LEAD_STATUSES = ["new", "contacted", "qualified", "won", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Input kinds a tenant can choose when adding a custom field to the lead form. */
export const LEAD_FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "date",
  "dropdown",
  "radio",
  "checkbox",
] as const;
export type LeadFieldType = (typeof LEAD_FIELD_TYPES)[number];

/** The types whose answers must come from a fixed list of choices. */
export const CHOICE_FIELD_TYPES: LeadFieldType[] = ["dropdown", "radio"];

export function isChoiceFieldType(type: LeadFieldType): boolean {
  return CHOICE_FIELD_TYPES.includes(type);
}

/** Fixed lead columns a Meta form question can be mapped onto. */
export const LEAD_STANDARD_TARGETS = ["name", "phone", "email", "company", "notes"] as const;
export type LeadStandardTarget = (typeof LEAD_STANDARD_TARGETS)[number];

export const CUSTOM_TARGET_PREFIX = "custom:";
export const IGNORE_TARGET = "ignore";
