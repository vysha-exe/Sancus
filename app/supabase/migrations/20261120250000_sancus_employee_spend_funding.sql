-- Bind issued cards and local spending access to the company wallet that funds them.
-- A provider authorization burns the branch asset as an onchain hold. Settlement keeps
-- that burn; a decline, expiry, cancellation, or reversal mints the hold back.

alter table public.sancus_cards
  add column if not exists company_id uuid references public.sancus_companies(id) on delete restrict,
  add column if not exists funding_wallet_id uuid references public.wallets(id) on delete restrict;

alter table public.sancus_spending_methods
  add column if not exists company_id uuid references public.sancus_companies(id) on delete restrict,
  add column if not exists funding_wallet_id uuid references public.wallets(id) on delete restrict;

alter table public.sancus_card_purchases
  add column if not exists company_id uuid references public.sancus_companies(id) on delete restrict,
  add column if not exists funding_wallet_id uuid references public.wallets(id) on delete restrict,
  add column if not exists funding_status text not null default 'UNFUNDED'
    check (funding_status in ('UNFUNDED', 'HELD', 'SETTLED', 'RELEASED')),
  add column if not exists funding_amount_minor bigint,
  add column if not exists funding_hold_tx_hash text,
  add column if not exists funding_release_tx_hash text;

alter table public.sancus_pix_payments
  add column if not exists funding_wallet_id uuid references public.wallets(id) on delete restrict,
  add column if not exists funding_status text not null default 'UNFUNDED'
    check (funding_status in ('UNFUNDED', 'HELD', 'SETTLED', 'RELEASED')),
  add column if not exists funding_amount_minor bigint,
  add column if not exists funding_hold_tx_hash text,
  add column if not exists funding_release_tx_hash text;

create index if not exists sancus_cards_company_idx on public.sancus_cards(company_id);
create index if not exists sancus_spending_methods_company_idx on public.sancus_spending_methods(company_id);
create index if not exists sancus_card_purchases_company_idx on public.sancus_card_purchases(company_id);

-- Preserve usable demo data where the employee has exactly the matching local membership.
update public.sancus_cards card
set company_id = (
  select member.company_id
  from public.sancus_memberships member
  join public.sancus_companies company on company.id = member.company_id
  where member.user_id::text = card.employee_id
    and member.status = 'ACTIVE'
    and company.base_currency = card.currency
  order by member.created_at
  limit 1
)
where card.company_id is null;

update public.sancus_spending_methods method
set company_id = (
  select member.company_id
  from public.sancus_memberships member
  join public.sancus_companies company on company.id = member.company_id
  where member.user_id::text = method.employee_id
    and member.status = 'ACTIVE'
    and company.base_currency = method.currency
  order by member.created_at
  limit 1
)
where method.company_id is null;

update public.sancus_cards card
set funding_wallet_id = (
  select id from public.wallets
  where company_id = card.company_id and coalesce(type, 'treasury') = 'treasury'
  order by created_at limit 1
)
where card.company_id is not null and card.funding_wallet_id is null;

update public.sancus_spending_methods method
set funding_wallet_id = (
  select id from public.wallets
  where company_id = method.company_id and coalesce(type, 'treasury') = 'treasury'
  order by created_at limit 1
)
where method.company_id is not null and method.funding_wallet_id is null;
