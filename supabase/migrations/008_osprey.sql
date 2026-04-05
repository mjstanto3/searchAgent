-- Migration 008: Osprey batch list enrichment tables

-- osprey_jobs table
create table if not exists public.osprey_jobs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  status              text not null default 'pending'
                        check (status in ('pending','processing','trial_complete','complete','failed')),
  original_file_url   text,
  original_file_name  text,
  enriched_file_url   text,
  parsed_data         jsonb,
  llm_assessment      text,
  clarifying_questions jsonb,
  clarifying_answers  jsonb,
  research_questions  jsonb,
  suggested_sources   jsonb,
  effort_tier         text not null default 'medium'
                        check (effort_tier in ('low','medium','large')),
  total_rows          int not null default 0,
  rows_completed      int not null default 0,
  credits_used        int not null default 0,
  error_message       text,
  created_at          timestamptz not null default now(),
  completed_at        timestamptz
);

-- osprey_results table
create table if not exists public.osprey_results (
  id                uuid primary key default gen_random_uuid(),
  job_id            uuid not null references public.osprey_jobs(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  row_index         int not null,
  research_target   text not null,
  answers           jsonb,
  status            text not null default 'pending'
                      check (status in ('pending','complete','failed')),
  credits_used      int not null default 0,
  error_message     text,
  created_at        timestamptz not null default now(),
  unique (job_id, row_index)
);

-- Indexes for common queries
create index if not exists osprey_jobs_user_id_idx on public.osprey_jobs(user_id);
create index if not exists osprey_jobs_status_idx on public.osprey_jobs(status);
create index if not exists osprey_results_job_id_idx on public.osprey_results(job_id);
create index if not exists osprey_results_job_row_idx on public.osprey_results(job_id, row_index);

-- Row Level Security
alter table public.osprey_jobs enable row level security;
alter table public.osprey_results enable row level security;

-- osprey_jobs RLS policies
create policy "Users can view their own jobs"
  on public.osprey_jobs for select
  using (auth.uid() = user_id);

create policy "Users can insert their own jobs"
  on public.osprey_jobs for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own jobs"
  on public.osprey_jobs for update
  using (auth.uid() = user_id);

create policy "Users can delete their own jobs"
  on public.osprey_jobs for delete
  using (auth.uid() = user_id);

-- osprey_results RLS policies
create policy "Users can view their own results"
  on public.osprey_results for select
  using (auth.uid() = user_id);

create policy "Users can insert their own results"
  on public.osprey_results for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own results"
  on public.osprey_results for update
  using (auth.uid() = user_id);

create policy "Users can delete their own results"
  on public.osprey_results for delete
  using (auth.uid() = user_id);
