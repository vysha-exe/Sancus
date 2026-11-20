-- fUSDC moves money in two Arc transactions: burn from the payer, then mint to the receiver.
-- tx_hash already holds the burn; mint_tx_hash keeps the receiver's leg so the Process log can show both.

alter table public.sancus_xendit_payouts add column if not exists mint_tx_hash text;
alter table public.sancus_pix_payments add column if not exists mint_tx_hash text;
alter table public.sancus_ach_payments add column if not exists mint_tx_hash text;
alter table public.sancus_qr_payments add column if not exists mint_tx_hash text;
