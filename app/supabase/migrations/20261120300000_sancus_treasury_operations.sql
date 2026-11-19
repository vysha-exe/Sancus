create table if not exists public.sancus_treasury_yield_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  company_id uuid not null references public.sancus_companies(id) on delete restrict,
  wallet_id text not null,
  idempotency_key text not null,
  action text not null check (action in ('DEPOSIT', 'WITHDRAW')),
  vault_address text not null,
  amount text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'CONFIRMED', 'FAILED')),
  tx_hash text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, idempotency_key)
);

create table if not exists public.sancus_treasury_gateway_moves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  company_id uuid not null references public.sancus_companies(id) on delete restrict,
  wallet_id text not null,
  idempotency_key text not null,
  amount_minor bigint not null check (amount_minor > 0),
  source_address text not null,
  destination_address text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'CONFIRMED', 'FAILED')),
  gateway_transfer_id text,
  mint_tx_hash text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, idempotency_key)
);

do $$
declare table_name text;
begin
  foreach table_name in array array['sancus_treasury_yield_actions', 'sancus_treasury_gateway_moves'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'create policy "Root admins can view %1$s" on public.%1$I for select using (public.sancus_effective_role(auth.uid(), company_id) in (''OWNER'', ''ADMIN'') and exists (select 1 from public.sancus_companies c where c.id = company_id and c.parent_id is null))',
      table_name
    );
    execute format(
      'create policy "Root admins can create %1$s" on public.%1$I for insert with check (user_id = auth.uid() and public.sancus_effective_role(auth.uid(), company_id) in (''OWNER'', ''ADMIN'') and exists (select 1 from public.sancus_companies c where c.id = company_id and c.parent_id is null))',
      table_name
    );
    execute format(
      'create policy "Root admins can update %1$s" on public.%1$I for update using (public.sancus_effective_role(auth.uid(), company_id) in (''OWNER'', ''ADMIN'') and exists (select 1 from public.sancus_companies c where c.id = company_id and c.parent_id is null))',
      table_name
    );
    execute format('grant select, insert, update on public.%I to authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
    execute format('create trigger handle_%1$s_updated_at before update on public.%1$I for each row execute function public.handle_updated_at()', table_name);
  end loop;
end $$;
