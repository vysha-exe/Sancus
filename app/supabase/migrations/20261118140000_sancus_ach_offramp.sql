-- Sancus: US ACH off-ramp (mock, Bridge-shaped). Recipients, payments and provider events.
-- Full account numbers are never stored: last 4 for display + a salted fingerprint for de-dupe.

create table if not exists public.sancus_ach_recipients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  routing_number text not null check (routing_number ~ '^\d{9}$'),
  bank_name text not null,
  account_last4 text not null check (account_last4 ~ '^\d{4}$'),
  account_type text not null check (account_type in ('CHECKING', 'SAVINGS')),
  owner_type text not null default 'BUSINESS' check (owner_type in ('INDIVIDUAL', 'BUSINESS')),
  fingerprint text not null,
  address jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sancus_ach_recipients_once unique (user_id, fingerprint)
);

create table if not exists public.sancus_ach_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references public.sancus_ach_recipients(id),
  idempotency_key text not null,
  recipient_name text not null,
  routing_number text not null,
  bank_name text not null,
  account_last4 text not null,
  account_type text not null,
  speed text not null check (speed in ('STANDARD', 'SAME_DAY')),
  usd_amount_minor bigint not null check (usd_amount_minor > 0),      -- USD cents the recipient gets
  fee_usd_minor bigint not null check (fee_usd_minor >= 0),
  usdc_amount_minor bigint not null check (usdc_amount_minor > 0),    -- USDC (6 dp) debited
  reference text,
  settlement_mode text not null check (settlement_mode in ('MOCK_ONLY', 'TESTNET_SETTLEMENT')),
  demo_mode text not null check (demo_mode in ('accelerated', 'realistic')),
  funded_onchain boolean not null default false,
  source_address text,
  settlement_address text,
  circle_transaction_id text,
  tx_hash text,
  provider text not null,
  provider_ref text not null unique,
  status text not null check (status in (
    'PENDING_APPROVAL', 'CREATED', 'FUNDS_RECEIVED', 'PAYMENT_SUBMITTED', 'PAYMENT_PROCESSED',
    'FAILED', 'RETURNED', 'REJECTED')),
  return_code text,
  failure_reason text,
  approval_reason text,
  approved_at timestamptz,
  approved_by uuid,
  decided_at timestamptz,
  decided_note text,
  submitted_at timestamptz,
  processed_at timestamptz,
  returned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sancus_ach_payments_idem unique (user_id, idempotency_key)
);
create index if not exists sancus_ach_payments_user_idx on public.sancus_ach_payments (user_id, created_at desc);

-- Provider webhook events, recorded once each (replays are no-ops). Written by the service role.
create table if not exists public.sancus_ach_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  payment_id uuid references public.sancus_ach_payments(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  event_type text not null,
  state text,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

alter table public.sancus_ach_recipients enable row level security;
alter table public.sancus_ach_payments enable row level security;
alter table public.sancus_ach_events enable row level security;

create policy "Users view own ACH recipients" on public.sancus_ach_recipients for select using (auth.uid() = user_id);
create policy "Users add own ACH recipients" on public.sancus_ach_recipients for insert with check (auth.uid() = user_id);
create policy "Users view own ACH payments" on public.sancus_ach_payments for select using (auth.uid() = user_id);
create policy "Users create own ACH payments" on public.sancus_ach_payments for insert with check (auth.uid() = user_id);
create policy "Users update own ACH payments" on public.sancus_ach_payments for update using (auth.uid() = user_id);
create policy "Users view own ACH events" on public.sancus_ach_events for select using (auth.uid() = user_id);

grant select, insert on public.sancus_ach_recipients to authenticated;
grant select, insert, update on public.sancus_ach_payments to authenticated;
grant select on public.sancus_ach_events to authenticated;
grant all on public.sancus_ach_recipients, public.sancus_ach_payments, public.sancus_ach_events to service_role;

create trigger handle_sancus_ach_recipients_updated_at before update on public.sancus_ach_recipients
  for each row execute function public.handle_updated_at();
create trigger handle_sancus_ach_payments_updated_at before update on public.sancus_ach_payments
  for each row execute function public.handle_updated_at();
