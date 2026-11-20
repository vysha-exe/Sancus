-- Sancus QR payments: one Sancus account pays another by scanning their "pay me" QR.
-- USDC moves onchain on Arc from the payer's treasury to the receiver's treasury.
-- Both sides can read the row; only the server (service role) writes it.

create table if not exists public.sancus_qr_payments (
  id uuid primary key default gen_random_uuid(),
  payer_user_id uuid not null references auth.users(id) on delete cascade,
  payer_company_id uuid references public.sancus_companies(id) on delete set null,
  payer_name text not null,
  receiver_user_id uuid not null references auth.users(id) on delete cascade,
  receiver_company_id uuid references public.sancus_companies(id) on delete set null,
  receiver_name text not null,
  idempotency_key text not null,
  currency text not null check (currency in ('USD', 'THB', 'IDR', 'BRL')),
  amount_minor bigint not null check (amount_minor > 0),
  usdc_amount_minor bigint not null check (usdc_amount_minor > 0),
  rate text,
  note text,
  token text not null default 'USDC',
  source_address text,
  destination_address text,
  tx_hash text,
  status text not null default 'PENDING' check (status in ('PENDING', 'COMPLETED', 'FAILED')),
  failure_reason text,
  created_at timestamptz not null default now(),
  unique (payer_user_id, idempotency_key)
);

create index if not exists sancus_qr_payments_payer_idx on public.sancus_qr_payments (payer_user_id, created_at desc);
create index if not exists sancus_qr_payments_receiver_idx on public.sancus_qr_payments (receiver_user_id, created_at desc);

alter table public.sancus_qr_payments enable row level security;

drop policy if exists "QR payments are visible to both sides" on public.sancus_qr_payments;
create policy "QR payments are visible to both sides"
  on public.sancus_qr_payments for select
  using (auth.uid() = payer_user_id or auth.uid() = receiver_user_id);
