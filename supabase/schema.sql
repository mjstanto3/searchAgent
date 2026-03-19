-- ============================================================
-- SearchAgent – Supabase Schema
-- Run this in the Supabase SQL editor to set up your database.
-- ============================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";

-- ============================================================
-- USERS (extends Supabase auth.users)
-- ============================================================
create table if not exists public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  full_name     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.users enable row level security;

create policy "Users can view their own profile"
  on public.users for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.users for update
  using (auth.uid() = id);

-- ============================================================
-- CREDITS
-- ============================================================
create table if not exists public.credits (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.users(id) on delete cascade,
  balance       integer not null default 0 check (balance >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.credits enable row level security;

create policy "Users can view their own credits"
  on public.credits for select
  using (auth.uid() = user_id);

-- Credit transactions ledger
create table if not exists public.credit_transactions (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.users(id) on delete cascade,
  amount        integer not null,  -- positive = add, negative = deduct
  description   text not null,
  stripe_payment_id text,
  created_at    timestamptz not null default now()
);

alter table public.credit_transactions enable row level security;

create policy "Users can view their own transactions"
  on public.credit_transactions for select
  using (auth.uid() = user_id);

-- ============================================================
-- MONITORS
-- ============================================================
create type public.monitor_frequency as enum ('daily', 'weekly', 'biweekly');

create table if not exists public.monitors (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.users(id) on delete cascade,
  name            text not null,
  topic           text not null,
  sources         text[],          -- optional prioritized sites/URLs
  keywords        text[],          -- areas of interest
  document_path   text,            -- Supabase storage path for uploaded doc
  document_name   text,
  frequency       public.monitor_frequency not null default 'weekly',
  max_results     integer not null default 10 check (max_results between 1 and 50),
  is_active       boolean not null default true,
  next_run_at     timestamptz,
  last_run_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.monitors enable row level security;

create policy "Users can view their own monitors"
  on public.monitors for select
  using (auth.uid() = user_id);

create policy "Users can insert their own monitors"
  on public.monitors for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own monitors"
  on public.monitors for update
  using (auth.uid() = user_id);

create policy "Users can delete their own monitors"
  on public.monitors for delete
  using (auth.uid() = user_id);

-- ============================================================
-- RUNS (output history)
-- ============================================================
create type public.run_status as enum ('pending', 'running', 'completed', 'failed');

create table if not exists public.runs (
  id              uuid primary key default uuid_generate_v4(),
  monitor_id      uuid not null references public.monitors(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  status          public.run_status not null default 'pending',
  brief_html      text,
  brief_markdown  text,
  credits_used    integer,
  error_message   text,
  email_sent      boolean not null default false,
  created_at      timestamptz not null default now(),
  completed_at    timestamptz
);

alter table public.runs enable row level security;

create policy "Users can view their own runs"
  on public.runs for select
  using (auth.uid() = user_id);

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Auto-create user profile + credits row on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, full_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name'
  );

  insert into public.credits (user_id, balance)
  values (new.id, 10);  -- 10 free credits on signup

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_monitors_user_id     on public.monitors(user_id);
create index if not exists idx_monitors_next_run    on public.monitors(next_run_at) where is_active = true;
create index if not exists idx_runs_monitor_id      on public.runs(monitor_id);
create index if not exists idx_runs_user_id         on public.runs(user_id);
create index if not exists idx_credits_user_id      on public.credits(user_id);
create index if not exists idx_transactions_user_id on public.credit_transactions(user_id);

-- ============================================================
-- RPC FUNCTIONS for credit operations
-- ============================================================

-- Decrement credits atomically and record transaction
create or replace function public.decrement_credits(
  p_user_id    uuid,
  p_amount     integer,
  p_description text
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.credits
  set balance = balance - p_amount,
      updated_at = now()
  where user_id = p_user_id
    and balance >= p_amount;

  if not found then
    raise exception 'Insufficient credits';
  end if;

  insert into public.credit_transactions (user_id, amount, description)
  values (p_user_id, -p_amount, p_description);
end;
$$;

-- Add credits atomically and record transaction
create or replace function public.add_credits(
  p_user_id          uuid,
  p_amount           integer,
  p_description      text,
  p_stripe_payment_id text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.credits
  set balance = balance + p_amount,
      updated_at = now()
  where user_id = p_user_id;

  if not found then
    insert into public.credits (user_id, balance)
    values (p_user_id, p_amount);
  end if;

  insert into public.credit_transactions
    (user_id, amount, description, stripe_payment_id)
  values
    (p_user_id, p_amount, p_description, p_stripe_payment_id);
end;
$$;

-- ============================================================
-- STORAGE BUCKET (for document uploads)
-- ============================================================
-- Run this separately or via the Supabase dashboard:
-- insert into storage.buckets (id, name, public) values ('documents', 'documents', false);

-- Storage policy: users can only access their own documents
-- create policy "Users can upload their own documents"
--   on storage.objects for insert
--   with check (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);

-- create policy "Users can read their own documents"
--   on storage.objects for select
--   using (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);
