import { leadDisplayName, mapMetaLead, type MetaLeadRecord } from "./meta-lead-mapping";

function record(fieldData: { name: string; values: string[] }[]): MetaLeadRecord {
  return { id: "lead-1", created_time: "2026-03-04T10:00:00+0000", field_data: fieldData };
}

describe("mapMetaLead", () => {
  it("recognises Meta's standard question names with no mapping configured", () => {
    const mapped = mapMetaLead(
      record([
        { name: "full_name", values: ["Asha Rao"] },
        { name: "email", values: ["asha@example.com"] },
        { name: "phone_number", values: ["+919876543210"] },
        { name: "company_name", values: ["Rao Textiles"] },
      ]),
      null,
      [],
    );
    expect(mapped).toMatchObject({
      name: "Asha Rao",
      email: "asha@example.com",
      phone: "+919876543210",
      company: "Rao Textiles",
    });
  });

  it("joins a first and last name back together", () => {
    const mapped = mapMetaLead(
      record([
        { name: "first_name", values: ["Asha"] },
        { name: "last_name", values: ["Rao"] },
      ]),
      null,
      [],
    );
    expect(mapped.name).toBe("Asha Rao");
  });

  it("routes a question to a custom field when the tenant maps it", () => {
    const mapped = mapMetaLead(
      record([{ name: "which_city", values: ["Madurai"] }]),
      { which_city: "custom:preferred_city" },
      ["preferred_city"],
    );
    expect(mapped.custom).toEqual({ preferred_city: "Madurai" });
    expect(mapped.unmapped).toEqual({});
  });

  it("matches a question straight onto a custom field with the same key", () => {
    const mapped = mapMetaLead(record([{ name: "budget", values: ["5 lakh"] }]), null, ["budget"]);
    expect(mapped.custom).toEqual({ budget: "5 lakh" });
  });

  it("honours an explicit mapping onto a standard column and an explicit ignore", () => {
    const mapped = mapMetaLead(
      record([
        { name: "your_business", values: ["Rao Textiles"] },
        { name: "internal_ref", values: ["xyz"] },
      ]),
      { your_business: "company", internal_ref: "ignore" },
      [],
    );
    expect(mapped.company).toBe("Rao Textiles");
    expect(mapped.unmapped).toEqual({});
  });

  it("keeps an unrecognised answer rather than dropping it", () => {
    const mapped = mapMetaLead(record([{ name: "how_soon", values: ["This month"] }]), null, []);
    expect(mapped.unmapped).toEqual({ how_soon: "This month" });
  });

  it("joins a multi-choice answer and skips empty ones", () => {
    const mapped = mapMetaLead(
      record([
        { name: "interests", values: ["Sarees", "Silk"] },
        { name: "blank", values: [] },
      ]),
      null,
      ["interests"],
    );
    expect(mapped.custom).toEqual({ interests: "Sarees, Silk" });
    expect(mapped.unmapped).toEqual({});
  });

  it("falls back to a usable display name when the form asks for no name", () => {
    const mapped = mapMetaLead(record([{ name: "email", values: ["asha@example.com"] }]), null, []);
    expect(leadDisplayName(mapped)).toBe("asha@example.com");
    expect(leadDisplayName(mapMetaLead(record([]), null, []))).toBe("Meta lead");
  });
});
