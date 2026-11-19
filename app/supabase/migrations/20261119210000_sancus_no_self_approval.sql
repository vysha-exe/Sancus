-- Sancus: nobody approves their own company payment (backs up checkApprover() in approval-rules.ts).
--
-- user_id is the person who asked; approved_by is who said yes. Personal payments (no company)
-- are exempt: a solo account has nobody else to ask. Declines and withdrawals don't set
-- approved_by, so they're unaffected.
--
-- NOT VALID: enforced for every new insert/update, without failing on rows that already exist.

alter table public.sancus_payouts drop constraint if exists sancus_payouts_no_self_approval;
alter table public.sancus_payouts add constraint sancus_payouts_no_self_approval
  check (company_id is null or approved_by is null or approved_by <> user_id) not valid;

alter table public.sancus_ach_payments drop constraint if exists sancus_ach_payments_no_self_approval;
alter table public.sancus_ach_payments add constraint sancus_ach_payments_no_self_approval
  check (company_id is null or approved_by is null or approved_by <> user_id) not valid;
