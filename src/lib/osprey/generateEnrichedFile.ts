import * as XLSX from 'xlsx';
import type { OspreyAnswer } from '@/types';

interface EnrichmentInput {
  originalRows: Record<string, string>[];
  headers: string[];
  researchQuestions: string[];
  results: Array<{
    row_index: number;
    research_target: string;
    answers?: OspreyAnswer[];
    status: string;
  }>;
}

export function generateEnrichedWorkbook(input: EnrichmentInput): Buffer {
  const { originalRows, headers, researchQuestions, results } = input;

  const resultsByIndex = new Map(results.map((r) => [r.row_index, r]));

  // Build enriched rows
  const enrichedRows = originalRows.map((row, i) => {
    const out: Record<string, string> = {};

    // Original columns
    for (const h of headers) {
      out[h] = row[h] ?? '';
    }

    // One column per research question (answer + sources)
    const result = resultsByIndex.get(i);
    for (let qi = 0; qi < researchQuestions.length; qi++) {
      const question = researchQuestions[qi];
      const answer = result?.answers?.[qi];

      out[question] = answer?.answer ?? (result?.status === 'failed' ? '[Research failed]' : '');
      out[`${question} — Sources`] = answer?.sources?.join(', ') ?? '';
    }

    return out;
  });

  const ws = XLSX.utils.json_to_sheet(enrichedRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Enriched');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(buffer);
}
