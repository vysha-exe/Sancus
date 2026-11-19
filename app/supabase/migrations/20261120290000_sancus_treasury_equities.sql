create table if not exists public.sancus_treasury_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  company_id uuid not null references public.sancus_companies(id) on delete restrict,
  wallet_id text not null,
  idempotency_key text not null,
  action text not null check (action in ('BUY', 'SELL')),
  symbol text not null check (symbol in ('NVDA', 'GOOGL')),
  usdc_amount_minor bigint not null check (usdc_amount_minor > 0),
  share_amount_atomic numeric(78,0) not null check (share_amount_atomic > 0),
  status text not null default 'PENDING' check (status in ('PENDING', 'CONFIRMED', 'FAILED')),
  approval_tx_hash text,
  trade_tx_hash text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, idempotency_key)
);

alter table public.sancus_treasury_allocations enable row level security;
create policy "Root admins can view treasury allocations" on public.sancus_treasury_allocations for select
  using (
    public.sancus_effective_role(auth.uid(), company_id) in ('OWNER', 'ADMIN')
    and exists (select 1 from public.sancus_companies c where c.id = company_id and c.parent_id is null)
  );
create policy "Root admins can create treasury allocations" on public.sancus_treasury_allocations for insert
  with check (
    user_id = auth.uid()
    and public.sancus_effective_role(auth.uid(), company_id) in ('OWNER', 'ADMIN')
    and exists (select 1 from public.sancus_companies c where c.id = company_id and c.parent_id is null)
  );
create policy "Root admins can update treasury allocations" on public.sancus_treasury_allocations for update
  using (
    public.sancus_effective_role(auth.uid(), company_id) in ('OWNER', 'ADMIN')
    and exists (select 1 from public.sancus_companies c where c.id = company_id and c.parent_id is null)
  );
grant select, insert, update on public.sancus_treasury_allocations to authenticated;
grant all on public.sancus_treasury_allocations to service_role;
create trigger handle_sancus_treasury_allocations_updated_at before update on public.sancus_treasury_allocations
  for each row execute function public.handle_updated_at();
