-- Hackathon company structure: one country-neutral parent treasury with every
-- country branch directly beneath it. Grandchildren are intentionally unsupported.

-- Preserve every company and its data; only lift existing grandchildren to their root.
update public.sancus_companies
set parent_id = root_id,
    updated_at = now()
where id <> root_id
  and parent_id is distinct from root_id;

-- Derive root_id and refuse attempts to place a branch beneath another branch.
create or replace function public.sancus_companies_set_root()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_parent_root uuid;
  v_parent_parent uuid;
begin
  if new.parent_id is null then
    new.root_id := new.id;
    return new;
  end if;

  select root_id, parent_id
    into v_parent_root, v_parent_parent
    from public.sancus_companies
   where id = new.parent_id;

  if v_parent_root is null then
    raise exception 'parent company not found';
  end if;
  if v_parent_parent is not null then
    raise exception 'branches must be created directly under the parent treasury';
  end if;

  new.root_id := v_parent_root;
  return new;
end
$$;

drop trigger if exists sancus_companies_set_root on public.sancus_companies;
create trigger sancus_companies_set_root
  before insert or update of parent_id on public.sancus_companies
  for each row execute function public.sancus_companies_set_root();

-- Keep the database RPC aligned with the one-parent/direct-branches API.
create or replace function public.sancus_create_company(
  p_parent uuid, p_name text, p_country text, p_currency text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_parent is not null then
    if not exists (
      select 1 from public.sancus_companies
       where id = p_parent and parent_id is null
    ) then
      raise exception 'branches must be created directly under the parent treasury';
    end if;
    if not public.sancus_is_global_admin(v_user, p_parent) then
      raise exception 'only the global account''s Owner or Admin can add branches';
    end if;
  end if;

  insert into public.sancus_companies (parent_id, root_id, name, country, base_currency, created_by)
  values (p_parent, gen_random_uuid(), trim(p_name), upper(p_country), upper(p_currency), v_user)
  returning id into v_id;

  if p_parent is null then
    insert into public.sancus_memberships (company_id, user_id, role, status)
    values (v_id, v_user, 'OWNER', 'ACTIVE');
  end if;
  return v_id;
end
$$;

revoke all on function public.sancus_create_company(uuid, text, text, text) from public;
grant execute on function public.sancus_create_company(uuid, text, text, text) to authenticated;
