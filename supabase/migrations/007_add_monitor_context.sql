-- ============================================================
-- Migration 007: Add context column to monitors table
-- Run this in the Supabase SQL editor.
-- ============================================================

-- context: optional free-form background context provided by the user.
-- Separate from topic (the research question) — this is where users add
-- background info, constraints, prior knowledge, etc. Injected into the
-- user prompt alongside the topic.
alter table public.monitors
  add column if not exists context text;
