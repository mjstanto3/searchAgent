import Anthropic from '@anthropic-ai/sdk';
import type { ParseResult } from './parseFile';
import { buildDataSummaryText } from './parseFile';

const client = new Anthropic();

export interface DatasetAssessment {
  summary: string;
  clarifyingQuestions: string[];
}

export async function assessDataset(
  parsed: ParseResult,
): Promise<DatasetAssessment> {
  const summaryText = buildDataSummaryText(parsed);

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    system:
      'You are a research planning assistant. You help users understand their data and plan AI-powered research tasks.',
    messages: [
      {
        role: 'user',
        content: `Analyze this dataset:\n\n${summaryText}\n\n` +
          'Respond with a JSON object with exactly two fields:\n' +
          '1. "summary": A 2-3 sentence description of what this data appears to be about and what research could be done on it.\n' +
          '2. "clarifyingQuestions": An array of up to 5 strings — clarifying questions that would help focus the research. ' +
          'Ask about what the user is trying to learn, what industry or context applies, or what a successful answer would look like.\n\n' +
          'Return only valid JSON, no markdown fences.',
      },
    ],
  });

  const text =
    response.content.find((b) => b.type === 'text')?.text ?? '{}';

  // Strip markdown fences if present
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  const parsed2 = JSON.parse(cleaned) as {
    summary?: string;
    clarifyingQuestions?: string[];
  };

  return {
    summary: parsed2.summary ?? '',
    clarifyingQuestions: (parsed2.clarifyingQuestions ?? []).slice(0, 5),
  };
}
