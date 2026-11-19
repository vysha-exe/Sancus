-- Parent-company treasury attribution. Branches never participate in this scope.

alter table public.sancus_x402_earnings
  add column if not exists company_id uuid references public.sancus_companies(id) on delete restrict,
  add column if not exists wallet_id text,
  add column if not exists payment_fingerprint text;

create unique index if not exists sancus_x402_payment_fingerprint_idx
  on public.sancus_x402_earnings(payment_fingerprint)
  where payment_fingerprint is not null;
create index if not exists sancus_x402_earnings_company_created_idx
  on public.sancus_x402_earnings(company_id, created_at desc);

-- Attribute older earnings to the receiver's root company when there is one.
update public.sancus_x402_earnings earning
set company_id = membership.company_id
from public.sancus_memberships membership
join public.sancus_companies company on company.id = membership.company_id and company.parent_id is null
where earning.company_id is null
  and membership.user_id = earning.user_id
  and membership.status = 'ACTIVE'
  and membership.role in ('OWNER', 'ADMIN');

create policy "Root admins can view company x402 earnings"
  on public.sancus_x402_earnings for select
  using (
    company_id is not null
    and public.sancus_effective_role(auth.uid(), company_id) in ('OWNER', 'ADMIN')
    and exists (select 1 from public.sancus_companies c where c.id = company_id and c.parent_id is null)
  );
