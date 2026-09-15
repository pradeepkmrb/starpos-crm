import { parseContactsCsv, splitCsvRows } from "./csv-parser";

describe("splitCsvRows", () => {
  it("keeps a quoted comma inside its cell", () => {
    expect(splitCsvRows('phone,name\n919876543210,"Rao, Textiles"')).toEqual([
      ["phone", "name"],
      ["919876543210", "Rao, Textiles"],
    ]);
  });

  it("reads a doubled quote as one literal quote", () => {
    expect(splitCsvRows('name\n"He said ""hi"""')).toEqual([["name"], ['He said "hi"']]);
  });

  it("keeps a newline inside a quoted cell", () => {
    const rows = splitCsvRows('phone,note\n919876543210,"line one\nline two"');
    expect(rows).toHaveLength(2);
    expect(rows[1][1]).toBe("line one\nline two");
  });

  it("handles CRLF and a trailing newline without inventing a row", () => {
    expect(splitCsvRows("phone,name\r\n919876543210,Asha\r\n")).toEqual([
      ["phone", "name"],
      ["919876543210", "Asha"],
    ]);
  });
});

describe("parseContactsCsv", () => {
  it("returns extra columns alongside phone and name", () => {
    const result = parseContactsCsv(
      "phone,name,Preferred City,Marketing consent\n919876543210,Asha,Chennai,yes",
    );
    expect(result.extraHeaders).toEqual(["Preferred City", "Marketing consent"]);
    expect(result.rows).toEqual([
      {
        whatsappNumber: "919876543210",
        name: "Asha",
        extras: { "preferred city": "Chennai", "marketing consent": "yes" },
      },
    ]);
  });

  it("survives a round trip through this app's own quoted export", () => {
    const exported = 'phone,name,notes\n919876543210,"Rao, Textiles","said ""yes"" today"';
    const result = parseContactsCsv(exported);
    expect(result.rows[0].name).toBe("Rao, Textiles");
    expect(result.rows[0].extras.notes).toBe('said "yes" today');
  });

  it("skips an empty extra cell rather than storing a blank", () => {
    const result = parseContactsCsv("phone,name,city\n919876543210,Asha,");
    expect(result.rows[0].extras).toEqual({});
  });

  it("still counts invalid and duplicate rows", () => {
    const result = parseContactsCsv(
      ["phone,name,city", "919876543210,Asha,Chennai", "not-a-number,Bad,Madurai", "919876543210,Dupe,Erode"].join("\n"),
    );
    expect(result).toMatchObject({ totalDataRows: 3, invalidRowCount: 1, duplicateInFileCount: 1 });
    expect(result.rows).toHaveLength(1);
  });

  it("treats a headerless file as phone,name with no extras", () => {
    const result = parseContactsCsv("919876543210,Asha\n919812345678,Meena");
    expect(result.rows.map((r) => r.whatsappNumber)).toEqual(["919876543210", "919812345678"]);
    expect(result.extraHeaders).toEqual([]);
  });

  it("normalizes a spaced or plus-prefixed number", () => {
    const result = parseContactsCsv("phone\n+91 98765-43210");
    expect(result.rows[0].whatsappNumber).toBe("919876543210");
  });
});
