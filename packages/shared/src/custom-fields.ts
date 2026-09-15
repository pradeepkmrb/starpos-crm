/**
 * Tenant-defined fields. One builder serves every entry screen that has one,
 * so the input kinds and the entity list live here rather than beside any one
 * feature.
 */

/** The entry screens a tenant can add their own fields to. */
export const CUSTOM_FIELD_ENTITIES = ["lead", "contact"] as const;
export type CustomFieldEntity = (typeof CUSTOM_FIELD_ENTITIES)[number];

/** Input kinds a tenant can choose when adding a field. */
export const CUSTOM_FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "date",
  "dropdown",
  "radio",
  "checkbox",
] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

/** The types whose answers must come from a fixed list of choices. */
export const CHOICE_FIELD_TYPES: CustomFieldType[] = ["dropdown", "radio"];

export function isChoiceFieldType(type: CustomFieldType): boolean {
  return CHOICE_FIELD_TYPES.includes(type);
}

/** Plain-language names for the input kinds, since "dropdown" beats "select". */
export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: "Text box",
  textarea: "Paragraph",
  number: "Number",
  date: "Date",
  dropdown: "Dropdown",
  radio: "Radio buttons",
  checkbox: "Tick box",
};

/** What each entity's fields are called, and where their answers are entered. */
export const CUSTOM_FIELD_ENTITY_LABELS: Record<CustomFieldEntity, { singular: string; screen: string }> = {
  lead: { singular: "lead", screen: "lead entry" },
  contact: { singular: "contact", screen: "contact" },
};
