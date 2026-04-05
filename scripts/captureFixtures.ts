#!/usr/bin/env ts-node
/**
 * Fixture Capture Script
 * ─────────────────────
 * Runs the full 5-phase pipeline with real API calls and saves every
 * intermediate state as fixture files. Useful when you don't have a real
 * monitor set up yet — just supply a topic via env vars.
 *
 * For real monitor runs, use the inline recorder instead:
 *   1. Set CAPTURE_FIXTURES=true in .env.local
 *   2. Trigger any monitor run from the app
 *   3. Fixture is automatically saved — no script needed
 *   4. Set CAPTURE_FIXTURES=false when done
 *
 * Usage (script mode):
 *   FIXTURE_NAME=run-001 npx ts-node scripts/captureFixtures.ts
 *
 * Options (env vars):
 *   FIXTURE_NAME      Required. Folder name under src/__tests__/fixtures/
 *   MONITOR_TOPIC     Topic string (default: "AI market trends 2025")
 *   MAX_RESULTS       Number of findings to request (default: 5)
 *   MONITOR_KEYWORDS  Comma-separated keywords (optional)
 *   MONITOR_SOURCES   Comma-separated priority sources (optional)
 *   OVERWRITE         Set to "true" to overwrite an existing fixture set
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

import { runMonitorInstrumented } from '../src/lib/anthropic/runMonitor';
import { saveFixture } from '../src/lib/testing/saveFixture';
import type { Monitor } from '../src/types';

const FIXTURE_NAME = process.env.FIXTURE_NAME;
if (!FIXTURE_NAME) {
  console.error('Error: FIXTURE_NAME env var is required.');
  console.error('Usage: FIXTURE_NAME=run-001 npx ts-node scripts/captureFixtures.ts');
  process.exit(1);
}

const OUTPUT_DIR = path.resolve(__dirname, `../src/__tests__/fixtures/${FIXTURE_NAME}`);
if (fs.existsSync(OUTPUT_DIR) && process.env.OVERWRITE !== 'true') {
  console.error(`Error: Fixture "${FIXTURE_NAME}" already exists. Set OVERWRITE=true to overwrite.`);
  process.exit(1);
}

const monitor: Monitor = {
  id: `fixture-${FIXTURE_NAME}`,
  user_id: 'fixture-user',
  name: `Fixture: ${FIXTURE_NAME}`,
  topic: process.env.MONITOR_TOPIC ?? 'AI market trends 2025',
  keywords: process.env.MONITOR_KEYWORDS?.split(',').map((s) => s.trim()) ?? [],
  sources: process.env.MONITOR_SOURCES?.split(',').map((s) => s.trim()) ?? [],
  frequency: 'weekly',
  max_results: parseInt(process.env.MAX_RESULTS ?? '5', 10),
  date_window_days: parseInt(process.env.DATE_WINDOW_DAYS ?? '30', 10),
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

async function main() {
  console.log(`\n📸 Capturing fixture: "${FIXTURE_NAME}"`);
  console.log(`   Topic: ${monitor.topic}`);
  console.log(`   Max results: ${monitor.max_results}`);
  if (monitor.keywords?.length) console.log(`   Keywords: ${monitor.keywords.join(', ')}`);
  if (monitor.sources?.length) console.log(`   Sources: ${monitor.sources.join(', ')}`);
  console.log('\n⏳ Running pipeline (this will use real API credits)...\n');

  const start = Date.now();
  const result = await runMonitorInstrumented(monitor);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const { _instrumented: i } = result;

  console.log(`✅ Pipeline complete in ${elapsed}s`);
  console.log(`   Quality score: ${result.qualityScore}/5`);
  console.log(`   Retried: ${result.retriedSearch}`);
  console.log(`   Removed findings: ${result.removedFindings}`);

  saveFixture({
    fixtureName: FIXTURE_NAME!,
    monitor: {
      id: monitor.id,
      name: monitor.name,
      topic: monitor.topic,
      max_results: monitor.max_results,
      keywords: monitor.keywords,
      sources: monitor.sources,
    },
    prompts: {
      systemPrompt: i.systemPrompt,
      userPrompt: i.userPrompt,
      retryPrompt: i.retryPrompt,
      learningHint: i.learningHint,
      docHint: i.docHint,
    },
    phase1Markdown: i.phase1Markdown,
    phase2Parsed: i.phase2Parsed,
    phase2Validated: i.phase2Validated,
    phase3EvalRequest: i.phase3EvalRequest,
    phase3EvalResponse: i.phase3EvalResponse,
    phase3Evaluated: i.phase3Evaluated,
    phase4RetryMarkdown: i.phase4RetryMarkdown,
    phase4RetryValidated: i.phase4RetryValidated,
    phase4RetryEvaluated: i.phase4RetryEvaluated,
    allFindings: i.allFindings,
    finalMarkdown: i.finalMarkdown,
    result: {
      qualityScore: result.qualityScore,
      retriedSearch: result.retriedSearch,
      removedFindings: result.removedFindings,
      verifiedCount: i.allFindings.filter((f: { disposition?: string }) => f.disposition === 'verified').length,
      lowConfidenceCount: i.allFindings.filter((f: { disposition?: string }) => f.disposition === 'low-confidence').length,
      removedCount: i.allFindings.filter((f: { disposition?: string }) => f.disposition === 'removed').length,
    },
  });

  const fixtureDir = path.resolve(__dirname, `../src/__tests__/fixtures/${FIXTURE_NAME}`);
  console.log(`\n📁 Fixture saved to: src/__tests__/fixtures/${FIXTURE_NAME}/`);
  console.log('   Files written:');
  fs.readdirSync(fixtureDir).forEach((f) => console.log(`     ${f}`));
  console.log('\n💡 Run tests with: npm test');
}

main().catch((err) => {
  console.error('\n❌ Capture failed:', err);
  process.exit(1);
});

