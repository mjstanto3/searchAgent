-- ============================================================
-- Migration 003: Add suggestions column to runs table
-- Run this in the Supabase SQL editor.
-- ============================================================

-- suggestions: JSONB array of AI-generated research improvement suggestions.
-- Schema per element:
--   { id: string, type: 'keyword'|'source'|'topic_refinement'|'gap',
--     text: string, rationale: string, applied: boolean }
alter table public.runs
  add column if not exists suggestions jsonb default null;
