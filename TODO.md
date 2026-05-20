# SearchAgent TODO

## Osprey

- [x] **[BUG] JSON parse failures — Claude returning prose instead of JSON** (`src/lib/osprey/researchRow.ts`)
  - Fixed: replaced text-based JSON parsing with `submit_research` tool_use + `tool_choice: any`; Claude is now forced to call the tool instead of outputting prose
- [x] **Quality threshold / early exit** — added `confidence` (1–5) + `confidence_reason` per answer and `overall_quality` to `submit_research` schema; system prompt instructs Claude to call submit_research immediately when all answers score 4–5 rather than exhausting all searches
- [x] **Cancel & restart reliability** — root cause was a missing `'cancelled'` value in the DB check constraint (silent write failures); fixed via migration 009 + atomic `run_id` transition, zombie task detection, trial route guard, and UI error surfaces
- [ ] **Evaluator loop between research and display** — after each row's `researchRow` call, hit a separate Anthropic API call (no tools, just critique) that reviews the answers and scores them independently. If the evaluator scores < 4/5, inject its feedback back into a new `researchRow` call as additional context and retry. Keep looping until either (a) evaluator reaches 4/5, or (b) the effort tier's retry budget is exhausted (low: 1 re-search, medium: 2, large: 3). On budget exhaustion, keep whatever was found but force `overall_quality` to reflect the actual confidence so the UI can show a low-certainty badge. The evaluator prompt should ask: "Given these research questions and answers, score each answer 1–5 and explain any gaps. Be critical — a score of 4 requires a specific source." Architecture: new `evaluateResearch(questions, answers) → { score, feedback }` function in `src/lib/osprey/evaluateResearch.ts`; `researchRow` loops calling it after each attempt.
- [x] **Trial progress bar** — the trial run (3 rows) currently shows no per-row progress; add a progress indicator to `ProgressUI.tsx` that shows which row is being processed (e.g. "Researching row 2 of 3…") by polling `rows_completed` from the job record. The trial route already increments `rows_completed` after each row, so no backend change needed — just surface it in the UI with a stepped progress bar or row-by-row status list.
- [ ] **Parallel row processing** — rows currently run sequentially; batching N rows concurrently would cut total run time significantly
- [ ] **Cross-row intelligence / shared context** — results found for one row are discarded even if relevant to another; explore accumulating a shared knowledge pool as the job progresses
- [ ] **Per-row deduplication** — no dedup of sources across rows; same URLs may be fetched multiple times for a large job

## Magpie

<!-- add items here -->

## General / Infrastructure

- [ ] **Stripe integration** — connect and test Stripe end-to-end (checkout, webhook, credit top-up flow)
- [ ] **Credit calculation bugs** — issues in multiple locations; audit all credit check, deduction, and balance update logic across Magpie and Osprey
