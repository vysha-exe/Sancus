-- Every person gets a bank-first USD account. Canonical USDC remains a separate
-- wallet balance; the home dashboard adds the two without conflating custody.

create table if not exists public.sancus_personal_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  bank_name text not null default 'JPMorgan Chase',
  account_name text not null,
  account_number text not null,
  account_type text not null default 'Personal account',
  routing_label text not null default 'Routing number',
  routing_value text not null default '021000021',
  currency text not null default 'USD' check (currency = 'USD'),
  balance_minor bigint not null default 0 check (balance_minor >= 0),
  provider text not null default 'Sancus sandbox',
  simulated boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sancus_personal_bank_entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.sancus_personal_bank_accounts(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  direction text not null check (direction in ('CREDIT', 'DEBIT')),
  amount_minor bigint not null check (amount_minor > 0),
  balance_after_minor bigint not null check (balance_after_minor >= 0),
  entry_type text not null,
  source_type text,
  source_id text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (account_id, idempotency_key)
);

alter table public.sancus_personal_bank_accounts enable row level security;
alter table public.sancus_personal_bank_entries enable row level security;

create policy "People can view their bank account"
  on public.sancus_personal_bank_accounts for select using (auth.uid() = user_id);
create policy "People can view their bank entries"
  on public.sancus_personal_bank_entries for select using (auth.uid() = user_id);

grant select on public.sancus_personal_bank_accounts, public.sancus_personal_bank_entries to authenticated;
grant all on public.sancus_personal_bank_accounts, public.sancus_personal_bank_entries to service_role;

create trigger handle_sancus_personal_bank_accounts_updated_at
  before update on public.sancus_personal_bank_accounts
  for each row execute function public.handle_updated_at();

create or replace function public.sancus_seed_personal_bank_account(p_user auth.users)
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  v_name text;
  v_number text;
begin
  v_name := coalesce(
    nullif(trim(concat(p_user.raw_user_meta_data->>'first_name', ' ', p_user.raw_user_meta_data->>'last_name')), ''),
    split_part(coalesce(p_user.email, 'Sancus user'), '@', 1)
  );
  v_number := substr(translate(replace(p_user.id::text, '-', ''), 'abcdef', '123456'), 1, 12);
  insert into public.sancus_personal_bank_accounts (user_id, account_name, account_number)
  values (p_user.id, v_name, v_number)
  on conflict (user_id) do nothing;
end $$;

do $$ declare v_user auth.users; begin
  for v_user in select * from auth.users loop
    perform public.sancus_seed_personal_bank_account(v_user);
  end loop;
end $$;

create or replace function public.sancus_users_ensure_personal_bank_account()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  perform public.sancus_seed_personal_bank_account(new);
  return new;
end $$;

drop trigger if exists sancus_users_ensure_personal_bank_account on auth.users;
create trigger sancus_users_ensure_personal_bank_account
  after insert on auth.users
  for each row execute function public.sancus_users_ensure_personal_bank_account();

create or replace function public.sancus_personal_bank_post_credit(
  p_user_id uuid,
  p_amount_minor bigint,
  p_entry_type text,
  p_source_type text,
  p_source_id text,
  p_idempotency_key text
) returns public.sancus_personal_bank_entries
language plpgsql security definer set search_path = public as $$
declare
  v_account public.sancus_personal_bank_accounts;
  v_entry public.sancus_personal_bank_entries;
begin
  if p_amount_minor <= 0 then raise exception 'Credit amount must be positive'; end if;
  select * into v_account from public.sancus_personal_bank_accounts where user_id = p_user_id for update;
  if not found then raise exception 'Personal bank account not found'; end if;
  select * into v_entry from public.sancus_personal_bank_entries
    where account_id = v_account.id and idempotency_key = p_idempotency_key;
  if found then return v_entry; end if;

  update public.sancus_personal_bank_accounts
    set balance_minor = balance_minor + p_amount_minor
    where id = v_account.id returning * into v_account;
  insert into public.sancus_personal_bank_entries (
    account_id, user_id, direction, amount_minor, balance_after_minor,
    entry_type, source_type, source_id, idempotency_key
  ) values (
    v_account.id, v_account.user_id, 'CREDIT', p_amount_minor, v_account.balance_minor,
    p_entry_type, p_source_type, p_source_id, p_idempotency_key
  ) returning * into v_entry;
  return v_entry;
end $$;

revoke all on function public.sancus_personal_bank_post_credit(uuid, bigint, text, text, text, text) from public, anon, authenticated;
grant execute on function public.sancus_personal_bank_post_credit(uuid, bigint, text, text, text, text) to service_role;
