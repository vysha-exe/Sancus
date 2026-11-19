-- One permanent, amount-free public receive identity per organization and local rail.
-- Scanning the static QR opens a Sancus page where the payer chooses an amount;
-- the page then creates an amount-bound provider QR in sancus_collections.

create table if not exists public.sancus_receive_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.sancus_companies(id) on delete cascade,
  rail text not null check (rail in ('QRIS', 'PROMPTPAY', 'PIX')),
  public_token uuid not null default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sancus_receive_links_company_rail unique (company_id, rail),
  constraint sancus_receive_links_public_token unique (public_token)
);

create index if not exists sancus_receive_links_owner_idx
  on public.sancus_receive_links (owner_user_id, created_at desc);

alter table public.sancus_receive_links enable row level security;

create policy "Members can view receive links"
  on public.sancus_receive_links for select
  using (public.sancus_can_access_company(auth.uid(), company_id));

create policy "Managers can create receive links"
  on public.sancus_receive_links for insert
  with check (
    auth.uid() = owner_user_id
    and public.sancus_can_manage_company(auth.uid(), company_id)
  );

create policy "Managers can update receive links"
  on public.sancus_receive_links for update
  using (public.sancus_can_manage_company(auth.uid(), company_id));

grant select, insert, update on public.sancus_receive_links to authenticated;
grant all on public.sancus_receive_links to service_role;

create trigger handle_sancus_receive_links_updated_at
  before update on public.sancus_receive_links
  for each row execute function public.handle_updated_at();

-- Backfill existing local-currency organizations using their creator or root owner.
insert into public.sancus_receive_links (company_id, rail, owner_user_id)
select
  company.id,
  case company.base_currency
    when 'IDR' then 'QRIS'
    when 'THB' then 'PROMPTPAY'
    when 'BRL' then 'PIX'
  end,
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
where company.base_currency in ('IDR', 'THB', 'BRL')
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
    else null
  end;
  if v_rail is not null and new.created_by is not null then
    insert into public.sancus_receive_links (company_id, rail, owner_user_id)
    values (new.id, v_rail, new.created_by)
    on conflict (company_id, rail) do update set active = true;
  end if;
  return new;
end $$;

create trigger sancus_companies_ensure_receive_link
  after insert on public.sancus_companies
  for each row execute function public.sancus_ensure_receive_link();
