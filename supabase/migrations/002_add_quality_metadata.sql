-- ============================================================
-- Migration 002: Add quality metadata columns to runs table
-- Run this in the Supabase SQL editor.
-- ============================================================

-- quality_score: 1-5 rating from the internal evaluation loop.
-- NULL means the run predates this feature or evaluation was skipped.
alter table public.runs
  add column if not exists quality_score smallint check (quality_score between 1 and 5);

-- retried_search: true if the pipeline triggered a second search pass
-- because initial results were insufficient.
alter table public.runs
  add column if not exists retried_search boolean not null default false;

-- removed_findings: count of findings dropped during URL validation
-- or the quality evaluation pass.
alter table public.runs
  add column if not exists removed_findings smallint not null default 0;
