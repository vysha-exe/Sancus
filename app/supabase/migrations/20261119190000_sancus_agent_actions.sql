-- Sancus: what the in-app agent did for each person. Two kinds of rows:
--   x402      the agent bought data with a micropayment (cost_minor in USDC, 6 dp)
--   executed  the person confirmed a proposal and the agent ran it (payment, collection, limits)
-- Used for the agent's daily budget and the "Agent activity" list.

create table if not exists public.sancus_agent_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.sancus_companies(id) on delete set null,
  kind text not null check (kind in ('x402', 'executed')),
  summary text not null,
  cost_minor bigint not null default 0 check (cost_minor >= 0),
  reference text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists sancus_agent_actions_user_idx on public.sancus_agent_actions (user_id, created_at desc);

alter table public.sancus_agent_actions enable row level security;
create policy "Users view own agent actions" on public.sancus_agent_actions for select using (auth.uid() = user_id);
create policy "Users add own agent actions" on public.sancus_agent_actions for insert with check (auth.uid() = user_id);
grant select, insert on public.sancus_agent_actions to authenticated;
grant all on public.sancus_agent_actions to service_role;
;
