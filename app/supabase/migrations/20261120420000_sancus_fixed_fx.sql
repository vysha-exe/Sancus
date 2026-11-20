-- Persist each on-chain stage of a fixed-rate branch FX transfer so retries do not
-- remint source tokens or repeat an already-confirmed conversion.

alter table public.sancus_internal_transfers
  add column if not exists source_token_mint_tx_hash text,
  add column if not exists fx_tx_hash text,
  add column if not exists fx_rate_version bigint,
  add column if not exists destination_token_burn_tx_hash text;

comment on column public.sancus_internal_transfers.source_token_mint_tx_hash is
  'Arc testnet mint that represents the captured source-bank debit during transport.';
comment on column public.sancus_internal_transfers.fx_tx_hash is
  'SancusFixedFx burn/mint transaction hash on Arc testnet.';
comment on column public.sancus_internal_transfers.destination_token_burn_tx_hash is
  'Arc testnet redemption burn before the destination bank account is credited.';
