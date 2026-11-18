-- Virtual cards issued through the Marqeta sandbox. Provider tokens are kept server-side;
-- clients receive only the last four digits and normalized card state.

create table if not exists public.sancus_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  employee_id text not null,
  employee_name text not null,
  label text not null,
  country text not null,
  currency text not null,
  monthly_limit_minor bigint not null check (monthly_limit_minor > 0),
  provider text not null default 'MARQETA' check (provider = 'MARQETA'),
  provider_user_token text not null,
  provider_card_token text not null,
  velocity_control_token text not null,
  last_four text not null check (last_four ~ '^[0-9]{4}$'),
  provider_status text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'SUSPENDED', 'TERMINATED')),
  simulated boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sancus_cards_idempotency unique (user_id, idempotency_key),
  constraint sancus_cards_provider_token unique (provider_card_token)
);

create index if not exists sancus_cards_user_created_idx on public.sancus_cards (user_id, created_at desc);
create index if not exists sancus_cards_user_employee_idx on public.sancus_cards (user_id, employee_id);

alter table public.sancus_cards enable row level security;
create policy "Users can view their own cards" on public.sancus_cards for select using (auth.uid() = user_id);
create policy "Users can create their own cards" on public.sancus_cards for insert with check (auth.uid() = user_id);
create policy "Users can update their own cards" on public.sancus_cards for update using (auth.uid() = user_id);
grant select, insert, update on public.sancus_cards to authenticated;
grant all on public.sancus_cards to service_role;

create trigger handle_sancus_cards_updated_at before update on public.sancus_cards
  for each row execute function public.handle_updated_at();
