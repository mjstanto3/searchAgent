/**
 * saveFixture — shared fixture-writing utility.
 *
 * Used by:
 *   - The inline recorder (runMonitor.ts when CAPTURE_FIXTURES=true)
 *   - The capture script (scripts/captureFixtures.ts)
 *
 * Never imported by production code paths — tree-shaken in builds where
 * CAPTURE_FIXTURES is not set.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface FixturePrompts {
  systemPrompt: string;
  userPrompt: string;
  retryPrompt?: string;
  learningHint: string;
  docHint: string;
}

export interface FixtureData {
  fixtureName: string;
  monitor: {
    id: string;
    name: string;
    topic: string;
    max_results: number;
    keywords?: string[];
    sources?: string[];
  };
  prompts: FixturePrompts;
  phase1Markdown: string;
  phase2Parsed: unknown[];
  phase2Validated: unknown[];
  phase3EvalRequest: string;
  phase3EvalResponse: string;
  phase3Evaluated: unknown[];
  phase4RetryMarkdown?: string;
  phase4RetryValidated?: unknown[];
  phase4RetryEvaluated?: unknown[];
  allFindings: unknown[];
  finalMarkdown: string;
  result: {
    qualityScore: number;
    retriedSearch: boolean;
    removedFindings: number;
    verifiedCount: number;
    lowConfidenceCount: number;
    removedCount: number;
  };
}

const FIXTURES_DIR = path.resolve(process.cwd(), 'src/__tests__/fixtures');

/** Slugifies a string into a safe folder name. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

/** Auto-generates a fixture name from monitor name + timestamp. */
export function autoFixtureName(monitorName: string): string {
  const slug = slugify(monitorName);
  const ts = new Date().toISOString().slice(0, 16).replace(/:/g, '-');
  return `${slug}-${ts}`;
}

/**
 * Writes all fixture files to src/__tests__/fixtures/{fixtureName}/.
 * Creates the directory if it doesn't exist.
 */
export function saveFixture(data: FixtureData): void {
  const dir = path.join(FIXTURES_DIR, data.fixtureName);
  fs.mkdirSync(dir, { recursive: true });

  const write = (filename: string, content: string) =>
    fs.writeFileSync(path.join(dir, filename), content, 'utf8');

  // phase0 — exact prompts as built
  write(
    'phase0_prompts.json',
    JSON.stringify(
      {
        systemPrompt: data.prompts.systemPrompt,
        userPrompt: data.prompts.userPrompt,
        ...(data.prompts.retryPrompt ? { retryPrompt: data.prompts.retryPrompt } : {}),
        learningHint: data.prompts.learningHint || '(none)',
        docHint: data.prompts.docHint ? '(document context present — truncated)' : '(none)',
      },
      null,
      2,
    ),
  );

  write('phase1_markdown.md', data.phase1Markdown);
  write('phase2_findings.json', JSON.stringify(data.phase2Parsed, null, 2));
  write('phase2_validated.json', JSON.stringify(data.phase2Validated, null, 2));
  write(
    'phase3_eval_request.json',
    JSON.stringify({ topic: data.monitor.topic, numberedList: data.phase3EvalRequest }, null, 2),
  );
  write('phase3_eval_response.json', data.phase3EvalResponse);
  write('phase3_evaluated.json', JSON.stringify(data.phase3Evaluated, null, 2));

  if (data.phase4RetryMarkdown) {
    write('phase4_retry_markdown.md', data.phase4RetryMarkdown);
    write('phase4_retry_validated.json', JSON.stringify(data.phase4RetryValidated ?? [], null, 2));
    write('phase4_retry_evaluated.json', JSON.stringify(data.phase4RetryEvaluated ?? [], null, 2));
  }

  write('all_findings.json', JSON.stringify(data.allFindings, null, 2));
  write('final_brief.md', data.finalMarkdown);

  write(
    'metadata.json',
    JSON.stringify(
      {
        fixtureName: data.fixtureName,
        capturedAt: new Date().toISOString(),
        monitor: data.monitor,
        result: data.result,
        pipeline: {
          phase2ParsedCount: data.phase2Parsed.length,
          phase2ValidatedBreakdown: buildBreakdown(data.phase2Validated),
          retryTriggered: data.result.retriedSearch,
        },
      },
      null,
      2,
    ),
  );

  // Update the fixtures index
  updateIndex(FIXTURES_DIR, {
    name: data.fixtureName,
    topic: data.monitor.topic,
    monitorName: data.monitor.name,
    qualityScore: data.result.qualityScore,
    retried: data.result.retriedSearch,
    capturedAt: new Date().toISOString(),
  });

  console.log(`[recorder] Fixture saved → src/__tests__/fixtures/${data.fixtureName}/`);
}

function buildBreakdown(validated: unknown[]): Record<string, number> {
  const findings = validated as Array<{ disposition?: string; urlStatus?: string }>;
  return {
    verified: findings.filter((f) => f.disposition === 'verified').length,
    lowConfidence: findings.filter((f) => f.disposition === 'low-confidence').length,
    removed: findings.filter((f) => f.disposition === 'removed').length,
    unsourced: findings.filter((f) => f.urlStatus === 'unsourced').length,
    dead: findings.filter((f) => f.urlStatus === 'dead').length,
    unverifiable: findings.filter((f) => f.urlStatus === 'unverifiable').length,
    timeout: findings.filter((f) => f.urlStatus === 'timeout').length,
    ok: findings.filter((f) => f.urlStatus === 'ok').length,
  };
}

function updateIndex(fixturesDir: string, entry: Record<string, unknown>): void {
  const indexPath = path.join(fixturesDir, 'index.json');
  let index: Record<string, unknown>[] = [];
  if (fs.existsSync(indexPath)) {
    try {
      index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    } catch {
      index = [];
    }
  }
  index = index.filter((e) => e.name !== entry.name);
  index.push(entry);
  index.sort((a, b) =>
    String(b.capturedAt ?? '').localeCompare(String(a.capturedAt ?? '')),
  );
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8');
}
