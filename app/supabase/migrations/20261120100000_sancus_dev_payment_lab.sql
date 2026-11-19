-- Provider-backed Dev Payment Lab audit trail and card-provider metadata.

alter table public.sancus_card_purchases
  add column if not exists provider text,
  add column if not exists provider_transaction_id text,
  add column if not exists provider_status text,
  add column if not exists provider_payload jsonb not null default '{}'::jsonb,
  add column if not exists simulated boolean not null default false;

create unique index if not exists sancus_card_purchases_provider_tx_idx
  on public.sancus_card_purchases (provider, provider_transaction_id)
  where provider_transaction_id is not null;

create table if not exists public.sancus_dev_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.sancus_companies(id) on delete set null,
  run_type text not null check (run_type in ('CARD_SPEND', 'PIX_SPEND', 'QRIS_RECEIVE', 'PROMPTPAY_RECEIVE', 'PIX_RECEIVE')),
  provider text not null,
  environment text not null default 'SANDBOX' check (environment = 'SANDBOX'),
  status text not null default 'RUNNING' check (status in ('RUNNING', 'WAITING', 'PASSED', 'FAILED')),
  source_record_type text,
  source_record_id uuid,
  provider_ref text,
  steps jsonb not null default '[]'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists sancus_dev_runs_user_created_idx
  on public.sancus_dev_runs (user_id, created_at desc);

alter table public.sancus_dev_runs enable row level security;
create policy "Users can view their own dev runs"
  on public.sancus_dev_runs for select using (auth.uid() = user_id);
create policy "Users can create their own dev runs"
  on public.sancus_dev_runs for insert with check (auth.uid() = user_id);
create policy "Users can update their own dev runs"
  on public.sancus_dev_runs for update using (auth.uid() = user_id);
grant select, insert, update on public.sancus_dev_runs to authenticated;
grant all on public.sancus_dev_runs to service_role;

create trigger handle_sancus_dev_runs_updated_at before update on public.sancus_dev_runs
  for each row execute function public.handle_updated_at();
