-- Provider-backed local-rail demos.
-- Collections are inbound merchant charges on QRIS, PromptPay, or Pix.
-- Pix payments are outbound PayZu sandbox withdrawals. Provider settlement is
-- real inside each sandbox; conversion to/from the Arc USDC treasury is not.

create table if not exists public.sancus_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  rail text not null check (rail in ('QRIS', 'PROMPTPAY', 'PIX')),
  provider text not null check (provider in ('MIDTRANS', 'OMISE', 'PAYZU')),
  customer_name text,
  reference text,
  currency text not null check (currency in ('IDR', 'THB', 'BRL')),
  amount_local_minor bigint not null check (amount_local_minor > 0),
  provider_transaction_id text not null,
  provider_status text not null,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'SETTLED', 'FAILED', 'EXPIRED', 'CANCELLED')),
  qr_image_url text,
  qr_payload text,
  simulator_url text,
  failure_reason text,
  provider_payload jsonb not null default '{}'::jsonb,
  simulated boolean not null default true,
  settled_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sancus_collections_idempotency unique (user_id, idempotency_key),
  constraint sancus_collections_provider_id unique (provider, provider_transaction_id)
);

create table if not exists public.sancus_spending_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  employee_id text not null,
  employee_name text not null,
  method_type text not null check (method_type = 'PIX'),
  provider text not null default 'PAYZU' check (provider = 'PAYZU'),
  label text not null,
  currency text not null default 'BRL' check (currency = 'BRL'),
  monthly_limit_minor bigint not null check (monthly_limit_minor > 0),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'PAUSED', 'REVOKED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sancus_pix_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  purpose text not null check (purpose in ('EMPLOYEE_SPEND', 'SUPPLIER_PAYMENT')),
  spending_method_id uuid references public.sancus_spending_methods(id) on delete set null,
  employee_id text,
  employee_name text,
  recipient_name text not null,
  pix_method text not null check (pix_method in ('QR', 'KEY')),
  pix_key_masked text,
  amount_brl_minor bigint not null check (amount_brl_minor > 0),
  provider_transaction_id text not null,
  provider_status text not null,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'SETTLED', 'FAILED', 'EXPIRED', 'CANCELLED')),
  end_to_end_id text,
  failure_reason text,
  provider_payload jsonb not null default '{}'::jsonb,
  simulated boolean not null default true,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sancus_pix_payments_idempotency unique (user_id, idempotency_key),
  constraint sancus_pix_payments_provider_id unique (provider_transaction_id)
);

create index if not exists sancus_collections_user_created_idx on public.sancus_collections (user_id, created_at desc);
create index if not exists sancus_pix_payments_user_created_idx on public.sancus_pix_payments (user_id, created_at desc);
create index if not exists sancus_spending_methods_user_employee_idx on public.sancus_spending_methods (user_id, employee_id);

alter table public.sancus_collections enable row level security;
alter table public.sancus_pix_payments enable row level security;
alter table public.sancus_spending_methods enable row level security;

create policy "Users can view their own collections" on public.sancus_collections for select using (auth.uid() = user_id);
create policy "Users can create their own collections" on public.sancus_collections for insert with check (auth.uid() = user_id);
create policy "Users can update their own collections" on public.sancus_collections for update using (auth.uid() = user_id);
create policy "Users can view their own Pix payments" on public.sancus_pix_payments for select using (auth.uid() = user_id);
create policy "Users can create their own Pix payments" on public.sancus_pix_payments for insert with check (auth.uid() = user_id);
create policy "Users can update their own Pix payments" on public.sancus_pix_payments for update using (auth.uid() = user_id);
create policy "Users can view their own spending methods" on public.sancus_spending_methods for select using (auth.uid() = user_id);
create policy "Users can create their own spending methods" on public.sancus_spending_methods for insert with check (auth.uid() = user_id);
create policy "Users can update their own spending methods" on public.sancus_spending_methods for update using (auth.uid() = user_id);

grant select, insert, update on public.sancus_collections, public.sancus_pix_payments to authenticated;
grant select, insert, update on public.sancus_spending_methods to authenticated;
grant all on public.sancus_collections, public.sancus_pix_payments to service_role;
grant all on public.sancus_spending_methods to service_role;

create trigger handle_sancus_collections_updated_at before update on public.sancus_collections
  for each row execute function public.handle_updated_at();
create trigger handle_sancus_pix_payments_updated_at before update on public.sancus_pix_payments
  for each row execute function public.handle_updated_at();
create trigger handle_sancus_spending_methods_updated_at before update on public.sancus_spending_methods
  for each row execute function public.handle_updated_at();

alter publication supabase_realtime add table public.sancus_collections;
alter publication supabase_realtime add table public.sancus_pix_payments;
alter publication supabase_realtime add table public.sancus_spending_methods;

