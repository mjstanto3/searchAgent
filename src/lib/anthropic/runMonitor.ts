import Anthropic from '@anthropic-ai/sdk';
import type { Monitor, FindingRatingValue } from '@/types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface BriefResult {
  markdown: string;
  html: string;
  /** 1–5 average quality score from the internal evaluation pass */
  qualityScore: number;
  /** true if a second search was triggered due to insufficient initial results */
  retriedSearch: boolean;
  /** total findings dropped (dead URL + low quality score) */
  removedFindings: number;
  /** URLs of all non-removed findings — saved to DB for cross-run deduplication */
  foundUrls: string[];
}

export interface PreviousRunContext {
  feedback?: string;
  findingRatings?: Record<string, FindingRatingValue>;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type UrlStatus = 'ok' | 'dead' | 'timeout' | 'unverifiable' | 'unsourced';
type Disposition = 'verified' | 'low-confidence' | 'removed';

interface ParsedFinding {
  /** original markdown bullet line */
  rawLine: string;
  /** finding text with link syntax stripped */
  cleanText: string;
  url?: string;
  urlStatus?: UrlStatus;
  disposition: Disposition;
  qualityScore?: number;
  /** combined URL + quality reason shown under low-confidence findings */
  reason?: string;
}

interface EvaluatorResponse {
  findings: Array<{ index: number; score: number; keep: boolean; reason: string }>;
  overallScore: number;
}

// ---------------------------------------------------------------------------
// Anthropic client
// ---------------------------------------------------------------------------

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
}

// ---------------------------------------------------------------------------
// Prompt helpers
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT_RULES_TEMPLATE = (days: number) =>
  `Your mission is to find the highest-quality, most relevant information available — prioritizing primary sources, concrete evidence, and recent data over secondhand summaries or opinion.

RESEARCH STANDARDS — apply these to every finding without exception:
1. Cite every claim. Each finding must include a direct source URL in [Source Name](full URL) format — full, unshortened links only.
2. Report only what you directly observed. Never synthesize, infer, or extrapolate beyond what a source explicitly states.
3. Require concrete evidence. Every finding needs at least one verifiable data point: a specific number, named entity, date, quote, or documented event.
4. Reject unsupported assertions. Vague claims without evidence do not meet the standard — exclude them.
5. Prioritize recency. Focus on sources published in the last ${days} days; note when relying on older material.
6. Diversify sources. Include at most 2 findings from any single domain to ensure breadth of perspective.
7. Quality over quantity. Fewer high-confidence findings are better than many weak or speculative ones.

Format your response as a structured brief with these exact sections:
## Executive Summary
## Key Findings
## Signals & Trends
## Notable Sources
## Recommended Next Steps`;

const DEFAULT_ROLE = 'You are a rigorous research agent with high standards for evidence and sourcing.';

function buildSystemPrompt(agentRole?: string, dateWindowDays = 30): string {
  const role = agentRole?.trim() || DEFAULT_ROLE;
  return `${role} ${SYSTEM_PROMPT_RULES_TEMPLATE(dateWindowDays)}`;
}

/** Returns a human-readable date range string for the search window. */
function buildDateRangeHint(days: number): string {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - days);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  return `Date range: focus on content published between ${fmt(start)} and ${fmt(today)} (last ${days} days).`;
}

/** Returns a hint listing already-seen URLs (or domains) to guide Claude away from repeat content. */
function buildSeenUrlsHint(seenUrls: Set<string>): string {
  if (seenUrls.size === 0) return '';

  const urls = Array.from(seenUrls);

  if (urls.length <= 10) {
    const list = urls.map((u) => `- ${u}`).join('\n');
    return `\nAlready reported in this search window — do NOT re-surface these URLs:\n${list}\nFind different sources covering the same or adjacent topics.\n`;
  }

  // For long lists, summarize by domain
  const domains = [...new Set(urls.map((u) => {
    try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; }
  }))].slice(0, 15);
  return `\nAlready reported in this search window — focus on sources not yet covered. Already-seen domains include: ${domains.join(', ')}. Seek out different publications and perspectives.\n`;
}

