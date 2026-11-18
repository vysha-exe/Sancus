-- Sancus: each account has at most one Treasury and one Settlement wallet per chain.
-- Treasury wallets are created automatically at sign-up / first visit; this stops
-- two simultaneous requests (e.g. two tabs) from creating duplicates.
create unique index if not exists wallets_one_role_per_account_chain
  on public.wallets (user_id, blockchain, type)
  where type in ('treasury', 'payout');
