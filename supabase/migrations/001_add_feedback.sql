-- ============================================================
-- Migration 001: Add feedback columns to runs table
-- Run this in the Supabase SQL editor.
-- ============================================================

-- user_feedback: free-text notes the user adds after reviewing a run.
-- Automatically included as context in the next run of the same monitor.
alter table public.runs
  add column if not exists user_feedback text;

-- finding_ratings: thumbs up/down on individual Key Findings.
-- Stored as { "finding text...": "up" | "down" }
-- Used in future runs to surface more of what works and less of what doesn't.
alter table public.runs
  add column if not exists finding_ratings jsonb not null default '{}'::jsonb;
