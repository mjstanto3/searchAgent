-- ============================================================
-- Migration 005: Add date_window_days column to monitors table
-- Run this in the Supabase SQL editor.
-- ============================================================

-- date_window_days: rolling lookback window used when building the search prompt.
-- Each run computes a concrete date range from today minus this many days.
-- Default 30 covers existing monitors gracefully.
alter table public.monitors
  add column if not exists date_window_days smallint not null default 30
    check (date_window_days between 1 and 365);