function buildUserPrompt(
  monitor: Monitor,
  docHint: string,
  learningHint: string,
  seenUrls?: Set<string>,
): string {
  const sanitizedTopic = sanitizeInput(monitor.topic);
  const sanitizedContext = monitor.context ? sanitizeInput(monitor.context, 5000) : '';
  const sanitizedSources = (monitor.sources ?? []).map(sanitizeInput);
  const sanitizedKeywords = (monitor.keywords ?? []).map(sanitizeInput);

  const sourcesLine =
    sanitizedSources.length > 0
      ? `Prioritize content from these sources: ${sanitizedSources.join(', ')}.`
      : '';
  const keywordsLine =
    sanitizedKeywords.length > 0
      ? `Focus especially on these areas: ${sanitizedKeywords.join(', ')}.`
      : '';
  const contextBlock = sanitizedContext
    ? `\nBackground context:\n${sanitizedContext}\n`
    : '';
  const dateRangeHint = buildDateRangeHint(monitor.date_window_days ?? 30);
  const seenHint = buildSeenUrlsHint(seenUrls ?? new Set());

  return `Research topic: "${sanitizedTopic}"
${contextBlock}
${dateRangeHint}${seenHint}
Deliver exactly ${monitor.max_results} Key Findings, each with a direct source URL.
${sourcesLine}
${keywordsLine}
${docHint}
${learningHint}

Search the web for the most recent and relevant information on this topic and produce a professional research brief.`;
}

function buildRetryPrompt(
  monitor: Monitor,
  verifiedCount: number,
  qualityScore: number,
  docHint: string,
  learningHint: string,
  seenUrls?: Set<string>,
): string {
  const sanitizedTopic = sanitizeInput(monitor.topic);
  const sanitizedContext = monitor.context ? sanitizeInput(monitor.context, 5000) : '';
  const sanitizedSources = (monitor.sources ?? []).map(sanitizeInput);
  const sanitizedKeywords = (monitor.keywords ?? []).map(sanitizeInput);

  const sourcesLine =
    sanitizedSources.length > 0
      ? `Prioritize content from these sources: ${sanitizedSources.join(', ')}.`
      : '';
  const keywordsLine =
    sanitizedKeywords.length > 0
      ? `Focus especially on these areas: ${sanitizedKeywords.join(', ')}.`
      : '';
  const contextBlock = sanitizedContext
    ? `\nBackground context:\n${sanitizedContext}\n`
    : '';

  const reason =
    verifiedCount < 2
      ? `only ${verifiedCount} finding${verifiedCount === 1 ? '' : 's'} could be verified`
      : `the average quality score was ${qualityScore}/5`;

  const dateRangeHint = buildDateRangeHint(monitor.date_window_days ?? 30);
  const seenHint = buildSeenUrlsHint(seenUrls ?? new Set());

  return `Research topic: "${sanitizedTopic}"
${contextBlock}
IMPORTANT: A previous search on this topic returned insufficient results (${reason}). This is a follow-up search to fill the gaps.

${dateRangeHint}${seenHint}
Please search for ${monitor.max_results - verifiedCount} additional findings. Focus specifically on:
- Concrete, recent data points (numbers, percentages, named companies or people)
- Pages that are publicly accessible (avoid paywalled or login-required content)
- Each finding MUST have a direct, full source URL in [Source Name](URL) format
${sourcesLine}
${keywordsLine}
${docHint}
${learningHint}`;
}

