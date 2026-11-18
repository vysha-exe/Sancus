-- Sancus: tag ACH and Pix payments with the company that made them (like sancus_payouts.company_id),
-- so a business dashboard's balance and activity include them and a personal view doesn't.

alter table public.sancus_ach_payments
  add column if not exists company_id uuid references public.sancus_companies(id) on delete set null;
create index if not exists sancus_ach_payments_company_idx on public.sancus_ach_payments (company_id);

alter table public.sancus_pix_payments
  add column if not exists company_id uuid references public.sancus_companies(id) on delete set null;
create index if not exists sancus_pix_payments_company_idx on public.sancus_pix_payments (company_id);

-- Members of a company can see its payments (admins see branches' too, via sancus_can_access_company).
drop policy if exists "Members can view company ACH payments" on public.sancus_ach_payments;
create policy "Members can view company ACH payments"
  on public.sancus_ach_payments for select
  using (company_id is not null and public.sancus_can_access_company(auth.uid(), company_id));

drop policy if exists "Members can view company Pix payments" on public.sancus_pix_payments;
create policy "Members can view company Pix payments"
  on public.sancus_pix_payments for select
  using (company_id is not null and public.sancus_can_access_company(auth.uid(), company_id));
