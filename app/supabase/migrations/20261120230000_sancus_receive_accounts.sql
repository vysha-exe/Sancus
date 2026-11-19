-- Permanent bank-transfer instructions for every treasury/branch receive identity.
-- The seeded rows are clearly marked as sandbox data. A banking provider can later
-- replace them with real virtual-account details without changing the UI contract.

create table if not exists public.sancus_receive_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.sancus_companies(id) on delete cascade,
  bank_name text not null,
  account_name text not null,
  account_number text not null,
  account_type text not null default 'Operating account',
  routing_label text not null,
  routing_value text not null,
  currency text not null,
  provider text not null default 'Sancus sandbox',
  simulated boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sancus_receive_accounts enable row level security;

create policy "Members can view receive accounts"
  on public.sancus_receive_accounts for select
  using (public.sancus_can_access_company(auth.uid(), company_id));

grant select on public.sancus_receive_accounts to authenticated;
grant all on public.sancus_receive_accounts to service_role;

create trigger handle_sancus_receive_accounts_updated_at
  before update on public.sancus_receive_accounts
  for each row execute function public.handle_updated_at();

create or replace function public.sancus_seed_receive_account(p_company public.sancus_companies)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_bank text;
  v_routing_label text;
  v_routing_value text;
  v_account_number text;
begin
  v_bank := case p_company.country
    when 'SG' then 'DBS Bank' when 'ID' then 'Bank Central Asia'
    when 'TH' then 'Kasikornbank' when 'BR' then 'Itaú Unibanco'
    when 'US' then 'JPMorgan Chase' when 'GB' then 'Barclays'
    when 'AU' then 'Commonwealth Bank' when 'MY' then 'Maybank'
    when 'PH' then 'BDO Unibank' when 'VN' then 'Vietcombank'
    when 'HK' then 'HSBC Hong Kong' when 'JP' then 'MUFG Bank'
    when 'KR' then 'KB Kookmin Bank' when 'TW' then 'CTBC Bank'
    when 'CN' then 'Bank of China' when 'IN' then 'HDFC Bank'
    else 'Local operating bank' end;
  v_routing_label := case p_company.country
    when 'SG' then 'Bank / branch code' when 'ID' then 'Bank code'
    when 'TH' then 'Bank code' when 'BR' then 'ISPB'
    when 'US' then 'Routing number' when 'GB' then 'Sort code'
    when 'AU' then 'BSB' when 'MY' then 'Bank code'
    when 'PH' then 'SWIFT / BIC' when 'VN' then 'SWIFT / BIC'
    when 'HK' then 'Clearing code' when 'JP' then 'Bank / branch code'
    when 'KR' then 'Bank code' when 'TW' then 'Bank code'
    when 'CN' then 'CNAPS code' when 'IN' then 'IFSC'
    else 'SWIFT / BIC' end;
  v_routing_value := case p_company.country
    when 'SG' then '7171-001' when 'ID' then '014' when 'TH' then '004'
    when 'BR' then '60701190' when 'US' then '021000021'
    when 'GB' then '20-00-00' when 'AU' then '062-000'
    when 'MY' then 'MBBEMYKL' when 'PH' then 'BNORPHMM'
    when 'VN' then 'BFTVVNVX' when 'HK' then '004'
    when 'JP' then '0005-001' when 'KR' then '004' when 'TW' then '822'
    when 'CN' then '104100000004' when 'IN' then 'HDFC0000001'
    else 'SANCUS00' end;
  v_account_number := substr(translate(replace(p_company.id::text, '-', ''), 'abcdef', '123456'), 1, 12);

  insert into public.sancus_receive_accounts (
    company_id, bank_name, account_name, account_number, routing_label,
    routing_value, currency, provider, simulated
  ) values (
    p_company.id, v_bank, p_company.name, v_account_number, v_routing_label,
    v_routing_value, p_company.base_currency, 'Sancus sandbox', true
  ) on conflict (company_id) do nothing;
end $$;

do $$ declare v_company public.sancus_companies; begin
  for v_company in select * from public.sancus_companies loop
    perform public.sancus_seed_receive_account(v_company);
  end loop;
end $$;

create or replace function public.sancus_companies_ensure_receive_account()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.sancus_seed_receive_account(new);
  return new;
end $$;

create trigger sancus_companies_ensure_receive_account
  after insert on public.sancus_companies
  for each row execute function public.sancus_companies_ensure_receive_account();

-- Every organization gets one permanent public identity. Local QR rails remain
-- native; other currencies use the organization's Arc USDC receive identity.
insert into public.sancus_receive_links (company_id, rail, owner_user_id)
select
  company.id,
  case company.base_currency
    when 'IDR' then 'QRIS' when 'THB' then 'PROMPTPAY' when 'BRL' then 'PIX'
    else 'USDC' end,
  coalesce(
    company.created_by,
    (select membership.user_id from public.sancus_memberships membership
      where membership.company_id = company.root_id and membership.status = 'ACTIVE'
      order by case membership.role when 'OWNER' then 0 when 'ADMIN' then 1 else 2 end, membership.created_at
      limit 1)
  )
from public.sancus_companies company
where coalesce(
  company.created_by,
  (select membership.user_id from public.sancus_memberships membership
    where membership.company_id = company.root_id and membership.status = 'ACTIVE'
    order by case membership.role when 'OWNER' then 0 when 'ADMIN' then 1 else 2 end, membership.created_at
    limit 1)
) is not null
on conflict (company_id, rail) do nothing;

create or replace function public.sancus_ensure_receive_link()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_rail text;
begin
  v_rail := case new.base_currency
    when 'IDR' then 'QRIS' when 'THB' then 'PROMPTPAY' when 'BRL' then 'PIX'
    else 'USDC' end;
  if new.created_by is not null then
    insert into public.sancus_receive_links (company_id, rail, owner_user_id)
    values (new.id, v_rail, new.created_by)
    on conflict (company_id, rail) do update set active = true;
  end if;
  return new;
end $$;
