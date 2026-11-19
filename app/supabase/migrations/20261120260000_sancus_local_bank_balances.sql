-- Local customer payments settle into the branch's operating bank account.
-- Arc wallets remain a separate, temporary liquidity surface.

alter table public.sancus_receive_accounts
  add column if not exists balance_minor bigint not null default 0
    check (balance_minor >= 0);

alter table public.sancus_rail_collections
  add column if not exists company_id uuid references public.sancus_companies(id) on delete restrict,
  add column if not exists receive_account_id uuid references public.sancus_receive_accounts(id) on delete restrict,
  add column if not exists bank_credited_at timestamptz;

alter table public.sancus_rail_collections
  drop constraint if exists sancus_rail_collections_status_check;
alter table public.sancus_rail_collections
  add constraint sancus_rail_collections_status_check
  check (status in ('PENDING', 'PAID', 'CREDITING', 'CREDITED', 'MINTING', 'MINTED', 'FAILED', 'EXPIRED'));

create index if not exists sancus_rail_collections_company_idx
  on public.sancus_rail_collections(company_id, created_at desc);

create or replace function public.sancus_credit_collection_to_bank(p_collection_id uuid)
returns setof public.sancus_rail_collections
language plpgsql
security definer
set search_path = public
as $$
declare
  v_collection public.sancus_rail_collections;
  v_account_id uuid;
begin
  select * into v_collection
  from public.sancus_rail_collections
  where id = p_collection_id
  for update;

  if not found then raise exception 'Collection not found'; end if;
  if auth.uid() is not null and v_collection.user_id <> auth.uid() then
    raise exception 'Collection is not accessible';
  end if;
  if v_collection.status = 'CREDITED' then
    return query select * from public.sancus_rail_collections where id = p_collection_id;
    return;
  end if;
  if v_collection.status <> 'PAID' then
    raise exception 'Collection is not ready for bank settlement';
  end if;

  v_account_id := v_collection.receive_account_id;
  if v_account_id is null and v_collection.company_id is not null then
    select id into v_account_id from public.sancus_receive_accounts
    where company_id = v_collection.company_id;
  end if;
  if v_account_id is null then raise exception 'Receiving bank account is unavailable'; end if;

  update public.sancus_rail_collections
  set status = 'CREDITING', receive_account_id = v_account_id, error = null
  where id = p_collection_id;

  update public.sancus_receive_accounts
  set balance_minor = balance_minor + v_collection.amount_minor
  where id = v_account_id;

  update public.sancus_rail_collections
  set status = 'CREDITED', bank_credited_at = now(), error = null
  where id = p_collection_id;

  return query select * from public.sancus_rail_collections where id = p_collection_id;
end $$;

grant execute on function public.sancus_credit_collection_to_bank(uuid) to authenticated, service_role;
