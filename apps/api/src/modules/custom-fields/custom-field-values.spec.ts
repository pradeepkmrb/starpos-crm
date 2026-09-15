import { BadRequestException } from "@nestjs/common";
import {
  normalizeCustomFieldValues,
  slugifyFieldKey,
  uniqueFieldKey,
  type CustomFieldDefinition,
} from "./custom-field-values";

function def(overrides: Partial<CustomFieldDefinition> = {}): CustomFieldDefinition {
  return {
    key: "budget",
    label: "Budget",
    type: "text",
    required: false,
    isActive: true,
    optionsJson: null,
    ...overrides,
  };
}

describe("slugifyFieldKey", () => {
  it("turns a label into a machine key", () => {
    expect(slugifyFieldKey("Preferred City")).toBe("preferred_city");
    expect(slugifyFieldKey("  Budget (₹)  ")).toBe("budget");
  });

  it("never produces an empty or prototype-polluting key", () => {
    expect(slugifyFieldKey("!!!")).toBe("field");
    // The underscores are stripped, so this can never reach Object.prototype.
    expect(slugifyFieldKey("__proto__")).toBe("proto");
    expect(slugifyFieldKey("constructor")).toBe("f_constructor");
  });

  it("suffixes a key that is already taken", () => {
    expect(uniqueFieldKey("city", ["city", "city_2"])).toBe("city_3");
    expect(uniqueFieldKey("city", [])).toBe("city");
  });
});

describe("normalizeCustomFieldValues", () => {
  it("keeps only keys the tenant actually defined", () => {
    const result = normalizeCustomFieldValues([def()], { budget: "5 lakh", sneaky: "x" });
    expect(result).toEqual({ budget: "5 lakh" });
  });

  it("validates a dropdown answer against its options", () => {
    const field = def({ key: "city", label: "City", type: "dropdown", optionsJson: ["Chennai", "Madurai"] });
    expect(normalizeCustomFieldValues([field], { city: "Madurai" })).toEqual({ city: "Madurai" });
    expect(() => normalizeCustomFieldValues([field], { city: "Mumbai" })).toThrow(BadRequestException);
  });

  it("validates a radio answer the same way", () => {
    const field = def({ key: "plan", label: "Plan", type: "radio", optionsJson: ["Basic", "Pro"] });
    expect(normalizeCustomFieldValues([field], { plan: "Pro" })).toEqual({ plan: "Pro" });
    expect(() => normalizeCustomFieldValues([field], { plan: "Enterprise" })).toThrow(BadRequestException);
  });

  it("coerces numbers, dates and tick-boxes", () => {
    const fields = [
      def({ key: "size", label: "Team size", type: "number" }),
      def({ key: "visit", label: "Site visit", type: "date" }),
      def({ key: "consent", label: "Consent", type: "checkbox" }),
    ];
    expect(normalizeCustomFieldValues(fields, { size: "12", visit: "2026-03-04", consent: "yes" })).toEqual({
      size: 12,
      visit: "2026-03-04",
      consent: true,
    });
  });

  it("rejects a malformed number or date", () => {
    const number = def({ key: "size", label: "Team size", type: "number" });
    const date = def({ key: "visit", label: "Site visit", type: "date" });
    expect(() => normalizeCustomFieldValues([number], { size: "twelve" })).toThrow(BadRequestException);
    expect(() => normalizeCustomFieldValues([date], { visit: "04-03-2026" })).toThrow(BadRequestException);
    // Well-shaped but impossible.
    expect(() => normalizeCustomFieldValues([date], { visit: "2026-02-31" })).toThrow(BadRequestException);
  });

  it("enforces required fields on manual entry", () => {
    const field = def({ required: true });
    expect(() => normalizeCustomFieldValues([field], {})).toThrow(BadRequestException);
    expect(normalizeCustomFieldValues([field], { budget: "2 lakh" })).toEqual({ budget: "2 lakh" });
  });

  it("does not enforce required fields when the answers arrive from outside", () => {
    const field = def({ required: true });
    expect(normalizeCustomFieldValues([field], {}, { enforceRequired: false })).toEqual({});
  });

  it("treats a required tick-box as consent that must be ticked", () => {
    const field = def({ key: "terms", label: "Terms", type: "checkbox", required: true });
    expect(() => normalizeCustomFieldValues([field], { terms: false })).toThrow(BadRequestException);
    expect(normalizeCustomFieldValues([field], { terms: true })).toEqual({ terms: true });
  });

  it("leaves omitted answers alone on a patch but clears an emptied one", () => {
    const fields = [def(), def({ key: "city", label: "City" })];
    const existing = { budget: "5 lakh", city: "Chennai" };
    expect(normalizeCustomFieldValues(fields, { city: "Madurai" }, { existing })).toEqual({
      budget: "5 lakh",
      city: "Madurai",
    });
    expect(normalizeCustomFieldValues(fields, { city: "" }, { existing })).toEqual({ budget: "5 lakh" });
  });

  it("keeps answers to a retired field instead of erasing history", () => {
    const fields = [def(), def({ key: "old_note", label: "Old note", isActive: false })];
    const result = normalizeCustomFieldValues(fields, { budget: "1 lakh" }, {
      existing: { old_note: "from last season" },
    });
    expect(result).toEqual({ budget: "1 lakh", old_note: "from last season" });
  });
});
