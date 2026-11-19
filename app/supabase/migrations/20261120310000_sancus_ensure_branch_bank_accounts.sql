-- Repair older company accounts that predate the receive-account seed trigger.
-- Every company account has bank details, including the parent company. Treasury
-- capabilities remain parent-only and separate from this bank-account guarantee.

do $$
declare
  v_company public.sancus_companies;
begin
  for v_company in
    select * from public.sancus_companies
  loop
    perform public.sancus_seed_receive_account(v_company);
  end loop;
end $$;

drop trigger if exists sancus_companies_ensure_receive_account on public.sancus_companies;
create trigger sancus_companies_ensure_receive_account
  after insert on public.sancus_companies
  for each row
  execute function public.sancus_companies_ensure_receive_account();

do $$
begin
  if exists (
    select 1
    from public.sancus_companies company
    left join public.sancus_receive_accounts account on account.company_id = company.id
    where account.id is null
  ) then
    raise exception 'Every company account must have a bank account';
  end if;
end $$;
