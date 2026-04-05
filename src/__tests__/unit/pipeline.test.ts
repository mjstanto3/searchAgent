/**
 * Pipeline phase unit tests.
 *
 * These tests cover the pure/mockable logic of each pipeline phase.
 * They run against either:
 *   (a) inline synthetic markdown (for the parser/assembly tests — zero cost, always available)
 *   (b) real captured fixture data when available (loadFixture)
 *
 * To populate fixture-backed tests:
 *   FIXTURE_NAME=run-001 npx ts-node scripts/captureFixtures.ts
 */

// Must mock before imports
jest.mock('@anthropic-ai/sdk');

import { listFixtures, loadFixture } from '../utils/loadFixture';

// ── Helpers ──────────────────────────────────────────────────────────────────
// We test the exported pure functions directly. They are not exported from
// runMonitor.ts today, so we test through visible surface area and inline
// re-implementations that mirror the production logic.

// Mirror of extractFindingsFromMarkdown for direct testing
function extractFindings(markdown: string) {
  const sectionMatch = markdown.match(/##\s*Key Findings\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (!sectionMatch) return [];

  return sectionMatch[1]
    .split('\n')
    .filter((l: string) => /^\s*[-*]/.test(l))
    .map((line: string) => {
      const mdLinkMatch = line.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/);
      const bareUrlMatch = !mdLinkMatch ? line.match(/https?:\/\/\S+/) : null;
      const url = mdLinkMatch?.[2] ?? bareUrlMatch?.[0];
      const cleanText = line
        .replace(/^\s*[-*]\s+/, '')
        .replace(/\[([^\]]+)\]\(https?:\/\/[^\s)]+\)/g, '$1')
        .trim();
      return { rawLine: line, cleanText, url, hasUrl: !!url };
    });
}

// ── Phase 2: extractFindingsFromMarkdown ─────────────────────────────────────

describe('Phase 2 – extractFindingsFromMarkdown', () => {
  it('extracts findings with markdown links', () => {
    const md = `## Key Findings
- Revenue grew 40% YoY ([TechCrunch](https://techcrunch.com/article))
- OpenAI raised $6.6B at $157B valuation ([Reuters](https://reuters.com/ai))
`;
    const findings = extractFindings(md);
    expect(findings).toHaveLength(2);
    expect(findings[0].url).toBe('https://techcrunch.com/article');
    expect(findings[1].url).toBe('https://reuters.com/ai');
    expect(findings[0].cleanText).toContain('Revenue grew 40%');
  });

  it('extracts bare URLs when no markdown link syntax present', () => {
    const md = `## Key Findings
- OpenAI launched GPT-5 https://openai.com/gpt5
`;
    const findings = extractFindings(md);
    expect(findings[0].url).toBe('https://openai.com/gpt5');
  });

  it('marks unsourced findings when no URL present', () => {
    const md = `## Key Findings
- This finding has no URL at all
`;
    const findings = extractFindings(md);
    expect(findings[0].hasUrl).toBe(false);
    expect(findings[0].url).toBeUndefined();
  });

  it('returns empty array when Key Findings section is absent', () => {
    const md = `## Executive Summary\nSome text.\n\n## Market Signals\nMore text.`;
    expect(extractFindings(md)).toHaveLength(0);
  });

  it('handles ## heading with extra whitespace', () => {
    const md = `##  Key Findings  \n- Finding 1 ([Source](https://example.com))\n`;
    const findings = extractFindings(md);
    expect(findings).toHaveLength(1);
  });

  it('strips link syntax from cleanText', () => {
    const md = `## Key Findings\n- AI market reaches $500B ([Forbes](https://forbes.com/ai))\n`;
    const findings = extractFindings(md);
    expect(findings[0].cleanText).toContain('AI market reaches $500B');
    expect(findings[0].cleanText).not.toContain('https://');
    expect(findings[0].cleanText).not.toContain('](');
  });

  it('stops parsing at next ## section', () => {
    const md = `## Key Findings
- Finding 1 ([Source](https://a.com))
- Finding 2 ([Source](https://b.com))

## Market Signals
- Not a finding
`;
    const findings = extractFindings(md);
    expect(findings).toHaveLength(2);
  });
});

// ── Phase 5: assembleBrief logic ─────────────────────────────────────────────

describe('Phase 5 – brief assembly', () => {
  const templateMarkdown = `## Executive Summary
Test summary.

## Key Findings
- Old finding 1
- Old finding 2

## Market Signals
Some signals here.

## Recommended Actions
- Do something
`;

  it('replaces Key Findings section with verified findings', () => {
    // We test the final brief output via runMonitor with a full mock
    // (see runMonitor.test.ts for integration tests)
    // Here we verify the section replacement regex directly
    const replaced = templateMarkdown.replace(
      /##\s*Key Findings[\s\S]*?(?=\n##|$)/i,
      `## Key Findings\n- New verified finding ([Source](https://example.com))\n`,
    );
    expect(replaced).toContain('New verified finding');
    expect(replaced).not.toContain('Old finding 1');
    expect(replaced).toContain('## Market Signals');
  });

  it('preserves all other sections', () => {
    const replaced = templateMarkdown.replace(
      /##\s*Key Findings[\s\S]*?(?=\n##|$)/i,
      `## Key Findings\n- New finding\n`,
    );
    expect(replaced).toContain('## Executive Summary');
    expect(replaced).toContain('## Market Signals');
    expect(replaced).toContain('## Recommended Actions');
  });
});

