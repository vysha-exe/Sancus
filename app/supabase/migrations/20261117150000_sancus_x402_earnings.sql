-- Sancus: x402 earnings. Outside agents pay per call for Sancus endpoints (Circle
-- Gateway nanopayments on Arc); each settled payment is recorded here and posted
-- to the receiving account's ledger as revenue.

create table if not exists public.sancus_x402_earnings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,  -- account that received the money
  endpoint text not null,
  payer text not null,
  amount_minor bigint not null check (amount_minor > 0),               -- USDC, 6 decimals
  network text not null,
  pay_to text not null,
  gateway_tx text,
  created_at timestamptz not null default now()
);

create index if not exists sancus_x402_earnings_user_created_idx
  on public.sancus_x402_earnings (user_id, created_at desc);

alter table public.sancus_x402_earnings enable row level security;
create policy "Users can view their own x402 earnings"
  on public.sancus_x402_earnings for select using (auth.uid() = user_id);
grant select on public.sancus_x402_earnings to authenticated;
grant all on public.sancus_x402_earnings to service_role;

alter publication supabase_realtime add table public.sancus_x402_earnings;

-- Server-side twin of sancus_post_journal(): posts a balanced journal for a given
-- user. Only callable with the service role (no signed-in user when an agent pays).
create or replace function public.sancus_post_journal_for(
  p_user uuid,
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
  v_journal uuid;
  v_debits numeric := 0;
  v_credits numeric := 0;
  v_entry jsonb;
begin
  if p_user is null then
    raise exception 'user required';
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
  values (p_user, p_source_type, p_source_id, p_event, p_memo)
  on conflict (user_id, source_type, source_id, event) do nothing
  returning id into v_journal;

  if v_journal is null then
    select id into v_journal from public.sancus_journals
    where user_id = p_user and source_type = p_source_type and source_id = p_source_id and event = p_event;
    return v_journal;
  end if;

  insert into public.sancus_ledger_entries (journal_id, user_id, account, direction, amount_minor, currency)
  select v_journal, p_user, e->>'account', e->>'direction', (e->>'amount_minor')::bigint, coalesce(e->>'currency', 'USDC')
  from jsonb_array_elements(p_entries) as e;

  return v_journal;
end;
$$;

revoke all on function public.sancus_post_journal_for(uuid, text, text, text, text, jsonb) from public;
revoke all on function public.sancus_post_journal_for(uuid, text, text, text, text, jsonb) from authenticated;
grant execute on function public.sancus_post_journal_for(uuid, text, text, text, text, jsonb) to service_role;
