/**
 * Anthropic model and temperature configuration.
 *
 * Temperature only applies to calls WITHOUT tools (web_search ignores it).
 * Each call site has its own named constant so they can be tuned independently.
 *
 * Scale: 0.0 = deterministic / factual, 1.0 = creative / varied
 */

// ─── Models ──────────────────────────────────────────────────────────────────

export const MODELS = {
  /** Primary research model for Magpie web searches */
  MAGPIE_SEARCH: 'claude-sonnet-4-6',
  /** Quality evaluation pass — no tools, factual grading */
  MAGPIE_EVALUATOR: 'claude-sonnet-4-6',
  /** Agent role generation — short, creative persona */
  MAGPIE_AGENT_ROLE: 'claude-haiku-4-5',
  /** Run suggestions — creative ideation */
  MAGPIE_SUGGESTIONS: 'claude-haiku-4-5',

  /** Osprey dataset assessment + clarifying questions */
  OSPREY_ASSESS: 'claude-sonnet-4-5',
  /** Osprey per-row web research */
  OSPREY_RESEARCH: 'claude-sonnet-4-5',
} as const;

// ─── Temperatures ────────────────────────────────────────────────────────────
// Note: calls that use the web_search tool ignore temperature — listed here for
// documentation only; they are not passed to the API.

export const TEMPERATURES = {
  /**
   * Magpie quality evaluator (Phase 3).
   * Low — needs consistent, structured JSON scoring.
   */
  MAGPIE_EVALUATOR: 0.1,

  /**
   * Agent role generation.
   * Moderate — benefits from slight variation to produce distinct personas.
   */
  MAGPIE_AGENT_ROLE: 0.2,

  /**
   * Run suggestions.
   * Moderate-high — creative keyword/source ideation.
   */
  MAGPIE_SUGGESTIONS: 0.3,

  /**
   * Osprey dataset assessment / clarifying questions.
   * Moderate — generative but grounded in the data.
   */
  OSPREY_ASSESS: 0.1,

  // web_search calls (temperature ignored by API — documented for reference):
  // MAGPIE_SEARCH: n/a
  // OSPREY_RESEARCH: n/a
} as const;
