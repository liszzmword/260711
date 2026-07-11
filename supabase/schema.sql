-- Run this once in the Supabase SQL Editor (Project > SQL Editor > New query).

create extension if not exists pgcrypto;

create table if not exists public.saju_submissions (
  id uuid primary key default gen_random_uuid(),
  birth_date date not null,
  birth_time time,
  calendar_type text not null check (calendar_type in ('solar', 'lunar')),
  gender text check (gender in ('male', 'female')),
  summary text not null,
  reasoning text,
  main_numbers int[] not null,
  bonus_number int not null,
  created_at timestamptz not null default now()
);

-- RLS is enabled with no policies, so only the service_role key (used from
-- the /api/saju serverless function) can read or write this table.
alter table public.saju_submissions enable row level security;
