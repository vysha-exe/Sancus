-- Sancus: global account → branches → sub-branches (a company tree), memberships with
-- roles that inherit DOWN the tree, and wallets attached to any node.
-- See docs/b2b-b2c-structure.md. A branch is just a company row with a parent.

-- ---------- roles ----------
do $$ begin
  create type public.sancus_role as enum ('OWNER', 'ADMIN', 'FINANCE', 'EMPLOYEE', 'VIEWER');
exception when duplicate_object then null; end $$;

-- ---------- company tree ----------
create table if not exists public.sancus_companies (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.sancus_companies(id) on delete cascade,
  root_id uuid not null,                       -- = id for the global account; inherited by every descendant
  name text not null check (length(trim(name)) between 1 and 120),
  country text not null check (country ~ '^[A-Z]{2}$'),
  base_currency text not null check (base_currency ~ '^[A-Z]{3}$'),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sancus_companies_root_idx on public.sancus_companies (root_id);
create index if not exists sancus_companies_parent_idx on public.sancus_companies (parent_id);

-- root_id is derived, never trusted from the client.
create or replace function public.sancus_companies_set_root()
returns trigger language plpgsql as $$
begin
  if new.parent_id is null then
    new.root_id := new.id;
  else
    select root_id into new.root_id from public.sancus_companies where id = new.parent_id;
    if new.root_id is null then raise exception 'parent company not found'; end if;
  end if;
  return new;
end $$;
drop trigger if exists sancus_companies_set_root on public.sancus_companies;
create trigger sancus_companies_set_root before insert on public.sancus_companies
  for each row execute function public.sancus_companies_set_root();
create trigger handle_sancus_companies_updated_at before update on public.sancus_companies
  for each row execute function public.handle_updated_at();

-- ---------- memberships ----------
create table if not exists public.sancus_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.sancus_companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.sancus_role not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INVITED', 'DISABLED')),
  invited_by uuid references auth.users(id),
  invited_email text,
  created_at timestamptz not null default now(),
  constraint sancus_memberships_once unique (company_id, user_id)
);
create index if not exists sancus_memberships_user_idx on public.sancus_memberships (user_id);

-- ---------- access helpers (ancestor walk) ----------
-- Effective role of a user at a node: membership on the node wins, else the nearest ancestor's.
create or replace function public.sancus_effective_role(p_user uuid, p_company uuid)
returns public.sancus_role
language sql stable security definer set search_path = public as $$
  with recursive chain as (
    select id, parent_id, 0 as depth from public.sancus_companies where id = p_company
    union all
    select c.id, c.parent_id, chain.depth + 1
    from public.sancus_companies c join chain on c.id = chain.parent_id
    where chain.depth < 20
  )
  select m.role
  from chain join public.sancus_memberships m
    on m.company_id = chain.id and m.user_id = p_user and m.status = 'ACTIVE'
  order by chain.depth
  limit 1
$$;

create or replace function public.sancus_can_access_company(p_user uuid, p_company uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.sancus_effective_role(p_user, p_company) is not null
$$;

create or replace function public.sancus_can_manage_company(p_user uuid, p_company uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.sancus_effective_role(p_user, p_company) in ('OWNER', 'ADMIN'), false)
$$;

grant execute on function public.sancus_effective_role(uuid, uuid) to authenticated;
grant execute on function public.sancus_can_access_company(uuid, uuid) to authenticated;
grant execute on function public.sancus_can_manage_company(uuid, uuid) to authenticated;

-- Create a global account (p_parent null → caller becomes OWNER) or a branch under a node
-- the caller manages (OWNER/ADMIN there or on an ancestor). Max 6 levels deep.
create or replace function public.sancus_create_company(
  p_parent uuid, p_name text, p_country text, p_currency text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_depth int := 0;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_parent is not null then
    if not public.sancus_can_manage_company(v_user, p_parent) then
      raise exception 'only an Owner or Admin of this branch can add branches under it';
    end if;
    with recursive chain as (
      select id, parent_id, 1 as depth from public.sancus_companies where id = p_parent
      union all
      select c.id, c.parent_id, chain.depth + 1 from public.sancus_companies c join chain on c.id = chain.parent_id
      where chain.depth < 20
    ) select max(depth) into v_depth from chain;
    if v_depth >= 6 then raise exception 'branches can be at most 6 levels deep'; end if;
  end if;

  insert into public.sancus_companies (parent_id, root_id, name, country, base_currency, created_by)
  values (p_parent, gen_random_uuid(), trim(p_name), upper(p_country), upper(p_currency), v_user)
  returning id into v_id;

  if p_parent is null then
    insert into public.sancus_memberships (company_id, user_id, role, status)
    values (v_id, v_user, 'OWNER', 'ACTIVE');
  end if;
  return v_id;
end $$;
revoke all on function public.sancus_create_company(uuid, text, text, text) from public;
grant execute on function public.sancus_create_company(uuid, text, text, text) to authenticated;

-- ---------- row level security ----------
alter table public.sancus_companies enable row level security;
alter table public.sancus_memberships enable row level security;

create policy "Members can view companies in their tree"
  on public.sancus_companies for select using (public.sancus_can_access_company(auth.uid(), id));
create policy "Members can view memberships of companies they can access"
  on public.sancus_memberships for select using (public.sancus_can_access_company(auth.uid(), company_id));

grant select on public.sancus_companies to authenticated;
grant select on public.sancus_memberships to authenticated;
grant all on public.sancus_companies to service_role;
grant all on public.sancus_memberships to service_role;

-- ---------- wallets belong to a node ----------
alter table public.wallets add column if not exists company_id uuid references public.sancus_companies(id) on delete set null;
create index if not exists wallets_company_idx on public.wallets (company_id);

-- Members can see wallets of any node they can access (inherited from ancestors).
create policy "Members can view company wallets"
  on public.wallets for select
  using (company_id is not null and public.sancus_can_access_company(auth.uid(), company_id));

-- Only Owners/Admins of a node (or an ancestor) may attach wallets to it.
create policy "Only managers can add company wallets"
  on public.wallets as restrictive for insert
  with check (company_id is null or public.sancus_can_manage_company(auth.uid(), company_id));

-- The one-Treasury/one-Settlement rule is for personal accounts; branches can hold many wallets.
drop index if exists public.wallets_one_role_per_account_chain;
create unique index if not exists wallets_one_role_per_account_chain
  on public.wallets (user_id, blockchain, type)
  where type in ('treasury', 'payout') and company_id is null;
