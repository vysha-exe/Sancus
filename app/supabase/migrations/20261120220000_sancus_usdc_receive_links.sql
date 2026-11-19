-- Give USD treasury organizations the same permanent receive identity as local-rail branches.
-- Their public page exposes the organization's Arc USDC address rather than creating
-- an amount-bound fiat-provider QR.

alter table public.sancus_receive_links
  drop constraint if exists sancus_receive_links_rail_check;

alter table public.sancus_receive_links
  add constraint sancus_receive_links_rail_check
  check (rail in ('QRIS', 'PROMPTPAY', 'PIX', 'USDC'));

insert into public.sancus_receive_links (company_id, rail, owner_user_id)
select
  company.id,
  'USDC',
  coalesce(
    company.created_by,
    (select membership.user_id
       from public.sancus_memberships membership
      where membership.company_id = company.root_id
        and membership.status = 'ACTIVE'
      order by case membership.role when 'OWNER' then 0 when 'ADMIN' then 1 else 2 end, membership.created_at
      limit 1)
  )
from public.sancus_companies company
where company.base_currency = 'USD'
  and coalesce(
    company.created_by,
    (select membership.user_id
       from public.sancus_memberships membership
      where membership.company_id = company.root_id
        and membership.status = 'ACTIVE'
      order by case membership.role when 'OWNER' then 0 when 'ADMIN' then 1 else 2 end, membership.created_at
      limit 1)
  ) is not null
on conflict (company_id, rail) do nothing;

create or replace function public.sancus_ensure_receive_link()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_rail text;
begin
  v_rail := case new.base_currency
    when 'IDR' then 'QRIS'
    when 'THB' then 'PROMPTPAY'
    when 'BRL' then 'PIX'
    when 'USD' then 'USDC'
    else null
  end;
  if v_rail is not null and new.created_by is not null then
    insert into public.sancus_receive_links (company_id, rail, owner_user_id)
    values (new.id, v_rail, new.created_by)
    on conflict (company_id, rail) do update set active = true;
  end if;
  return new;
end $$;
