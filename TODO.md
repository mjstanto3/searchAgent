# SearchAgent TODO

## Osprey

- [x] **[BUG] JSON parse failures — Claude returning prose instead of JSON** (`src/lib/osprey/researchRow.ts`)
  - Fixed: replaced text-based JSON parsing with `submit_research` tool_use + `tool_choice: any`; Claude is now forced to call the tool instead of outputting prose
- [x] **Quality threshold / early exit** — added `confidence` (1–5) + `confidence_reason` per answer and `overall_quality` to `submit_research` schema; system prompt instructs Claude to call submit_research immediately when all answers score 4–5 rather than exhausting all searches
- [x] **Cancel & restart reliability** — root cause was a missing `'cancelled'` value in the DB check constraint (silent write failures); fixed via migration 009 + atomic `run_id` transition, zombie task detection, trial route guard, and UI error surfaces
- [ ] **Parallel row processing** — rows currently run sequentially; batching N rows concurrently would cut total run time significantly
- [ ] **Cross-row intelligence / shared context** — results found for one row are discarded even if relevant to another; explore accumulating a shared knowledge pool as the job progresses
- [ ] **Per-row deduplication** — no dedup of sources across rows; same URLs may be fetched multiple times for a large job

## Magpie

<!-- add items here -->

## General / Infrastructure

- [ ] **Stripe integration** — connect and test Stripe end-to-end (checkout, webhook, credit top-up flow)
- [ ] **Credit calculation bugs** — issues in multiple locations; audit all credit check, deduction, and balance update logic across Magpie and Osprey
