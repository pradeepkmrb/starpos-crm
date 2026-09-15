import { matchColumnsToFields } from "./contacts.service";
import type { CustomFieldDefinition } from "../custom-fields/custom-field-values";

function def(overrides: Partial<CustomFieldDefinition> = {}): CustomFieldDefinition {
  return {
    key: "preferred_city",
    label: "Preferred City",
    type: "text",
    required: false,
    isActive: true,
    optionsJson: null,
    ...overrides,
  };
}

describe("matchColumnsToFields", () => {
  it("matches a header by field key or by label, however it is written", () => {
    const { columns } = matchColumnsToFields(["Preferred City"], [def()]);
    expect(columns).toEqual([{ header: "preferred city", key: "preferred_city", label: "Preferred City" }]);
    expect(matchColumnsToFields(["preferred_city"], [def()]).columns).toHaveLength(1);
    expect(matchColumnsToFields(["  PREFERRED-CITY "], [def()]).columns).toHaveLength(1);
  });

  it("reports a header that matches nothing instead of dropping it silently", () => {
    const { columns, ignoredColumns } = matchColumnsToFields(["City", "favourite_colour"], [def()]);
    expect(columns).toHaveLength(0);
    expect(ignoredColumns).toEqual(["City", "favourite_colour"]);
  });

  it("ignores a retired field, so its column does not come back in", () => {
    const { columns, ignoredColumns } = matchColumnsToFields(
      ["Preferred City"],
      [def({ isActive: false })],
    );
    expect(columns).toHaveLength(0);
    expect(ignoredColumns).toEqual(["Preferred City"]);
  });

  it("lets the first column win when a file names one field twice", () => {
    const { columns, ignoredColumns } = matchColumnsToFields(
      ["Preferred City", "preferred_city"],
      [def()],
    );
    expect(columns).toHaveLength(1);
    expect(ignoredColumns).toEqual(["preferred_city"]);
  });
});
