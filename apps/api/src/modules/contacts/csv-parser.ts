const PHONE_COLUMN_ALIASES = ["phone", "whatsappnumber", "whatsapp_number", "number", "mobile"];
const NAME_COLUMN_ALIASES = ["name", "full_name", "fullname", "contact_name"];

export interface ParsedContactRow {
  whatsappNumber: string;
  name?: string;
  /** Every other column on the row, keyed by its normalized header, for custom fields. */
  extras: Record<string, string>;
}

export interface CsvParseResult {
  rows: ParsedContactRow[];
  totalDataRows: number;
  invalidRowCount: number;
  duplicateInFileCount: number;
  /** Headers other than phone and name, as written in the file. */
  extraHeaders: string[];
}

/** E.164-ish: optional leading +, 7–15 digits total. */
const PHONE_RE = /^\+?[1-9]\d{6,14}$/;

function normalizePhone(raw: string): string | null {
  const cleaned = raw.trim().replace(/[\s\-().]/g, "");
  return PHONE_RE.test(cleaned) ? cleaned.replace(/^\+/, "") : null;
}

/**
 * RFC 4180 reader: quoted fields, "" for a literal quote, and commas or
 * newlines inside quotes. This app's own contact export quotes exactly that
 * way, so anything less would shift the columns of a file it produced itself
 * the moment a name or an answer contained a comma.
 */
export function splitCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let cellWasQuoted = false;

  const endCell = () => {
    row.push(cellWasQuoted ? cell : cell.trim());
    cell = "";
    cellWasQuoted = false;
  };
  const endRow = () => {
    endCell();
    // A trailing newline would otherwise add a row of one empty cell.
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"' && cell.trim() === "") {
      inQuotes = true;
      cellWasQuoted = true;
      cell = "";
    } else if (char === ",") {
      endCell();
    } else if (char === "\n") {
      endRow();
    } else if (char !== "\r") {
      cell += char;
    }
  }

  // Whatever is left when the text runs out is the last row.
  if (cell !== "" || row.length > 0) endRow();
  return rows;
}

/** Headers are matched case- and spacing-insensitively. */
function normalizeHeader(header: string): string {
  return header.trim().toLowerCase();
}

export function parseContactsCsv(csvText: string): CsvParseResult {
  const allRows = splitCsvRows(csvText).filter((row) => row.some((cell) => cell !== ""));

  if (allRows.length === 0) {
    return { rows: [], totalDataRows: 0, invalidRowCount: 0, duplicateInFileCount: 0, extraHeaders: [] };
  }

  const rawHeader = allRows[0];
  const header = rawHeader.map(normalizeHeader);
  const phoneIdx = header.findIndex((h) => PHONE_COLUMN_ALIASES.includes(h));
  const nameIdx = header.findIndex((h) => NAME_COLUMN_ALIASES.includes(h));

  // No recognizable header: treat every line as data, first column = phone.
  const hasHeader = phoneIdx !== -1;
  const dataRows = hasHeader ? allRows.slice(1) : allRows;
  const effectivePhoneIdx = hasHeader ? phoneIdx : 0;
  const effectiveNameIdx = hasHeader ? nameIdx : 1;

  // Only a file with a real header can carry named extra columns.
  const extraIndexes = hasHeader
    ? header
        .map((_, index) => index)
        .filter((index) => index !== effectivePhoneIdx && index !== effectiveNameIdx)
    : [];
  const extraHeaders = extraIndexes
    .map((index) => rawHeader[index].trim())
    .filter((name) => name.length > 0);

  const seen = new Set<string>();
  const rows: ParsedContactRow[] = [];
  let invalidRowCount = 0;
  let duplicateInFileCount = 0;

  for (const cols of dataRows) {
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

    const extras: Record<string, string> = {};
    for (const index of extraIndexes) {
      const key = header[index];
      const value = (cols[index] ?? "").trim();
      if (key && value) extras[key] = value;
    }

    rows.push({
      whatsappNumber: phone,
      name: effectiveNameIdx >= 0 ? cols[effectiveNameIdx] || undefined : undefined,
      extras,
    });
  }

  return { rows, totalDataRows: dataRows.length, invalidRowCount, duplicateInFileCount, extraHeaders };
}
