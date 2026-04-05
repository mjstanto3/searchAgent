-- ============================================================
-- Migration 004: Add agent_role column to monitors table
-- Run this in the Supabase SQL editor.
-- ============================================================

-- agent_role: Claude-generated expert persona for this monitor's research topic.
-- Generated once on monitor creation and cached here. Each run uses this role
-- as the opening of the system prompt instead of the generic default.
-- NULL means the monitor was created before this feature, or role generation failed.
alter table public.monitors
  add column if not exists agent_role text;