function buildLearningContext(previousRuns: PreviousRunContext[]): string {
  const relevant = previousRuns.filter(
    (r) => r.feedback || (r.findingRatings && Object.keys(r.findingRatings).length > 0),
  );
  if (relevant.length === 0) return '';

  const lines: string[] = ['\n\nLearning from your feedback on previous runs:'];

  for (const run of relevant) {
    if (run.feedback) {
      lines.push(`- User said: "${sanitizeInput(run.feedback)}"`);
    }
    if (run.findingRatings) {
      const upvoted = Object.entries(run.findingRatings)
        .filter(([, v]) => v.rating === 'up')
        .map(([k]) => k.slice(0, 120));
      const downvoted = Object.entries(run.findingRatings)
        .filter(([, v]) => v.rating === 'down')
        .map(([k, v]) => {
          const label = v.reason ? ` (reason: ${v.reason})` : '';
          return `"${k.slice(0, 120)}"${label}`;
        });
      if (upvoted.length > 0)
        lines.push(`- Findings the user found valuable: ${upvoted.map((f) => `"${f}"`).join('; ')}`);
      if (downvoted.length > 0)
        lines.push(`- Findings the user flagged as unhelpful or inaccurate: ${downvoted.join('; ')}`);
    }
  }

  lines.push('Use this to surface more of what the user finds valuable and avoid what they flagged.');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Phase 1 – web search
// ---------------------------------------------------------------------------

async function runSearchPhase(userPrompt: string, systemPrompt: string): Promise<string> {
  const response = await getAnthropic().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    messages: [{ role: 'user', content: userPrompt }],
  });

  let markdown = '';
  for (const block of response.content) {
    if (block.type === 'text') markdown += block.text;
  }
  return markdown;
}

// ---------------------------------------------------------------------------
// Phase 2 – URL extraction and validation
// ---------------------------------------------------------------------------

function extractFindingsFromMarkdown(markdown: string): ParsedFinding[] {
  // Use string ops to locate the section — avoids catastrophic regex backtracking
  const keyFindingsIdx = markdown.search(/##\s*Key Findings/i);
  if (keyFindingsIdx === -1) return [];

  const afterHeading = markdown.slice(keyFindingsIdx).replace(/##\s*Key Findings[^\n]*\n/i, '');
  const nextH2 = afterHeading.search(/\n##\s/);
  const section = nextH2 === -1 ? afterHeading : afterHeading.slice(0, nextH2);

  // Handle ### Finding N subsection format (Claude's default rich output)
  if (/###\s+Finding\s+\d/i.test(section)) {
    const subsections = section
      .split(/(?=###\s+Finding\s+\d)/i)
      .filter((s) => /###\s+Finding\s+\d/i.test(s)); // skip preamble (e.g. "---" lines)

    return subsections.map((sub) => {
      // URL is on the 🔗 line or any markdown link in the subsection
      const mdLinkMatch = sub.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/);
      const bareUrlMatch = !mdLinkMatch ? sub.match(/https?:\/\/\S+/) : null;
      const url = mdLinkMatch?.[2] ?? bareUrlMatch?.[0];

      // Title: first **bold** line after the heading, or the heading itself
      const boldMatch = sub.match(/^\*\*(.+?)\*\*/m);
      const headingMatch = sub.match(/###\s+(.+)/);
      const cleanText = (boldMatch?.[1] ?? headingMatch?.[1] ?? sub.split('\n')[0]).trim();

      return {
        rawLine: sub.trimEnd(),
        cleanText,
        url,
        urlStatus: url ? undefined : ('unsourced' as UrlStatus),
        disposition: url ? ('verified' as Disposition) : ('low-confidence' as Disposition),
        reason: url ? undefined : 'No source URL provided',
      };
    });
  }

  // Fall back: bullet-point format (- or *)
  return section
    .split('\n')
    .filter((l) => /^\s*[-*]/.test(l))
    .map((line) => {
      const mdLinkMatch = line.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/);
      const bareUrlMatch = !mdLinkMatch ? line.match(/https?:\/\/\S+/) : null;
      const url = mdLinkMatch?.[2] ?? bareUrlMatch?.[0];

      const cleanText = line
        .replace(/^\s*[-*]\s+/, '')
        .replace(/\[([^\]]+)\]\(https?:\/\/[^\s)]+\)/g, '$1')
        .trim();

      return {
        rawLine: line,
        cleanText,
        url,
        urlStatus: url ? undefined : ('unsourced' as UrlStatus),
        disposition: url ? ('verified' as Disposition) : ('low-confidence' as Disposition),
        reason: url ? undefined : 'No source URL provided',
      };
    });
}

async function checkUrl(url: string): Promise<UrlStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ResearchBot/1.0)' },
    });
    clearTimeout(timer);
    if (res.status === 404 || res.status === 410) return 'dead';
    if (res.status >= 200 && res.status < 300) return 'ok';
    // 403, 401, 429, 5xx — site is up but blocking us; can't confirm dead
    return 'unverifiable';
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === 'AbortError') return 'timeout';
    return 'unverifiable';
  }
}

