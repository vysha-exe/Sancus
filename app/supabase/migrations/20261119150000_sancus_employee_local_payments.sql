-- Link local-rail payouts to the employee access that authorized them.
-- This lets the employee portal enforce monthly limits and show its own activity.

alter table public.sancus_xendit_payouts
  add column if not exists employee_id uuid references auth.users(id) on delete set null,
  add column if not exists spending_method_id uuid references public.sancus_spending_methods(id) on delete set null;

create index if not exists sancus_xendit_payouts_employee_created_idx
  on public.sancus_xendit_payouts (employee_id, created_at desc);

create index if not exists sancus_xendit_payouts_method_created_idx
  on public.sancus_xendit_payouts (spending_method_id, created_at desc);
