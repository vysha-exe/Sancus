-- Sancus: account types (admin / branch / employee / individual).
--   * Only the global account's Owner/Admin can add branches. Branch admins manage their own
--     people but can't grow the tree or touch the global account or other branches.
--   * Employees can read the spending methods (cards, QR) issued to them.

create or replace function public.sancus_is_global_admin(p_user uuid, p_company uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.sancus_companies c
      join public.sancus_memberships m on m.company_id = c.root_id
     where c.id = p_company
       and m.user_id = p_user
       and m.status = 'ACTIVE'
       and m.role in ('OWNER', 'ADMIN')
  )
$$;
grant execute on function public.sancus_is_global_admin(uuid, uuid) to authenticated;

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
    if not public.sancus_is_global_admin(v_user, p_parent) then
      raise exception 'only the global account''s Owner or Admin can add branches';
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

-- Employees see the cards / QR methods issued to them (methods are owned by the admin who issued them).
drop policy if exists "Employees can view their own spending methods" on public.sancus_spending_methods;
create policy "Employees can view their own spending methods"
  on public.sancus_spending_methods for select
  using (employee_id = auth.uid()::text);
