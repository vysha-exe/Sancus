-- Reusable merchant Pix QRs for outgoing employee spending tests.
-- Incoming collection QRs intentionally live in their own tables and never appear here.

create table if not exists public.sancus_pix_merchant_qrs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  merchant_name text,
  qr_payload text not null,
  payload_fingerprint text not null,
  qr_code_type text,
  amount_editable boolean not null default false,
  fixed_amount_brl_minor bigint,
  provider_payload jsonb not null default '{}'::jsonb,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ARCHIVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sancus_pix_merchant_qrs_user_payload unique (user_id, payload_fingerprint),
  constraint sancus_pix_merchant_qrs_fixed_amount check (
    amount_editable or (fixed_amount_brl_minor is not null and fixed_amount_brl_minor > 0)
  )
);

create index if not exists sancus_pix_merchant_qrs_user_created_idx
  on public.sancus_pix_merchant_qrs (user_id, created_at desc);

alter table public.sancus_pix_merchant_qrs enable row level security;
create policy "Users can view their merchant Pix QRs"
  on public.sancus_pix_merchant_qrs for select using (auth.uid() = user_id);
create policy "Users can create their merchant Pix QRs"
  on public.sancus_pix_merchant_qrs for insert with check (auth.uid() = user_id);
create policy "Users can update their merchant Pix QRs"
  on public.sancus_pix_merchant_qrs for update using (auth.uid() = user_id);
grant select, insert, update on public.sancus_pix_merchant_qrs to authenticated;
grant all on public.sancus_pix_merchant_qrs to service_role;

create trigger handle_sancus_pix_merchant_qrs_updated_at
  before update on public.sancus_pix_merchant_qrs
  for each row execute function public.handle_updated_at();
