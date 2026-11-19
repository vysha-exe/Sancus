-- Branch operating cash is bank-first. Arc wallets remain a separate liquidity
-- surface used only by explicit on-chain/cross-border flows.

create table if not exists public.sancus_bank_entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.sancus_receive_accounts(id) on delete restrict,
  company_id uuid not null references public.sancus_companies(id) on delete restrict,
  direction text not null check (direction in ('CREDIT', 'DEBIT')),
  amount_minor bigint not null check (amount_minor > 0),
  balance_after_minor bigint not null check (balance_after_minor >= 0),
  currency text not null,
  entry_type text not null,
  source_type text,
  source_id text,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (account_id, idempotency_key)
);

create table if not exists public.sancus_bank_holds (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.sancus_receive_accounts(id) on delete restrict,
  company_id uuid not null references public.sancus_companies(id) on delete restrict,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null,
  reference text not null unique,
  source_type text,
  source_id text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'CAPTURED', 'RELEASED')),
  captured_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sancus_bank_entries_company_created_idx
  on public.sancus_bank_entries(company_id, created_at desc);
create index if not exists sancus_bank_holds_account_status_idx
  on public.sancus_bank_holds(account_id, status);

alter table public.sancus_bank_entries enable row level security;
alter table public.sancus_bank_holds enable row level security;

create policy "Members can view bank entries" on public.sancus_bank_entries for select
  using (public.sancus_can_access_company(auth.uid(), company_id));
create policy "Members can view bank holds" on public.sancus_bank_holds for select
  using (public.sancus_can_access_company(auth.uid(), company_id));

grant select on public.sancus_bank_entries, public.sancus_bank_holds to authenticated;
grant all on public.sancus_bank_entries, public.sancus_bank_holds to service_role;

create trigger handle_sancus_bank_holds_updated_at
  before update on public.sancus_bank_holds
  for each row execute function public.handle_updated_at();

-- Keep the old wallet links readable while existing records are migrated, but
-- make the branch operating account the authoritative funding relationship.
alter table public.sancus_cards
  add column if not exists funding_account_id uuid references public.sancus_receive_accounts(id) on delete restrict;
alter table public.sancus_spending_methods
  add column if not exists funding_account_id uuid references public.sancus_receive_accounts(id) on delete restrict;
alter table public.sancus_card_purchases
  add column if not exists funding_account_id uuid references public.sancus_receive_accounts(id) on delete restrict;
alter table public.sancus_pix_payments
  add column if not exists funding_account_id uuid references public.sancus_receive_accounts(id) on delete restrict;
alter table public.sancus_payouts
  add column if not exists source_bank_account_id uuid references public.sancus_receive_accounts(id) on delete restrict,
  add column if not exists funding_status text not null default 'UNFUNDED'
    check (funding_status in ('UNFUNDED', 'HELD', 'SETTLED', 'RELEASED')),
  add column if not exists funding_amount_minor bigint,
  add column if not exists funding_hold_reference text;
alter table public.sancus_internal_transfers
  add column if not exists source_bank_account_id uuid references public.sancus_receive_accounts(id) on delete restrict,
  add column if not exists destination_bank_account_id uuid references public.sancus_receive_accounts(id) on delete restrict,
  add column if not exists source_bank_hold_reference text;

update public.sancus_cards card
set funding_account_id = account.id
from public.sancus_receive_accounts account
where account.company_id = card.company_id and card.funding_account_id is null;

update public.sancus_spending_methods method
set funding_account_id = account.id
from public.sancus_receive_accounts account
where account.company_id = method.company_id and method.funding_account_id is null;

update public.sancus_card_purchases purchase
set funding_account_id = account.id
from public.sancus_receive_accounts account
where account.company_id = purchase.company_id and purchase.funding_account_id is null;

update public.sancus_pix_payments payment
set funding_account_id = account.id
from public.sancus_receive_accounts account
where account.company_id = payment.company_id and payment.funding_account_id is null;

-- Record any balance that predates the ledger as one opening entry.
insert into public.sancus_bank_entries (
  account_id, company_id, direction, amount_minor, balance_after_minor, currency,
  entry_type, source_type, source_id, idempotency_key
)
select account.id, account.company_id, 'CREDIT', account.balance_minor,
       account.balance_minor, account.currency, 'OPENING_BALANCE',
       'MIGRATION', account.id::text, 'opening-balance-v1'
from public.sancus_receive_accounts account
where account.balance_minor > 0
on conflict (account_id, idempotency_key) do nothing;

