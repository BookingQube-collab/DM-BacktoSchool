export const STORE_CSV_COLUMNS = ["name", "logo_url"] as const;
export const STORE_CSV_MAX_ROWS = 500;
export const STORE_NAME_MAX = 200;
export const STORE_LOGO_URL_MAX = 2000;

export const STORE_CSV_SAMPLE_ROWS: Array<{ name: string; logo_url: string }> = [
  { name: "Adidas", logo_url: "" },
  { name: "Lulu Hypermarket", logo_url: "" },
  { name: "Bath & Body Works", logo_url: "" },
];

export type StoreCsvErrorCode =
  | "empty_file"
  | "no_name_column"
  | "too_many_rows"
  | "missing_name"
  | "duplicate_in_file"
  | "already_exists"
  | "invalid_logo_url"
  | "name_too_long";

export type ParsedStoreRow = {
  row: number;
  name: string;
  logo_url: string;
};

export type StoreCsvRowError = {
  row: number;
  name: string;
  code: StoreCsvErrorCode;
};

export function csvEscape(value: unknown) {
  const str = String(value ?? "");
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function buildStoreSampleCsv() {
  const header = STORE_CSV_COLUMNS.join(",");
  const rows = STORE_CSV_SAMPLE_ROWS.map((r) =>
    [csvEscape(r.name), csvEscape(r.logo_url)].join(","),
  );
  return `\uFEFF${[header, ...rows].join("\r\n")}\r\n`;
}

function parseCsvRows(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    if (ch === "\r") continue;
    field += ch;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/^\ufeff/, "").replace(/[\s-]+/g, "_");
}

function nameColumnIndex(headers: string[]) {
  const aliases = new Set(["name", "store", "store_name"]);
  return headers.findIndex((h) => aliases.has(normalizeHeader(h)));
}

function logoColumnIndex(headers: string[]) {
  const aliases = new Set(["logo_url", "logo", "logo_url_optional"]);
  return headers.findIndex((h) => aliases.has(normalizeHeader(h)));
}

export function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export type ParseStoreCsvResult =
  | {
      ok: true;
      rows: ParsedStoreRow[];
      errors: StoreCsvRowError[];
    }
  | {
      ok: false;
      code: Extract<
        StoreCsvErrorCode,
        "empty_file" | "no_name_column" | "too_many_rows"
      >;
    };

export function parseStoreCsv(text: string): ParseStoreCsvResult {
  const table = parseCsvRows(text).filter((r) =>
    r.some((cell) => cell.trim().length > 0),
  );
  if (!table.length) return { ok: false, code: "empty_file" };

  const headers = table[0];
  const nameIdx = nameColumnIndex(headers);
  if (nameIdx < 0) return { ok: false, code: "no_name_column" };
  const logoIdx = logoColumnIndex(headers);

  const data = table.slice(1);
  if (data.length > STORE_CSV_MAX_ROWS) {
    return { ok: false, code: "too_many_rows" };
  }
  if (!data.length) return { ok: false, code: "empty_file" };

  const rows: ParsedStoreRow[] = [];
  const errors: StoreCsvRowError[] = [];
  const seen = new Set<string>();

  data.forEach((cells, i) => {
    const row = i + 2;
    const name = (cells[nameIdx] ?? "").trim();
    const logo_url =
      logoIdx >= 0 ? (cells[logoIdx] ?? "").trim() : "";

    if (!name && !logo_url) return;

    if (!name) {
      errors.push({ row, name: "", code: "missing_name" });
      return;
    }
    if (name.length > STORE_NAME_MAX) {
      errors.push({ row, name, code: "name_too_long" });
      return;
    }
    if (logo_url) {
      if (logo_url.length > STORE_LOGO_URL_MAX || !isValidHttpUrl(logo_url)) {
        errors.push({ row, name, code: "invalid_logo_url" });
        return;
      }
    }

    const key = name.toLowerCase();
    if (seen.has(key)) {
      errors.push({ row, name, code: "duplicate_in_file" });
      return;
    }
    seen.add(key);
    rows.push({ row, name, logo_url });
  });

  if (!rows.length && !errors.length) return { ok: false, code: "empty_file" };
  return { ok: true, rows, errors };
}
