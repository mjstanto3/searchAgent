-- Migration 009: Osprey cancel/restart reliability
-- The osprey_jobs status check constraint did not include 'cancelled',
-- causing all cancellation writes to silently fail at the DB level.

-- Fix the status constraint (drop inline unnamed constraint, recreate with 'cancelled')
ALTER TABLE public.osprey_jobs
  DROP CONSTRAINT IF EXISTS osprey_jobs_status_check;

ALTER TABLE public.osprey_jobs
  ADD CONSTRAINT osprey_jobs_status_check
  CHECK (status IN ('pending','processing','trial_complete','complete','failed','cancelled'));

-- Add run_id for zombie background task detection.
-- Populated with a new UUID each time a run starts; background tasks exit
-- if the DB value no longer matches their captured run_id.
ALTER TABLE public.osprey_jobs
  ADD COLUMN IF NOT EXISTS run_id uuid;
