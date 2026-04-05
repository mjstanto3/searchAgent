import Anthropic from '@anthropic-ai/sdk';
import { sanitizeInput } from '@/lib/sanitize';
import type { OspreyEffortTier, OspreyAnswer } from '@/types';
import { MODELS } from '@/lib/anthropic/config';

const client = new Anthropic();

const EFFORT_MAX_USES: Record<OspreyEffortTier, number> = {
  low: 1,
  medium: 3,
  large: 5,
};

const RETRY_DELAYS_MS = [10_000, 20_000, 40_000];

export interface ResearchRowInput {
  primaryColumn: string;
  primaryValue: string;
  contextColumns: Record<string, string>;
  clarifyingAnswers: Record<string, string>;
  researchQuestions: string[];
  suggestedSources: string[];
  effortTier: OspreyEffortTier;
}

export interface ResearchRowResult {
  research_target: string;
  answers: OspreyAnswer[];
}

function buildSystemPrompt(): string {
  return (
    'You are a research assistant performing structured web research. ' +
    'For each research target you are given, answer only the specific questions provided. ' +
    'Be concise. Cite your sources. Do not speculate beyond what you find.'
  );
}

function buildUserMessage(input: ResearchRowInput): string {
  const {
    primaryColumn,
    primaryValue,
    contextColumns,
    clarifyingAnswers,
    researchQuestions,
    suggestedSources,
  } = input;

  const lines: string[] = [];

  lines.push(`## Research Target`);
  lines.push(`${primaryColumn}: ${sanitizeInput(primaryValue, 500)}`);

  if (Object.keys(contextColumns).length > 0) {
    lines.push('');
    lines.push('## Additional Context');
    for (const [col, val] of Object.entries(contextColumns)) {
      lines.push(`${sanitizeInput(col, 100)}: ${sanitizeInput(val, 500)}`);
    }
  }

  if (Object.keys(clarifyingAnswers).length > 0) {
    lines.push('');
    lines.push('## Research Context (provided by user)');
    for (const [q, a] of Object.entries(clarifyingAnswers)) {
      if (a.trim()) {
        lines.push(`Q: ${sanitizeInput(q, 500)}`);
        lines.push(`A: ${sanitizeInput(a, 2000)}`);
      }
    }
  }

  lines.push('');
  lines.push('## Research Questions to Answer');
  researchQuestions.forEach((q, i) => {
    lines.push(`${i + 1}. ${sanitizeInput(q, 500)}`);
  });

  if (suggestedSources.length > 0) {
    lines.push('');
    lines.push('## Prioritize These Sources');
    suggestedSources.forEach((s) => lines.push(`- ${sanitizeInput(s, 200)}`));
  }

  lines.push('');
  lines.push('## Response Format');
  lines.push(
    'Return a JSON object with this exact structure (no markdown fences):\n' +
    '{\n' +
    '  "research_target": "the target name",\n' +
    '  "answers": [\n' +
    '    {\n' +
    '      "question": "the question text",\n' +
    '      "answer": "your answer",\n' +
    '      "sources": ["url1", "url2"]\n' +
    '    }\n' +
    '  ]\n' +
    '}'
  );

  return lines.join('\n');
}

async function attemptResearchRow(
  input: ResearchRowInput,
  attemptIndex: number,
): Promise<ResearchRowResult> {
  const maxUses = EFFORT_MAX_USES[input.effortTier] * input.researchQuestions.length;

  const response = await client.messages.create({
    model: MODELS.OSPREY_RESEARCH,
    max_tokens: 4096,
    system: buildSystemPrompt(),
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: maxUses }],
    messages: [{ role: 'user', content: buildUserMessage(input) }],
  } as Parameters<typeof client.messages.create>[0]) as Awaited<ReturnType<typeof client.messages.create>> & { content: Array<{ type: string; text?: string }> };

  const textBlock = response.content.find((b: { type: string }) => b.type === 'text') as { type: 'text'; text: string } | undefined;
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error(`No text response received (attempt ${attemptIndex + 1})`);
  }

  const raw = textBlock.text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const parsed = JSON.parse(raw) as ResearchRowResult;

  if (!parsed.research_target || !Array.isArray(parsed.answers)) {
    throw new Error('Invalid response structure from model');
  }

  return parsed;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function researchRow(
  input: ResearchRowInput,
): Promise<{ result: ResearchRowResult | null; error: string | null }> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_DELAYS_MS[attempt - 1]);
    }

    try {
      const result = await attemptResearchRow(input, attempt);
      return { result, error: null };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`Row research attempt ${attempt + 1} failed:`, lastError.message);
    }
  }

  return { result: null, error: lastError?.message ?? 'Unknown error' };
}