create or replace function public.sancus_bank_assert_access(p_company_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.sancus_can_access_company(auth.uid(), p_company_id) then
    raise exception 'Bank account is not accessible';
  end if;
end $$;
create or replace function public.sancus_bank_post_credit(
  p_account_id uuid,
  p_amount_minor bigint,
  p_entry_type text,
  p_source_type text,
  p_source_id text,
  p_idempotency_key text
) returns public.sancus_bank_entries
language plpgsql security definer set search_path = public as $$
declare
  v_account public.sancus_receive_accounts;
  v_entry public.sancus_bank_entries;
begin
  if p_amount_minor <= 0 then raise exception 'Credit amount must be positive'; end if;
  select * into v_entry from public.sancus_bank_entries
    where account_id = p_account_id and idempotency_key = p_idempotency_key;
  if found then return v_entry; end if;

  select * into v_account from public.sancus_receive_accounts where id = p_account_id for update;
  if not found then raise exception 'Bank account not found'; end if;
  perform public.sancus_bank_assert_access(v_account.company_id);

  update public.sancus_receive_accounts
    set balance_minor = balance_minor + p_amount_minor
    where id = p_account_id returning * into v_account;

  insert into public.sancus_bank_entries (
    account_id, company_id, direction, amount_minor, balance_after_minor, currency,
    entry_type, source_type, source_id, idempotency_key
  ) values (
    v_account.id, v_account.company_id, 'CREDIT', p_amount_minor,
    v_account.balance_minor, v_account.currency, p_entry_type,
    p_source_type, p_source_id, p_idempotency_key
  ) returning * into v_entry;
  return v_entry;
end $$;

create or replace function public.sancus_bank_create_hold(
  p_account_id uuid,
  p_amount_minor bigint,
  p_reference text,
  p_source_type text,
  p_source_id text
) returns public.sancus_bank_holds
language plpgsql security definer set search_path = public as $$
declare
  v_account public.sancus_receive_accounts;
  v_hold public.sancus_bank_holds;
  v_held bigint;
begin
  if p_amount_minor <= 0 then raise exception 'Hold amount must be positive'; end if;
  select * into v_hold from public.sancus_bank_holds where reference = p_reference;
  if found then return v_hold; end if;

  select * into v_account from public.sancus_receive_accounts where id = p_account_id for update;
  if not found then raise exception 'Bank account not found'; end if;
  perform public.sancus_bank_assert_access(v_account.company_id);
  select coalesce(sum(amount_minor), 0) into v_held from public.sancus_bank_holds
    where account_id = p_account_id and status = 'ACTIVE';
  if v_account.balance_minor - v_held < p_amount_minor then
    raise exception 'Insufficient available bank balance';
  end if;

  insert into public.sancus_bank_holds (
    account_id, company_id, amount_minor, currency, reference, source_type, source_id
  ) values (
    v_account.id, v_account.company_id, p_amount_minor, v_account.currency,
    p_reference, p_source_type, p_source_id
  ) returning * into v_hold;
  return v_hold;
end $$;

create or replace function public.sancus_bank_capture_hold(p_reference text)
returns public.sancus_bank_holds
language plpgsql security definer set search_path = public as $$
declare
  v_hold public.sancus_bank_holds;
  v_account public.sancus_receive_accounts;
begin
  select * into v_hold from public.sancus_bank_holds where reference = p_reference for update;
  if not found then raise exception 'Bank hold not found'; end if;
  perform public.sancus_bank_assert_access(v_hold.company_id);
  if v_hold.status = 'CAPTURED' then return v_hold; end if;
  if v_hold.status <> 'ACTIVE' then raise exception 'Released bank hold cannot be captured'; end if;

  select * into v_account from public.sancus_receive_accounts where id = v_hold.account_id for update;
  if v_account.balance_minor < v_hold.amount_minor then raise exception 'Insufficient posted bank balance'; end if;
  update public.sancus_receive_accounts
    set balance_minor = balance_minor - v_hold.amount_minor
    where id = v_hold.account_id returning * into v_account;
  insert into public.sancus_bank_entries (
    account_id, company_id, direction, amount_minor, balance_after_minor, currency,
    entry_type, source_type, source_id, idempotency_key
  ) values (
    v_hold.account_id, v_hold.company_id, 'DEBIT', v_hold.amount_minor,
    v_account.balance_minor, v_hold.currency, 'HOLD_CAPTURE',
    v_hold.source_type, v_hold.source_id, 'capture:' || v_hold.reference
  ) on conflict (account_id, idempotency_key) do nothing;
  update public.sancus_bank_holds set status = 'CAPTURED', captured_at = now()
    where id = v_hold.id returning * into v_hold;
  return v_hold;
end $$;

create or replace function public.sancus_bank_release_hold(p_reference text)
returns public.sancus_bank_holds
language plpgsql security definer set search_path = public as $$
declare v_hold public.sancus_bank_holds;
begin
  select * into v_hold from public.sancus_bank_holds where reference = p_reference for update;
  if not found then raise exception 'Bank hold not found'; end if;
  perform public.sancus_bank_assert_access(v_hold.company_id);
  if v_hold.status = 'RELEASED' then return v_hold; end if;
  if v_hold.status <> 'ACTIVE' then raise exception 'Captured bank hold cannot be released'; end if;
  update public.sancus_bank_holds set status = 'RELEASED', released_at = now()
    where id = v_hold.id returning * into v_hold;
  return v_hold;
end $$;

grant execute on function public.sancus_bank_post_credit(uuid, bigint, text, text, text, text) to authenticated, service_role;
grant execute on function public.sancus_bank_create_hold(uuid, bigint, text, text, text) to authenticated, service_role;
grant execute on function public.sancus_bank_capture_hold(text) to authenticated, service_role;
grant execute on function public.sancus_bank_release_hold(text) to authenticated, service_role;

-- Main provider-backed local collections now settle into the same operating
-- account as the Dev payment lab. Wallet minting is intentionally absent.
alter table public.sancus_collections
  add column if not exists receive_account_id uuid references public.sancus_receive_accounts(id) on delete restrict,
  add column if not exists bank_credited_at timestamptz;

create or replace function public.sancus_credit_local_collection_to_bank(p_collection_id uuid)
returns public.sancus_collections
language plpgsql security definer set search_path = public as $$
declare
  v_collection public.sancus_collections;
  v_account public.sancus_receive_accounts;
begin
  select * into v_collection from public.sancus_collections where id = p_collection_id for update;
  if not found then raise exception 'Collection not found'; end if;
  if v_collection.status <> 'SETTLED' then return v_collection; end if;
  if v_collection.company_id is null then return v_collection; end if;
  select * into v_account from public.sancus_receive_accounts where company_id = v_collection.company_id;
  if not found then raise exception 'Receiving bank account is unavailable'; end if;
  perform public.sancus_bank_post_credit(
    v_account.id, v_collection.amount_local_minor, 'LOCAL_COLLECTION',
    'COLLECTION', v_collection.id::text, 'collection:' || v_collection.id::text
  );
  update public.sancus_collections set receive_account_id = v_account.id,
    bank_credited_at = coalesce(bank_credited_at, now()) where id = v_collection.id returning * into v_collection;
  return v_collection;
end $$;

create or replace function public.sancus_settled_collection_bank_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'SETTLED' and new.company_id is not null
     and (tg_op = 'INSERT' or old.status is distinct from new.status or old.company_id is distinct from new.company_id) then
    perform public.sancus_credit_local_collection_to_bank(new.id);
  end if;
  return new;
end $$;

drop trigger if exists sancus_settled_collection_bank_trigger on public.sancus_collections;
create trigger sancus_settled_collection_bank_trigger
  after insert or update of status, company_id on public.sancus_collections
  for each row execute function public.sancus_settled_collection_bank_trigger();

do $$ declare v_id uuid; begin
  for v_id in select id from public.sancus_collections where status = 'SETTLED' and company_id is not null loop
    perform public.sancus_credit_local_collection_to_bank(v_id);
  end loop;
end $$;

-- Upgrade the older Dev-lab collection credit so it also writes an immutable
-- bank entry instead of only mutating the account total.
create or replace function public.sancus_credit_collection_to_bank(p_collection_id uuid)
returns setof public.sancus_rail_collections
language plpgsql security definer set search_path = public as $$
declare
  v_collection public.sancus_rail_collections;
  v_account_id uuid;
begin
  select * into v_collection from public.sancus_rail_collections where id = p_collection_id for update;
  if not found then raise exception 'Collection not found'; end if;
  if auth.uid() is not null and v_collection.user_id <> auth.uid() then raise exception 'Collection is not accessible'; end if;
  if v_collection.status = 'CREDITED' then
    return query select * from public.sancus_rail_collections where id = p_collection_id;
    return;
  end if;
  if v_collection.status <> 'PAID' then raise exception 'Collection is not ready for bank settlement'; end if;
  v_account_id := v_collection.receive_account_id;
  if v_account_id is null and v_collection.company_id is not null then
    select id into v_account_id from public.sancus_receive_accounts where company_id = v_collection.company_id;
  end if;
  if v_account_id is null then raise exception 'Receiving bank account is unavailable'; end if;
  update public.sancus_rail_collections set status = 'CREDITING', receive_account_id = v_account_id, error = null where id = p_collection_id;
  perform public.sancus_bank_post_credit(
    v_account_id, v_collection.amount_minor, 'RAIL_COLLECTION',
    'RAIL_COLLECTION', v_collection.id::text, 'rail-collection:' || v_collection.id::text
  );
  update public.sancus_rail_collections set status = 'CREDITED', bank_credited_at = now(), error = null
    where id = p_collection_id;
  return query select * from public.sancus_rail_collections where id = p_collection_id;
end $$;
