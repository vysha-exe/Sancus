-- Sancus: Singapore payouts (USDC treasury -> SGD via PayNow / FAST).
-- Amounts are stored as integer minor units: SGD cents and USDC micro-units.

create table if not exists public.sancus_payouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,

  -- recipient
  recipient_name text not null,
  proxy_type text not null check (proxy_type in ('MOBILE', 'UEN', 'BANK')),
  proxy_value text not null,
  bank_code text,
  rail text not null check (rail in ('PAYNOW', 'FAST')),
  reference text,

  -- amounts and quote
  sgd_amount_minor bigint not null check (sgd_amount_minor > 0),
  fee_sgd_minor bigint not null default 0,
  usdc_amount_minor bigint not null check (usdc_amount_minor > 0),
  mid_rate text not null,
  client_rate text not null,
  spread_bps integer not null default 0,

  -- treasury leg (USDC leaving the Circle wallet on Arc)
  source_wallet_id text,
  source_address text,
  blockchain text,
  settlement_address text,
  circle_transaction_id text,
  tx_hash text,

  -- partner leg (SGD payout)
  provider text not null,
  provider_ref text,
  status text not null default 'CREATED'
    check (status in ('CREATED', 'FUNDS_SENT', 'CONVERTING', 'PAYING_OUT', 'COMPLETED', 'FAILED')),
  simulated boolean not null default true,
  failure_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint sancus_payouts_idempotency unique (user_id, idempotency_key)
);

create index if not exists sancus_payouts_user_created_idx
  on public.sancus_payouts (user_id, created_at desc);

alter table public.sancus_payouts enable row level security;

create policy "Users can view their own payouts"
  on public.sancus_payouts for select using (auth.uid() = user_id);
create policy "Users can create their own payouts"
  on public.sancus_payouts for insert with check (auth.uid() = user_id);
create policy "Users can update their own payouts"
  on public.sancus_payouts for update using (auth.uid() = user_id);

grant select, insert, update on public.sancus_payouts to authenticated;
grant all on public.sancus_payouts to service_role;

-- handle_updated_at() is created by the upstream transactions migration.
create trigger handle_sancus_payouts_updated_at
  before update on public.sancus_payouts
  for each row execute function public.handle_updated_at();

alter publication supabase_realtime add table public.sancus_payouts;