async function validateFindingUrls(findings: ParsedFinding[]): Promise<ParsedFinding[]> {
  return Promise.all(
    findings.map(async (f) => {
      if (!f.url) return f; // already marked low-confidence / unsourced

      const status = await checkUrl(f.url);

      if (status === 'dead') {
        return {
          ...f,
          urlStatus: status,
          disposition: 'removed' as Disposition,
          reason: 'Source URL returned 404 (page not found)',
        };
      }

      const urlReason =
        status === 'timeout'
          ? 'Source URL timed out (could not verify)'
          : status === 'unverifiable'
            ? 'Source URL could not be verified (site may block automated checks)'
            : undefined;

      return {
        ...f,
        urlStatus: status,
        // unverifiable/timeout → demote to low-confidence; ok → keep verified
        disposition: (status === 'ok' ? 'verified' : 'low-confidence') as Disposition,
        reason: urlReason,
      };
    }),
  );
}

// ---------------------------------------------------------------------------
// Phase 3 – quality evaluation (second Claude call, no web search)
// ---------------------------------------------------------------------------

async function evaluateFindings(
  topic: string,
  findings: ParsedFinding[],
): Promise<{ findings: ParsedFinding[]; qualityScore: number }> {
  const candidates = findings.filter((f) => f.disposition !== 'removed');
  if (candidates.length === 0) return { findings, qualityScore: 0 };

  const numberedList = candidates.map((f, i) => `${i}. ${f.cleanText}`).join('\n');

  let parsed: EvaluatorResponse | null = null;

  try {
    const res = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system:
        'You are a research quality reviewer. You respond ONLY with valid JSON — no markdown fences, no extra text.',
      messages: [
        {
          role: 'user',
          content: `Evaluate these Key Findings from a research brief on: "${sanitizeInput(topic)}"

Score each finding 1–5:
5 = Specific stat/fact, named primary source, clearly recent, highly relevant
4 = Specific, well-sourced, relevant
3 = Reasonably specific, has source, on-topic
2 = Vague, missing key details, or questionable relevance
1 = Generic claim with no real evidence, off-topic, or appears fabricated

Return ONLY this JSON (nothing else):
{"findings":[{"index":0,"score":4,"keep":true,"reason":"has specific data"}],"overallScore":3.5}

Set keep=false when score < 3.

Findings (0-indexed):
${numberedList}`,
        },
      ],
    });

    const text = res.content.find((b) => b.type === 'text')?.text ?? '';
    parsed = JSON.parse(text) as EvaluatorResponse;
  } catch {
    // Evaluation failed — treat all candidates as score 3, keep all
    return {
      findings: candidates.map((f) => ({ ...f, qualityScore: 3 })),
      qualityScore: 3,
    };
  }

  const annotated = findings.map((f) => {
    const candidateIdx = candidates.findIndex((c) => c === f);
    if (candidateIdx === -1) return f; // was already 'removed'

    const evaluation = parsed!.findings.find((e) => e.index === candidateIdx);
    if (!evaluation) return { ...f, qualityScore: 3 };

    const qualityReason =
      evaluation.score < 3 ? `Quality score ${evaluation.score}/5: ${evaluation.reason}` : undefined;

    const combinedReason = [f.reason, qualityReason].filter(Boolean).join('; ') || undefined;

    return {
      ...f,
      qualityScore: evaluation.score,
      // Only downgrade, never upgrade (a low-confidence URL stays low-confidence)
      disposition: (
        !evaluation.keep
          ? 'low-confidence'
          : f.disposition === 'low-confidence'
            ? 'low-confidence'
            : 'verified'
      ) as Disposition,
      reason: combinedReason,
    };
  });

  const verifiedScores = annotated
    .filter((f) => f.disposition === 'verified' && f.qualityScore != null)
    .map((f) => f.qualityScore!);

  const qualityScore =
    verifiedScores.length > 0
      ? Math.round((verifiedScores.reduce((a, b) => a + b, 0) / verifiedScores.length) * 10) / 10
      : 0;

  return { findings: annotated, qualityScore };
}

