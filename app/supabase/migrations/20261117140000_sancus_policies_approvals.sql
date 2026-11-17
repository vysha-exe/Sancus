-- Sancus: spending policies + approval states for payouts.

-- 1. Payout approval states.
alter table public.sancus_payouts drop constraint if exists sancus_payouts_status_check;
alter table public.sancus_payouts add constraint sancus_payouts_status_check
  check (status in ('PENDING_APPROVAL', 'CREATED', 'FUNDS_SENT', 'CONVERTING', 'PAYING_OUT', 'COMPLETED', 'FAILED', 'REJECTED'));

alter table public.sancus_payouts
  add column if not exists approval_reason text,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id),
  add column if not exists decided_at timestamptz,
  add column if not exists decided_note text;

-- 2. One policy row per account (defaults apply when no row exists).
create table if not exists public.sancus_policies (
  user_id uuid primary key references auth.users(id) on delete cascade,
  approval_threshold_minor bigint not null default 1000000000,   -- $1,000.00 USDC: at or above needs approval
  per_payment_limit_minor bigint not null default 50000000000,   -- $50,000.00: above is blocked
  daily_limit_minor bigint not null default 100000000000,        -- $100,000.00 per UTC day
  blocked_recipients text[] not null default '{}',               -- names or PayNow proxies / account numbers
  updated_at timestamptz not null default now()
);

alter table public.sancus_policies enable row level security;
create policy "Users can view their own policy" on public.sancus_policies for select using (auth.uid() = user_id);
create policy "Users can create their own policy" on public.sancus_policies for insert with check (auth.uid() = user_id);
create policy "Users can update their own policy" on public.sancus_policies for update using (auth.uid() = user_id);
grant select, insert, update on public.sancus_policies to authenticated;
grant all on public.sancus_policies to service_role;

create trigger handle_sancus_policies_updated_at
  before update on public.sancus_policies
  for each row execute function public.handle_updated_at();
