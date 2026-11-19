-- Repair older branches that predate the receive-account seed trigger. Every
-- operating branch must have exactly one local bank account; the parent remains
-- the global Treasury and does not use a local operating account.

do $$
declare
  v_company public.sancus_companies;
begin
  for v_company in
    select * from public.sancus_companies where parent_id is not null
  loop
    perform public.sancus_seed_receive_account(v_company);
  end loop;
end $$;

drop trigger if exists sancus_companies_ensure_receive_account on public.sancus_companies;
create trigger sancus_companies_ensure_receive_account
  after insert on public.sancus_companies
  for each row
  when (new.parent_id is not null)
  execute function public.sancus_companies_ensure_receive_account();

do $$
begin
  if exists (
    select 1
    from public.sancus_companies company
    left join public.sancus_receive_accounts account on account.company_id = company.id
    where company.parent_id is not null and account.id is null
  ) then
    raise exception 'Every operating branch must have a bank account';
  end if;
end $$;
