-- Employee-portal card authorizations. Admin-issued cards remain owned by the
-- business user, while the assigned employee can view and spend through them.

create table if not exists public.sancus_card_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  employee_id uuid not null references auth.users(id) on delete cascade,
  employee_name text not null,
  card_id uuid references public.sancus_cards(id) on delete set null,
  spending_method_id uuid references public.sancus_spending_methods(id) on delete set null,
  merchant_name text not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null,
  status text not null default 'HELD' check (status in ('HELD', 'SETTLED', 'RELEASED', 'DECLINED')),
  decline_reason text,
  authorized_at timestamptz not null default now(),
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (card_id is not null or spending_method_id is not null)
);

create index if not exists sancus_card_purchases_owner_created_idx
  on public.sancus_card_purchases (user_id, created_at desc);
create index if not exists sancus_card_purchases_employee_created_idx
  on public.sancus_card_purchases (employee_id, created_at desc);

alter table public.sancus_card_purchases enable row level security;

create policy "Businesses can view their card purchases"
  on public.sancus_card_purchases for select using (auth.uid() = user_id);
create policy "Employees can view their card purchases"
  on public.sancus_card_purchases for select using (auth.uid() = employee_id);

-- Employees can see methods assigned to their login, but cannot change them.
create policy "Employees can view assigned spending methods"
  on public.sancus_spending_methods for select using (employee_id = auth.uid()::text);
create policy "Employees can view assigned cards"
  on public.sancus_cards for select using (employee_id = auth.uid()::text);

grant select on public.sancus_card_purchases to authenticated;
grant all on public.sancus_card_purchases to service_role;

create trigger handle_sancus_card_purchases_updated_at before update on public.sancus_card_purchases
  for each row execute function public.handle_updated_at();
