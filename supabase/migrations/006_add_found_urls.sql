-- ============================================================
-- Migration 006: Add found_urls column to runs table
-- Run this in the Supabase SQL editor.
-- ============================================================

-- found_urls: JSONB array of all verified/low-confidence finding URLs from a completed run.
-- Used for cross-run deduplication within the monitor's date window — subsequent runs
-- within the same window filter out URLs already reported here.
alter table public.runs
  add column if not exists found_urls jsonb default null;
