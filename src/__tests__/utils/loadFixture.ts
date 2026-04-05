/**
 * Fixture loader for pipeline tests.
 * Reads captured fixture sets from src/__tests__/fixtures/.
 */

import * as fs from 'fs';
import * as path from 'path';

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

export interface FixtureSet {
  name: string;
  metadata: {
    fixtureName: string;
    capturedAt: string;
    monitor: {
      topic: string;
      max_results: number;
      keywords: string[];
      sources: string[];
    };
    result: {
      qualityScore: number;
      retriedSearch: boolean;
      removedFindings: number;
      verifiedCount: number;
      lowConfidenceCount: number;
      removedCount: number;
    };
    pipeline: {
      phase2ParsedCount: number;
      phase2ValidatedBreakdown: Record<string, number>;
      retryTriggered: boolean;
    };
  };
  phase1Markdown: string;
  phase2Parsed: unknown[];
  phase2Validated: unknown[];
  phase3EvalRequest: { topic: string; numberedList: string };
  phase3EvalResponse: string;
  phase3Evaluated: unknown[];
  phase4RetryMarkdown?: string;
  phase4RetryValidated?: unknown[];
  phase4RetryEvaluated?: unknown[];
  allFindings: unknown[];
  finalBrief: string;
}

export function loadFixture(name: string): FixtureSet {
  const dir = path.join(FIXTURES_DIR, name);

  if (!fs.existsSync(dir)) {
    throw new Error(
      `Fixture "${name}" not found at ${dir}.\n` +
        `Run: FIXTURE_NAME=${name} npx ts-node scripts/captureFixtures.ts`,
    );
  }

  function readJson(file: string): unknown {
    const p = path.join(dir, file);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : undefined;
  }

  function readText(file: string): string | undefined {
    const p = path.join(dir, file);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : undefined;
  }

  return {
    name,
    metadata: readJson('metadata.json') as FixtureSet['metadata'],
    phase1Markdown: readText('phase1_markdown.md') ?? '',
    phase2Parsed: (readJson('phase2_findings.json') as unknown[]) ?? [],
    phase2Validated: (readJson('phase2_validated.json') as unknown[]) ?? [],
    phase3EvalRequest: (readJson('phase3_eval_request.json') as FixtureSet['phase3EvalRequest']) ?? { topic: '', numberedList: '' },
    phase3EvalResponse: readText('phase3_eval_response.json') ?? '',
    phase3Evaluated: (readJson('phase3_evaluated.json') as unknown[]) ?? [],
    phase4RetryMarkdown: readText('phase4_retry_markdown.md'),
    phase4RetryValidated: readJson('phase4_retry_validated.json') as unknown[] | undefined,
    phase4RetryEvaluated: readJson('phase4_retry_evaluated.json') as unknown[] | undefined,
    allFindings: (readJson('all_findings.json') as unknown[]) ?? [],
    finalBrief: readText('final_brief.md') ?? '',
  };
}

/** Returns names of all available fixture sets. */
export function listFixtures(): string[] {
  if (!fs.existsSync(FIXTURES_DIR)) return [];
  return fs.readdirSync(FIXTURES_DIR).filter((f) => {
    const full = path.join(FIXTURES_DIR, f);
    return fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, 'metadata.json'));
  });
}