// ---------------------------------------------------------------------------
// Phase 4 – deduplication helper
// ---------------------------------------------------------------------------

function deduplicateFindings(existing: ParsedFinding[], incoming: ParsedFinding[]): ParsedFinding[] {
  const seenKeys = new Set(existing.map((f) => f.cleanText.slice(0, 60).toLowerCase()));
  return incoming.filter((f) => !seenKeys.has(f.cleanText.slice(0, 60).toLowerCase()));
}

// ---------------------------------------------------------------------------
// Phase 5 – brief assembly
// ---------------------------------------------------------------------------

function buildRemovalSummary(
  findings: ParsedFinding[],
  maxResults: number,
  retriedSearch: boolean,
): string {
  const verified = findings.filter((f) => f.disposition === 'verified');
  const lowConf = findings.filter((f) => f.disposition === 'low-confidence');
  const dead = findings.filter((f) => f.urlStatus === 'dead');
  const lowQuality = findings.filter(
    (f) => f.disposition === 'low-confidence' && f.qualityScore != null && f.qualityScore < 3,
  );

  const parts: string[] = [];

  if (verified.length < maxResults) {
    parts.push(`${verified.length} of ${maxResults} requested findings verified`);
  }
  if (dead.length > 0) {
    parts.push(`${dead.length} finding${dead.length > 1 ? 's' : ''} removed (dead URL / 404)`);
  }
  if (lowQuality.length > 0) {
    parts.push(
      `${lowQuality.length} finding${lowQuality.length > 1 ? 's' : ''} moved to low-confidence (quality score below threshold)`,
    );
  }
  if (lowConf.length > 0 && verified.length >= maxResults) {
    parts.push(
      `${lowConf.length} finding${lowConf.length > 1 ? 's' : ''} available under Low Confidence Results`,
    );
  }
  if (retriedSearch) {
    parts.push('a second search was run to fill gaps');
  }

  return parts.length > 0 ? parts.join('; ') : '';
}

