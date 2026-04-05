/**
 * Tests for runMonitor — verifies pipeline shape, credit-bug regression guard,
 * and HTML conversion. Uses a mock Anthropic SDK so no API credits are consumed.
 *
 * The mock returns findings with proper [Source](url) format so that
 * Phase 2 URL validation and Phase 3 evaluation can run through the
 * pipeline realistically (fetch is also mocked to return 200 for URLs).
 */

// Mock fetch so URL validation never hits the network
global.fetch = jest.fn().mockResolvedValue({ status: 200 }) as jest.MockedFunction<typeof fetch>;

const MOCK_SEARCH_RESPONSE = `## Executive Summary
The AI market is experiencing rapid growth with several significant funding rounds.

## Key Findings
- OpenAI raised $6.6B at a $157B valuation in October 2024 ([TechCrunch](https://techcrunch.com/openai-funding))
- Anthropic secured $4B from Amazon, bringing total funding to $7.3B ([Reuters](https://reuters.com/anthropic-amazon))
- Google DeepMind revenue grew 45% YoY to reach $2.1B in Q3 2024 ([Bloomberg](https://bloomberg.com/deepmind-revenue))

## Market Signals
- Enterprise AI adoption accelerating across all verticals.

## Notable Sources
- https://techcrunch.com/openai-funding
- https://reuters.com/anthropic-amazon

## Recommended Actions
- Monitor AI funding rounds closely.
- Track enterprise adoption metrics.`;

const MOCK_EVAL_RESPONSE = JSON.stringify({
  findings: [
    { index: 0, score: 5, keep: true, reason: 'Specific dollar amount, named source, recent date' },
    { index: 1, score: 4, keep: true, reason: 'Specific amount, primary source' },
    { index: 2, score: 4, keep: true, reason: 'Specific percentage and revenue figure' },
  ],
  overallScore: 4.3,
});

jest.mock('@anthropic-ai/sdk', () => {
  let callCount = 0;
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: {
        create: jest.fn().mockImplementation(() => {
          callCount++;
          // First call = Phase 1 search; second call = Phase 3 evaluator
          // (third call = evaluator capture in instrumented; fourth = suggestions)
          const isEvalCall = callCount % 2 === 0;
          return Promise.resolve({
            content: [
              {
                type: 'text',
                text: isEvalCall ? MOCK_EVAL_RESPONSE : MOCK_SEARCH_RESPONSE,
              },
            ],
            usage: { input_tokens: 500, output_tokens: 300 },
          });
        }),
      },
    })),
  };
});

import { runMonitor } from '@/lib/anthropic/runMonitor';
import type { Monitor } from '@/types';

const mockMonitor: Monitor = {
  id: 'test-monitor-id',
  user_id: 'test-user-id',
  name: 'Test Monitor',
  topic: 'AI market trends',
  sources: ['techcrunch.com'],
  keywords: ['LLM', 'foundation models'],
  frequency: 'weekly',
  max_results: 5,
  date_window_days: 30,
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('runMonitor', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    (global.fetch as jest.Mock).mockResolvedValue({ status: 200 });
  });

  it('returns markdown and html', async () => {
    const result = await runMonitor(mockMonitor);
    expect(result.markdown).toBeTruthy();
    expect(result.html).toBeTruthy();
  });

  it('does NOT return creditsUsed (bug fix regression guard)', async () => {
    const result = await runMonitor(mockMonitor);
    // @ts-expect-error — creditsUsed was removed from BriefResult
    expect(result.creditsUsed).toBeUndefined();
  });

  it('returns qualityScore, retriedSearch, removedFindings fields', async () => {
    const result = await runMonitor(mockMonitor);
    expect(typeof result.qualityScore).toBe('number');
    expect(typeof result.retriedSearch).toBe('boolean');
    expect(typeof result.removedFindings).toBe('number');
  });

  it('converts markdown headings to HTML', async () => {
    const result = await runMonitor(mockMonitor);
    expect(result.html).toContain('<h2>');
  });

  it('converts markdown bullets to HTML list items', async () => {
    const result = await runMonitor(mockMonitor);
    expect(result.html).toContain('<li>');
  });

  it('does not retry when findings are sufficient', async () => {
    const result = await runMonitor(mockMonitor);
    // With 3 verified findings scoring 4-5, no retry should be needed
    expect(result.retriedSearch).toBe(false);
  });
});

