-- Branch treasury transfers. USDC is the settlement asset; mock local tokens
-- represent the locally usable balance at country branches on Arc testnet.

create table if not exists public.sancus_internal_transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  root_company_id uuid not null references public.sancus_companies(id) on delete cascade,
  source_company_id uuid not null references public.sancus_companies(id) on delete cascade,
  destination_company_id uuid not null references public.sancus_companies(id) on delete cascade,
  idempotency_key text not null,
  memo text,

  source_currency text not null,
  destination_currency text not null,
  usdc_amount_minor bigint not null check (usdc_amount_minor > 0),
  source_amount_minor bigint not null check (source_amount_minor > 0),
  destination_amount_minor bigint not null check (destination_amount_minor > 0),
  source_rate text not null,
  destination_rate text not null,

  source_wallet_id text not null,
  source_address text not null,
  destination_wallet_id text not null,
  destination_address text not null,
  source_bank_name text,
  source_bank_label text,
  source_bank_last4 text,

  status text not null default 'QUEUED' check (status in (
    'PENDING_APPROVAL', 'QUEUED', 'SOURCE_RESERVED', 'LOCAL_DEBITED',
    'USDC_PENDING', 'USDC_SETTLED', 'LOCAL_CREDITED', 'COMPLETED',
    'DECLINED', 'EXPIRED', 'FAILED', 'REVERSED'
  )),
  approval_reason text,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  decided_at timestamptz,
  decided_note text,
  failed_stage text,
  failure_reason text,
  burn_tx_hash text,
  circle_transaction_id text,
  usdc_tx_hash text,
  mint_tx_hash text,
  simulated boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint sancus_internal_transfer_distinct_nodes check (source_company_id <> destination_company_id),
  constraint sancus_internal_transfer_idempotency unique (user_id, idempotency_key)
);

create index if not exists sancus_internal_transfers_source_idx
  on public.sancus_internal_transfers (source_company_id, created_at desc);
create index if not exists sancus_internal_transfers_destination_idx
  on public.sancus_internal_transfers (destination_company_id, created_at desc);
create index if not exists sancus_internal_transfers_root_idx
  on public.sancus_internal_transfers (root_company_id, created_at desc);

alter table public.sancus_internal_transfers enable row level security;

create policy "Members can view internal transfers"
  on public.sancus_internal_transfers for select
  using (
    public.sancus_can_access_company(auth.uid(), source_company_id)
    and public.sancus_can_access_company(auth.uid(), destination_company_id)
  );

create policy "Finance members can create internal transfers"
  on public.sancus_internal_transfers for insert
  with check (
    auth.uid() = user_id
    and public.sancus_effective_role(auth.uid(), source_company_id) in ('OWNER', 'ADMIN', 'FINANCE')
    and public.sancus_can_access_company(auth.uid(), destination_company_id)
  );

create policy "Managers can update internal transfers"
  on public.sancus_internal_transfers for update
  using (
    auth.uid() = user_id
    or public.sancus_effective_role(auth.uid(), source_company_id) in ('OWNER', 'ADMIN')
  );

grant select, insert, update on public.sancus_internal_transfers to authenticated;
grant all on public.sancus_internal_transfers to service_role;

create trigger handle_sancus_internal_transfers_updated_at
  before update on public.sancus_internal_transfers
  for each row execute function public.handle_updated_at();

alter publication supabase_realtime add table public.sancus_internal_transfers;
