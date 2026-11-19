-- Persist Arc settlement hashes for local-rail payouts (Process activity log).

alter table public.sancus_xendit_payouts
  add column if not exists tx_hash text,
  add column if not exists source_address text,
  add column if not exists settlement_address text;

alter table public.sancus_pix_payments
  add column if not exists tx_hash text,
  add column if not exists source_address text,
  add column if not exists settlement_address text;
