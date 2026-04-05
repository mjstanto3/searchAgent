import * as XLSX from 'xlsx';

export interface ParsedRow {
  [column: string]: string;
}

export interface ParseResult {
  headers: string[];
  rows: ParsedRow[];
  primaryColumn: string;
  rowCount: number;
}

const MAX_ROWS = 500;

export function parseFileBuffer(buffer: Buffer, filename: string): ParseResult {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';

  let workbook: XLSX.WorkBook;

  if (ext === 'json') {
    const raw = JSON.parse(buffer.toString('utf-8'));
    const arr = Array.isArray(raw) ? raw : [raw];
    workbook = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(arr);
    XLSX.utils.book_append_sheet(workbook, ws, 'Sheet1');
  } else {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
    defval: '',
    raw: false,
  });

  if (raw.length === 0) {
    throw new Error('The uploaded file contains no data rows.');
  }

  const headers = Object.keys(raw[0]);
  if (headers.length === 0) {
    throw new Error('Could not detect column headers in the file.');
  }

  const trimmed = raw.slice(0, MAX_ROWS);
  const rows: ParsedRow[] = trimmed.map((r) => {
    const out: ParsedRow = {};
    for (const h of headers) {
      out[h] = String(r[h] ?? '');
    }
    return out;
  });

  return {
    headers,
    rows,
    primaryColumn: headers[0],
    rowCount: rows.length,
  };
}

export function buildDataSummaryText(result: ParseResult): string {
  const sample = result.rows.slice(0, 5);
  const lines = [
    `Columns (${result.headers.length}): ${result.headers.join(', ')}`,
    `Total rows: ${result.rowCount}`,
    `Primary research target column: "${result.primaryColumn}"`,
    '',
    'Sample rows:',
    ...sample.map((r, i) =>
      `Row ${i + 1}: ` +
      result.headers
        .map((h) => `${h}="${r[h]}"`)
        .join(', ')
    ),
  ];
  return lines.join('\n');
}
