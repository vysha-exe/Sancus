-- Sancus: double-entry ledger.
--
-- A journal is one business event (e.g. "payout created"). Each journal has two
-- or more entries whose debits equal their credits. Journals are unique per
-- (user, source, event), so posting the same event twice is a no-op.
-- Amounts are integer minor units (USDC = 6 decimals).

create table if not exists public.sancus_journals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null,          -- e.g. 'payout', 'card_authorization', 'deposit', 'x402'
  source_id text not null,
  event text not null,                -- e.g. 'created', 'completed', 'failed'
  memo text,
  created_at timestamptz not null default now(),
  constraint sancus_journals_once unique (user_id, source_type, source_id, event)
);

create table if not exists public.sancus_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references public.sancus_journals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  account text not null,              -- e.g. 'treasury:available', 'payouts:in_transit'
  direction text not null check (direction in ('DEBIT', 'CREDIT')),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'USDC',
  created_at timestamptz not null default now()
);

create index if not exists sancus_journals_user_created_idx on public.sancus_journals (user_id, created_at desc);
create index if not exists sancus_ledger_entries_journal_idx on public.sancus_ledger_entries (journal_id);
create index if not exists sancus_ledger_entries_user_account_idx on public.sancus_ledger_entries (user_id, account);

alter table public.sancus_journals enable row level security;
alter table public.sancus_ledger_entries enable row level security;

-- Read-only for users; writes go through sancus_post_journal() below.
create policy "Users can view their own journals"
  on public.sancus_journals for select using (auth.uid() = user_id);
create policy "Users can view their own ledger entries"
  on public.sancus_ledger_entries for select using (auth.uid() = user_id);

grant select on public.sancus_journals to authenticated;
grant select on public.sancus_ledger_entries to authenticated;
grant all on public.sancus_journals to service_role;
grant all on public.sancus_ledger_entries to service_role;

-- Posts a balanced journal atomically for the calling user.
-- p_entries: [{"account": "...", "direction": "DEBIT"|"CREDIT", "amount_minor": "123", "currency": "USDC"}]
-- Returns the journal id (existing id if this event was already posted).
create or replace function public.sancus_post_journal(
  p_source_type text,
  p_source_id text,
  p_event text,
  p_memo text,
  p_entries jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_journal uuid;
  v_debits numeric := 0;
  v_credits numeric := 0;
  v_entry jsonb;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) < 2 then
    raise exception 'a journal needs at least two entries';
  end if;

  for v_entry in select * from jsonb_array_elements(p_entries) loop
    if (v_entry->>'amount_minor')::numeric <= 0 then
      raise exception 'entry amounts must be positive';
    end if;
    if v_entry->>'direction' = 'DEBIT' then
      v_debits := v_debits + (v_entry->>'amount_minor')::numeric;
    elsif v_entry->>'direction' = 'CREDIT' then
      v_credits := v_credits + (v_entry->>'amount_minor')::numeric;
    else
      raise exception 'direction must be DEBIT or CREDIT';
    end if;
  end loop;

  if v_debits <> v_credits then
    raise exception 'unbalanced journal: debits % <> credits %', v_debits, v_credits;
  end if;

  insert into public.sancus_journals (user_id, source_type, source_id, event, memo)
  values (v_user, p_source_type, p_source_id, p_event, p_memo)
  on conflict (user_id, source_type, source_id, event) do nothing
  returning id into v_journal;

  if v_journal is null then
    -- Already posted: return the existing journal, write nothing.
    select id into v_journal from public.sancus_journals
    where user_id = v_user and source_type = p_source_type
      and source_id = p_source_id and event = p_event;
    return v_journal;
  end if;

  insert into public.sancus_ledger_entries (journal_id, user_id, account, direction, amount_minor, currency)
  select v_journal, v_user, e->>'account', e->>'direction', (e->>'amount_minor')::bigint, coalesce(e->>'currency', 'USDC')
  from jsonb_array_elements(p_entries) as e;

  return v_journal;
end;
$$;

revoke all on function public.sancus_post_journal(text, text, text, text, jsonb) from public;
grant execute on function public.sancus_post_journal(text, text, text, text, jsonb) to authenticated, service_role;
