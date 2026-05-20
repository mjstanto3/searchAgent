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
  overall_quality: number; // 1–5 average confidence across all answers
}

const SUBMIT_RESEARCH_TOOL = {
  name: 'submit_research',
  description:
    'Submit your structured research findings. Call this as soon as you have confident answers — ' +
    'do not keep searching if you already have high-confidence results (score 4–5). ' +
    'Only continue searching if answers are still incomplete or low-confidence.',
  input_schema: {
    type: 'object' as const,
    properties: {
      research_target: {
        type: 'string',
        description: 'The name of the entity being researched',
      },
      answers: {
        type: 'array',
        description: 'One entry per research question',
        items: {
          type: 'object',
          properties: {
            question: { type: 'string', description: 'The research question' },
            answer: { type: 'string', description: 'Your answer based on web research' },
            sources: {
              type: 'array',
              description: 'URLs of sources used to answer this question',
              items: { type: 'string' },
            },
            answer_format: {
              type: 'string',
              enum: ['brief', 'sentence', 'paragraph'],
              description:
                'Classify the question type before writing your answer, then calibrate length accordingly. ' +
                '"brief": factual lookups — a name, date, number, yes/no, or short phrase (1–10 words). ' +
                'Use for questions like "what is X", "who is", "when did", "where is". ' +
                '"sentence": requires a bit of context but is still a single clear fact (1–2 sentences). ' +
                'Use for questions like "what does X do", "how is X described". ' +
                '"paragraph": genuinely complex — narrative, comparison, or multi-part answer (3–5 sentences max). ' +
                'Use for questions like "describe how", "explain", "summarize their approach to".',
            },
            confidence: {
              type: 'number',
              description:
                'Confidence score 1–5: 5=specific fact with named source, 4=well-sourced, ' +
                '3=reasonably sourced, 2=vague or indirect, 1=not found or speculative',
            },
            confidence_reason: {
              type: 'string',
              description: 'One sentence explaining why you assigned this confidence score',
            },
          },
          required: ['question', 'answer_format', 'answer', 'sources', 'confidence', 'confidence_reason'],
        },
      },
      overall_quality: {
        type: 'number',
        description: 'Average confidence score across all answers (1–5)',
      },
    },
    required: ['research_target', 'answers', 'overall_quality'],
  },
};

function buildSystemPrompt(): string {
  return (
    'You are a research assistant performing structured web research. ' +
    'Use web_search to find information for each research question. ' +
    'After each search, assess whether you have confident answers (score 4–5). ' +
    'If all questions are answered with high confidence, call submit_research immediately — do not search further. ' +
    'Only continue searching if answers are still incomplete or low-confidence (score 1–3). ' +
    'When submitting, classify each question\'s answer_format BEFORE writing the answer, then strictly match that length: ' +
    '"brief" = 1–10 words only, "sentence" = 1–2 sentences, "paragraph" = 3–5 sentences maximum. ' +
    'Never write more than the format requires. A factual question answered with a paragraph is wrong. ' +
    'You MUST call submit_research as your final action — never output text directly.'
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

  return lines.join('\n');
}

async function attemptResearchRow(
  input: ResearchRowInput,
  attemptIndex: number,
): Promise<ResearchRowResult> {
  const maxUses = EFFORT_MAX_USES[input.effortTier] * input.researchQuestions.length;
  const attemptStart = Date.now();
  console.log(`[researchRow] "${input.primaryValue}" attempt ${attemptIndex + 1} — model call start (maxUses: ${maxUses})`);

  const response = await client.messages.create({
    model: MODELS.OSPREY_RESEARCH,
    max_tokens: 4096,
    system: buildSystemPrompt(),
    tool_choice: { type: 'any' },
    tools: [
      { type: 'web_search_20250305', name: 'web_search', max_uses: maxUses },
      SUBMIT_RESEARCH_TOOL,
    ],
    messages: [{ role: 'user', content: buildUserMessage(input) }],
  } as Parameters<typeof client.messages.create>[0]) as Anthropic.Message;

  const apiMs = Date.now() - attemptStart;
  const searchCount = response.content.filter((b) => b.type === 'tool_use' && (b as Anthropic.ToolUseBlock).name === 'web_search').length;
  console.log(`[researchRow] "${input.primaryValue}" attempt ${attemptIndex + 1} — model call done ${apiMs}ms, stop_reason: ${response.stop_reason}, web_searches: ${searchCount}, blocks: ${response.content.length}`);

  const toolUseBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'submit_research',
  );

  if (!toolUseBlock) {
    console.log(`[researchRow] "${input.primaryValue}" attempt ${attemptIndex + 1} — no submit_research block found`);
    throw new Error(`No submit_research tool call in response (attempt ${attemptIndex + 1})`);
  }

  const result = toolUseBlock.input as ResearchRowResult;

  if (!result.research_target || !Array.isArray(result.answers) || typeof result.overall_quality !== 'number') {
    throw new Error('Invalid submit_research input structure');
  }

  // Strip <cite index="...">...</cite> tags from answer text (keep inner text)
  result.answers = result.answers.map((a) => ({
    ...a,
    answer: a.answer.replace(/<cite[^>]*>(.*?)<\/cite>/gi, '$1').trim(),
  }));

  console.log(`[researchRow] "${input.primaryValue}" attempt ${attemptIndex + 1} — success, overall_quality: ${result.overall_quality}, answers: ${result.answers.length}`);
  return result;
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
      const delayMs = RETRY_DELAYS_MS[attempt - 1];
      console.log(`[researchRow] "${input.primaryValue}" sleeping ${delayMs}ms before attempt ${attempt + 1}`);
      await sleep(delayMs);
    }

    try {
      const result = await attemptResearchRow(input, attempt);
      return { result, error: null };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`[researchRow] "${input.primaryValue}" attempt ${attempt + 1} failed:`, lastError.message);
    }
  }

  console.error(`[researchRow] "${input.primaryValue}" all 3 attempts failed — last error: ${lastError?.message}`);

  return { result: null, error: lastError?.message ?? 'Unknown error' };
}