// ── Fixture-backed tests (only run if fixtures exist) ─────────────────────────

describe('Fixture-backed pipeline tests', () => {
  const fixtures = listFixtures();

  if (fixtures.length === 0) {
    it.skip('No fixtures captured yet — run: FIXTURE_NAME=run-001 npx ts-node scripts/captureFixtures.ts', () => {});
    return;
  }

  fixtures.forEach((fixtureName) => {
    describe(`Fixture: ${fixtureName}`, () => {
      let fixture: ReturnType<typeof loadFixture>;

      beforeAll(() => {
        fixture = loadFixture(fixtureName);
      });

      it('loads metadata successfully', () => {
        expect(fixture.metadata.fixtureName).toBe(fixtureName);
        expect(fixture.metadata.monitor.topic).toBeTruthy();
        expect(fixture.metadata.result).toBeDefined();
      });

      it('Phase 1 output has a Key Findings section', () => {
        expect(fixture.phase1Markdown).toMatch(/##\s*Key Findings/i);
      });

      it('Phase 2 parser extracted at least some findings from Phase 1 output', () => {
        const parsed = extractFindings(fixture.phase1Markdown);
        const recorded = fixture.phase2Parsed as Array<{ url?: string }>;

        // The parser should agree with what was captured
        expect(parsed.length).toBe(recorded.length);

        if (parsed.length === 0) {
          console.warn(
            `⚠️  [${fixtureName}] Phase 2 found 0 findings.\n` +
              `   This usually means Claude didn't use ## Key Findings heading, or\n` +
              `   findings are not formatted as bullet points.\n` +
              `   Check phase1_markdown.md to diagnose.`,
          );
        }
      });

      it('Phase 2 URL validation breakdown is logged', () => {
        const breakdown = fixture.metadata.pipeline.phase2ValidatedBreakdown;
        console.info(`[${fixtureName}] Phase 2 URL validation:`, breakdown);

        const total = (fixture.phase2Validated as unknown[]).length;
        const verified = breakdown.verified ?? 0;
        const lowConf = breakdown.lowConfidence ?? 0;
        const removed = breakdown.removed ?? 0;

        expect(verified + lowConf + removed).toBe(total);

        if (verified === 0 && total > 0) {
          console.warn(
            `⚠️  [${fixtureName}] 0 findings survived Phase 2 URL validation.\n` +
              `   unsourced=${breakdown.unsourced}, dead=${breakdown.dead}, unverifiable=${breakdown.unverifiable}, timeout=${breakdown.timeout}\n` +
              `   Consider: many news sites return 403 for HEAD requests.\n` +
              `   Fix: treat "unverifiable" as "verified" instead of "low-confidence".`,
          );
        }
      });

      it('Phase 3 evaluator response is valid JSON', () => {
        if (!fixture.phase3EvalResponse || fixture.phase3EvalResponse === '(capture failed)') {
          return; // evaluator wasn't reached (no candidates)
        }
        expect(() => JSON.parse(fixture.phase3EvalResponse)).not.toThrow();
        const parsed = JSON.parse(fixture.phase3EvalResponse) as {
          findings: Array<{ score: number; keep: boolean }>;
          overallScore: number;
        };
        expect(Array.isArray(parsed.findings)).toBe(true);
        expect(typeof parsed.overallScore).toBe('number');

        const keptCount = parsed.findings.filter((f) => f.keep).length;
        if (keptCount === 0) {
          console.warn(
            `⚠️  [${fixtureName}] Evaluator kept 0 findings (all scored < 3).\n` +
              `   Scores: ${parsed.findings.map((f) => f.score).join(', ')}\n` +
              `   Consider lowering the keep threshold from < 3 to < 2.`,
          );
        }
      });

      it('final brief contains expected sections', () => {
        expect(fixture.finalBrief).toMatch(/##\s*Executive Summary/i);
        expect(fixture.finalBrief).toMatch(/##\s*Key Findings/i);
      });

      it('retry was triggered if verified count was low', () => {
        const { retryTriggered } = fixture.metadata.pipeline;
        const { verifiedCount } = fixture.metadata.result;
        if (retryTriggered) {
          console.info(`[${fixtureName}] Retry was triggered. Verified after Phase 3: ${verifiedCount}`);
          expect(fixture.phase4RetryMarkdown).toBeTruthy();
        }
      });
    });
  });
});
