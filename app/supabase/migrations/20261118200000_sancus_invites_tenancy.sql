-- Sancus: invite tokens, notifications, company scoping on payouts + company policies.

-- Pending invites have no user yet (unique is still on company_id + user_id when set).
alter table public.sancus_memberships alter column user_id drop not null;

alter table public.sancus_memberships
  add column if not exists invite_token text,
  add column if not exists expires_at timestamptz,
  add column if not exists accepted_at timestamptz;

create unique index if not exists sancus_memberships_invite_token_idx
  on public.sancus_memberships (invite_token)
  where invite_token is not null;

create policy "Managers can invite members"
  on public.sancus_memberships for insert
  with check (public.sancus_can_manage_company(auth.uid(), company_id));

create policy "Managers can update members"
  on public.sancus_memberships for update
  using (public.sancus_can_manage_company(auth.uid(), company_id));

create or replace function public.sancus_accept_invite(p_token text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select id into v_id
    from public.sancus_memberships
   where invite_token = p_token
     and status = 'INVITED'
     and (expires_at is null or expires_at > now())
   for update;
  if v_id is null then raise exception 'invite not found or expired'; end if;

  update public.sancus_memberships set
    user_id = v_user,
    status = 'ACTIVE',
    accepted_at = now(),
    invite_token = null
  where id = v_id;
  return v_id;
end $$;
revoke all on function public.sancus_accept_invite(text) from public;
grant execute on function public.sancus_accept_invite(text) to authenticated;

create table if not exists public.sancus_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists sancus_notifications_user_idx
  on public.sancus_notifications (user_id, created_at desc);

alter table public.sancus_notifications enable row level security;
create policy "Users see own notifications"
  on public.sancus_notifications for select using (auth.uid() = user_id);
create policy "Users update own notifications"
  on public.sancus_notifications for update using (auth.uid() = user_id);
create policy "Users insert own notifications"
  on public.sancus_notifications for insert
  with check (auth.uid() = user_id);
grant select, insert, update on public.sancus_notifications to authenticated;
grant all on public.sancus_notifications to service_role;

alter table public.sancus_payouts
  add column if not exists company_id uuid references public.sancus_companies(id) on delete set null;
create index if not exists sancus_payouts_company_idx on public.sancus_payouts (company_id);

create policy "Members can view company payouts"
  on public.sancus_payouts for select
  using (company_id is not null and public.sancus_can_access_company(auth.uid(), company_id));

create table if not exists public.sancus_company_policies (
  company_id uuid primary key references public.sancus_companies(id) on delete cascade,
  approval_threshold_minor bigint not null default 1000000000,
  per_payment_limit_minor bigint not null default 50000000000,
  daily_limit_minor bigint not null default 100000000000,
  blocked_recipients text[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.sancus_company_policies enable row level security;
create policy "Members can view company policies"
  on public.sancus_company_policies for select
  using (public.sancus_can_access_company(auth.uid(), company_id));
create policy "Managers can upsert company policies"
  on public.sancus_company_policies for insert
  with check (public.sancus_can_manage_company(auth.uid(), company_id));
create policy "Managers can update company policies"
  on public.sancus_company_policies for update
  using (public.sancus_can_manage_company(auth.uid(), company_id));
grant select, insert, update on public.sancus_company_policies to authenticated;
grant all on public.sancus_company_policies to service_role;
create trigger handle_sancus_company_policies_updated_at
  before update on public.sancus_company_policies
  for each row execute function public.handle_updated_at();

-- Optional per-member spend limits (BUILD / Team person UI).
alter table public.sancus_memberships
  add column if not exists per_payment_limit_minor bigint,
  add column if not exists daily_limit_minor bigint;