function assembleBrief(
  templateMarkdown: string,
  allFindings: ParsedFinding[],
  meta: { qualityScore: number; retriedSearch: boolean; removedFindings: number; maxResults: number },
): string {
  const verified = allFindings.filter((f) => f.disposition === 'verified');
  const lowConf = allFindings.filter((f) => f.disposition === 'low-confidence');

  // Build the Key Findings replacement
  const keyFindingsLines =
    verified.length > 0
      ? verified.map((f) => f.rawLine).join('\n')
      : '*No fully verified findings for this run.*';

  // Replace Key Findings section using string operations to avoid regex backtracking
  let result = templateMarkdown;
  const kfIdx = result.search(/##\s*Key Findings/i);
  if (kfIdx !== -1) {
    const afterKf = result.slice(kfIdx).replace(/##\s*Key Findings[^\n]*\n/i, '');
    const nextH2 = afterKf.search(/\n##\s/);
    const beforeKf = result.slice(0, kfIdx);
    const afterSection = nextH2 === -1 ? '' : afterKf.slice(nextH2);
    result = `${beforeKf}## Key Findings\n${keyFindingsLines}\n${afterSection}`;
  }

  // Append Low Confidence section if we're short on verified results
  if (lowConf.length > 0 && verified.length < meta.maxResults) {
    const lcLines = lowConf
      .map((f) => `${f.rawLine}  \n  *↳ ${f.reason ?? 'Could not be fully verified'}*`)
      .join('\n');
    result += `\n## ⚠️ Low Confidence Results\n*These findings could not be fully verified — treat with caution.*\n${lcLines}\n`;
  }

  // Run summary footer
  const summary = buildRemovalSummary(allFindings, meta.maxResults, meta.retriedSearch);
  if (summary) {
    result += `\n---\n*Run summary: ${summary}. Quality score: ${meta.qualityScore}/5.*\n`;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Runs a full 5-phase quality pipeline:
 *   1. Web search with strict sourcing rules
 *   2. URL validation (parallel HEAD checks)
 *   3. Internal quality evaluation (second Claude call, no web search)
 *   4. Conditional retry if results are insufficient
 *   5. Final merge + assembly with optional Low Confidence section
 *
 * When CAPTURE_FIXTURES=true in the environment, every run is automatically
 * recorded as a fixture set in src/__tests__/fixtures/ — no separate script needed.
 */
export async function runMonitor(
  monitor: Monitor,
  documentContext?: string,
  previousRuns?: PreviousRunContext[],
  seenUrls?: Set<string>,
): Promise<BriefResult> {
  // ── Recorder mode ───────────────────────────────────────────────────────
  if (process.env.CAPTURE_FIXTURES === 'true') {
    const { saveFixture, autoFixtureName } = await import('@/lib/testing/saveFixture');
    const fixtureName =
      process.env.FIXTURE_NAME || autoFixtureName(monitor.name || monitor.topic);

    const result = await runMonitorInstrumented(monitor, documentContext, previousRuns);
    const { _instrumented: i } = result;

    saveFixture({
      fixtureName,
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
        verifiedCount: i.allFindings.filter((f) => f.disposition === 'verified').length,
        lowConfidenceCount: i.allFindings.filter((f) => f.disposition === 'low-confidence').length,
        removedCount: i.allFindings.filter((f) => f.disposition === 'removed').length,
      },
    });

    // Return the same shape as the non-instrumented path
    const { _instrumented: _unused, ...briefResult } = result;
    void _unused;
    return briefResult;
  }

  // ── Normal production path ───────────────────────────────────────────────
  const docHint = documentContext
    ? `\n\nAdditional context from uploaded document:\n${documentContext}`
    : '';
  const learningHint = previousRuns?.length ? buildLearningContext(previousRuns) : '';
  const seen = seenUrls ?? new Set<string>();

  // ── Phase 1: initial search ─────────────────────────────────────────────
  const systemPrompt = buildSystemPrompt(monitor.agent_role, monitor.date_window_days ?? 30);
  const phase1Markdown = await runSearchPhase(buildUserPrompt(monitor, docHint, learningHint, seen), systemPrompt);

  // ── Phase 2: URL validation ─────────────────────────────────────────────
  let findings = extractFindingsFromMarkdown(phase1Markdown);
  findings = await validateFindingUrls(findings);

  // ── Deduplication: remove findings already seen in this window ──────────
  findings = findings.filter((f) => {
    if (!f.url || f.disposition === 'removed') return true; // keep unsourced/removed as-is
    return !seen.has(f.url);
  });
  if (seen.size > 0) {
    console.log(`[dedup] Filtered to ${findings.length} new findings (${seen.size} URLs already seen this window)`);
  }

  // ── Phase 3: quality evaluation ─────────────────────────────────────────
  const { findings: evaluatedFindings, qualityScore: phase1Score } = await evaluateFindings(
    monitor.topic,
    findings,
  );

  const phase1Verified = evaluatedFindings.filter((f) => f.disposition === 'verified');
  const needsRetry = phase1Verified.length < 2 || phase1Score < 3;

  // ── Phase 4: conditional retry ──────────────────────────────────────────
  let allFindings = evaluatedFindings;
  let qualityScore = phase1Score;
  let retriedSearch = false;

  if (needsRetry) {
    retriedSearch = true;

    const retryMarkdown = await runSearchPhase(
      buildRetryPrompt(monitor, phase1Verified.length, phase1Score, docHint, learningHint, seen),
      systemPrompt,
    );

    let retryFindings = extractFindingsFromMarkdown(retryMarkdown);
    retryFindings = await validateFindingUrls(retryFindings);

    // Dedup retry findings too
    retryFindings = retryFindings.filter((f) => {
      if (!f.url || f.disposition === 'removed') return true;
      return !seen.has(f.url);
    });

    const { findings: evaluatedRetry, qualityScore: retryScore } = await evaluateFindings(
      monitor.topic,
      retryFindings,
    );

    // Merge: keep Phase 1 findings, add non-duplicate Phase 4 findings
    const newFindings = deduplicateFindings(evaluatedFindings, evaluatedRetry);
    allFindings = [...evaluatedFindings, ...newFindings];
    qualityScore =
      phase1Score > 0 && retryScore > 0
        ? Math.round(((phase1Score + retryScore) / 2) * 10) / 10
        : Math.max(phase1Score, retryScore);
  }

  // ── Phase 5: assemble final brief ───────────────────────────────────────
  const removedFindings = allFindings.filter(
    (f) => f.disposition === 'removed' || f.urlStatus === 'dead',
  ).length;

  const finalMarkdown = assembleBrief(phase1Markdown, allFindings, {
    qualityScore,
    retriedSearch,
    removedFindings,
    maxResults: monitor.max_results,
  });

  const html = markdownToHtml(finalMarkdown);

  // Collect URLs to persist for future deduplication (verified + low-confidence only)
  const foundUrls = allFindings
    .filter((f) => f.disposition !== 'removed' && f.url)
    .map((f) => f.url!);

  return { markdown: finalMarkdown, html, qualityScore, retriedSearch, removedFindings, foundUrls };
}

// ---------------------------------------------------------------------------
// Instrumented orchestrator (testing / fixture capture only)
// ---------------------------------------------------------------------------

export interface InstrumentedBriefResult extends BriefResult {
  /** All intermediate pipeline states — used for fixture capture and debugging */
  _instrumented: {
    // Prompts — exactly as built and sent to the API
    systemPrompt: string;
    userPrompt: string;
    retryPrompt?: string;
    learningHint: string;
    docHint: string;
    // Pipeline states
    phase1Markdown: string;
    phase2Parsed: ParsedFinding[];
    phase2Validated: ParsedFinding[];
    phase3EvalRequest: string;
    phase3EvalResponse: string;
    phase3Evaluated: ParsedFinding[];
    phase4RetryMarkdown?: string;
    phase4RetryValidated?: ParsedFinding[];
    phase4RetryEvaluated?: ParsedFinding[];
    allFindings: ParsedFinding[];
    finalMarkdown: string;
  };
}

/**
 * Same as runMonitor() but captures every intermediate pipeline state
 * including the exact prompts as built. Use this for fixture capture and
 * debugging — never call directly from production routes (use runMonitor()).
 */
export async function runMonitorInstrumented(
  monitor: Monitor,
  documentContext?: string,
  previousRuns?: PreviousRunContext[],
): Promise<InstrumentedBriefResult> {
  const docHint = documentContext
    ? `\n\nAdditional context from uploaded document:\n${documentContext}`
    : '';
  const learningHint = previousRuns?.length ? buildLearningContext(previousRuns) : '';
  const userPrompt = buildUserPrompt(monitor, docHint, learningHint);
  const systemPrompt = buildSystemPrompt(monitor.agent_role, monitor.date_window_days ?? 30);

  // Phase 1
  const phase1Markdown = await runSearchPhase(userPrompt, systemPrompt);

  // Phase 2
  const phase2Parsed = extractFindingsFromMarkdown(phase1Markdown);
  const phase2Validated = await validateFindingUrls([...phase2Parsed]);

  // Phase 3
  const phase3Candidates = phase2Validated.filter((f) => f.disposition !== 'removed');
  const phase3EvalRequest = phase3Candidates.map((f, i) => `${i}. ${f.cleanText}`).join('\n');
  let phase3EvalResponse = '';

  const { findings: phase3Evaluated, qualityScore: phase1Score } = await evaluateFindings(
    monitor.topic,
    phase2Validated,
  );

  // Re-run the evaluator call to capture its raw response
  if (phase3Candidates.length > 0) {
    try {
      const evalRes = await getAnthropic().messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system:
          'You are a research quality reviewer. You respond ONLY with valid JSON — no markdown fences, no extra text.',
        messages: [
          {
            role: 'user',
            content: buildEvalPrompt(sanitizeInput(monitor.topic), phase3EvalRequest),
          },
        ],
      });
      phase3EvalResponse = evalRes.content.find((b) => b.type === 'text')?.text ?? '';
    } catch {
      phase3EvalResponse = '(capture failed)';
    }
  }

  const phase1Verified = phase3Evaluated.filter((f) => f.disposition === 'verified');
  const needsRetry = phase1Verified.length < 2 || phase1Score < 3;

  let allFindings = phase3Evaluated;
  let qualityScore = phase1Score;
  let retriedSearch = false;
  let retryPrompt: string | undefined;
  let phase4RetryMarkdown: string | undefined;
  let phase4RetryValidated: ParsedFinding[] | undefined;
  let phase4RetryEvaluated: ParsedFinding[] | undefined;

  if (needsRetry) {
    retriedSearch = true;
    retryPrompt = buildRetryPrompt(monitor, phase1Verified.length, phase1Score, docHint, learningHint);
    phase4RetryMarkdown = await runSearchPhase(retryPrompt, systemPrompt);

    const retryParsed = extractFindingsFromMarkdown(phase4RetryMarkdown);
    phase4RetryValidated = await validateFindingUrls([...retryParsed]);

    const { findings: evaluatedRetry, qualityScore: retryScore } = await evaluateFindings(
      monitor.topic,
      phase4RetryValidated,
    );
    phase4RetryEvaluated = evaluatedRetry;

    const newFindings = deduplicateFindings(phase3Evaluated, evaluatedRetry);
    allFindings = [...phase3Evaluated, ...newFindings];
    qualityScore =
      phase1Score > 0 && retryScore > 0
        ? Math.round(((phase1Score + retryScore) / 2) * 10) / 10
        : Math.max(phase1Score, retryScore);
  }

  const removedFindings = allFindings.filter(
    (f) => f.disposition === 'removed' || f.urlStatus === 'dead',
  ).length;

  const finalMarkdown = assembleBrief(phase1Markdown, allFindings, {
    qualityScore,
    retriedSearch,
    removedFindings,
    maxResults: monitor.max_results,
  });

  const html = markdownToHtml(finalMarkdown);

  return {
    markdown: finalMarkdown,
    html,
    qualityScore,
    retriedSearch,
    removedFindings,
    foundUrls: allFindings
      .filter((f) => f.disposition !== 'removed' && f.url)
      .map((f) => f.url!),
    _instrumented: {
      systemPrompt,
      userPrompt,
      retryPrompt,
      learningHint,
      docHint,
      phase1Markdown,
      phase2Parsed,
      phase2Validated,
      phase3EvalRequest,
      phase3EvalResponse,
      phase3Evaluated,
      phase4RetryMarkdown,
      phase4RetryValidated,
      phase4RetryEvaluated,
      allFindings,
      finalMarkdown,
    },
  };
}

/** Extracted so the capture script can reproduce the exact evaluator prompt. */
export function buildEvalPrompt(topic: string, numberedList: string): string {
  return `Evaluate these research findings on the topic: "${topic}"

Score each finding 1–5 based on evidence quality and relevance:
5 = Concrete, verifiable data point with a named primary source, clearly recent, directly relevant
4 = Specific, well-sourced, relevant
3 = Reasonably specific, has a source, relevant to the topic
2 = Vague, missing key details, tangentially relevant, or hard to verify
1 = Generic assertion with no real evidence, off-topic, or appears fabricated/inferred

Return ONLY this JSON (nothing else):
{"findings":[{"index":0,"score":4,"keep":true,"reason":"has specific data"}],"overallScore":3.5}

Set keep=false when score < 3.

Findings (0-indexed):
${numberedList}`;
}

/** Sanitizes user input to prevent prompt injection. */
function sanitizeInput(input: string, maxLength = 500): string {
  return input
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/\{\{.*?\}\}/g, '')
    .replace(/<\/?[^>]+(>|$)/g, '')
    .trim()
    .slice(0, maxLength);
}

/** Simple markdown-to-HTML converter. */
function markdownToHtml(markdown: string): string {
  return markdown
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`)
    .replace(
      /\[(.+?)\]\((.+?)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    );
}

