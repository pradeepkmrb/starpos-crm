import { normalizeWhatsappNumber as normalizePhone } from "../../common/phone";

const PHONE_COLUMN_ALIASES = ["phone", "whatsappnumber", "whatsapp_number", "number", "mobile"];
const NAME_COLUMN_ALIASES = ["name", "full_name", "fullname", "contact_name"];

export interface ParsedContactRow {
  whatsappNumber: string;
  name?: string;
}

export interface CsvParseResult {
  rows: ParsedContactRow[];
  totalDataRows: number;
  invalidRowCount: number;
  duplicateInFileCount: number;
}


/** Minimal CSV parser: no quoted-field/embedded-comma support — fine for a simple phone,name export. */
export function parseContactsCsv(csvText: string): CsvParseResult {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { rows: [], totalDataRows: 0, invalidRowCount: 0, duplicateInFileCount: 0 };
  }

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const phoneIdx = header.findIndex((h) => PHONE_COLUMN_ALIASES.includes(h));
  const nameIdx = header.findIndex((h) => NAME_COLUMN_ALIASES.includes(h));

  // No recognizable header: treat every line as data, first column = phone.
  const hasHeader = phoneIdx !== -1;
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const effectivePhoneIdx = hasHeader ? phoneIdx : 0;
  const effectiveNameIdx = hasHeader ? nameIdx : 1;

  const seen = new Set<string>();
  const rows: ParsedContactRow[] = [];
  let invalidRowCount = 0;
  let duplicateInFileCount = 0;

  for (const line of dataLines) {
    const cols = line.split(",").map((c) => c.trim());
    const rawPhone = cols[effectivePhoneIdx];
    const phone = rawPhone ? normalizePhone(rawPhone) : null;
    if (!phone) {
      invalidRowCount += 1;
      continue;
    }
    if (seen.has(phone)) {
      duplicateInFileCount += 1;
      continue;
    }
    seen.add(phone);
    rows.push({
      whatsappNumber: phone,
      name: effectiveNameIdx >= 0 ? cols[effectiveNameIdx] || undefined : undefined,
    });
  }

  return { rows, totalDataRows: dataLines.length, invalidRowCount, duplicateInFileCount };
}
