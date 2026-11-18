-- Xendit test-mode outbound payouts for local Asian rails.
-- The integration deliberately accepts development keys only. Raw beneficiary
-- account numbers are sent to Xendit but never persisted by Sancus.

create table if not exists public.sancus_xendit_payouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  purpose text not null default 'EMPLOYEE_SPEND'
    check (purpose in ('EMPLOYEE_SPEND', 'SUPPLIER_PAYMENT')),
  employee_name text,
  country text not null check (country in ('TH', 'ID', 'PH')),
  rail text not null check (rail in ('PROMPTPAY', 'BI_FAST', 'INSTAPAY', 'PESONET')),
  currency text not null check (currency in ('THB', 'IDR', 'PHP')),
  recipient_name text not null,
  account_number_masked text not null,
  routing_type text not null,
  routing_value text not null,
  amount_minor bigint not null check (amount_minor > 0),
  description text,
  provider text not null default 'XENDIT' check (provider = 'XENDIT'),
  provider_transaction_id text not null,
  provider_status text not null,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'COMPLIANCE_REVIEW', 'SETTLED', 'FAILED', 'REVERSED', 'CANCELLED')),
  failure_reason text,
  provider_payload jsonb not null default '{}'::jsonb,
  simulated boolean not null default true,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sancus_xendit_payouts_idempotency unique (user_id, idempotency_key),
  constraint sancus_xendit_payouts_provider_id unique (provider_transaction_id)
);

create index if not exists sancus_xendit_payouts_user_created_idx
  on public.sancus_xendit_payouts (user_id, created_at desc);

alter table public.sancus_xendit_payouts enable row level security;

create policy "Users can view their own Xendit payouts"
  on public.sancus_xendit_payouts for select using (auth.uid() = user_id);
create policy "Users can create their own Xendit payouts"
  on public.sancus_xendit_payouts for insert with check (auth.uid() = user_id);
create policy "Users can update their own Xendit payouts"
  on public.sancus_xendit_payouts for update using (auth.uid() = user_id);

grant select, insert, update on public.sancus_xendit_payouts to authenticated;
grant all on public.sancus_xendit_payouts to service_role;

create trigger handle_sancus_xendit_payouts_updated_at
  before update on public.sancus_xendit_payouts
  for each row execute function public.handle_updated_at();

alter publication supabase_realtime add table public.sancus_xendit_payouts;
