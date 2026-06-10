-- Nolan Sleep: run this once in the Supabase SQL editor (free tier is fine).
-- Creates the shared append-only event table used for multi-caregiver sync.

create table if not exists public.events (
  id uuid primary key,
  family text not null,
  ts timestamptz not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists events_family_ts on public.events (family, ts);

alter table public.events enable row level security;

-- Anyone holding the project URL + anon key may read/insert. That is acceptable
-- for this app (low-sensitivity data, unguessable project URL); the family code
-- separates streams. Do not reuse this project for anything sensitive.
create policy "anon select" on public.events for select using (true);
create policy "anon insert" on public.events for insert with check (true);

-- Enable realtime so other phones see new events instantly.
alter publication supabase_realtime add table public.events;
