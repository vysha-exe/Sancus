-- Sancus: local-rail collections (QRIS / PromptPay / Pix sandbox charges). When a charge is
-- paid, the rail bot mints the matching mock stablecoin (mIDR / mTHB / mBRL) on Arc testnet
-- into the account's wallet for that country. One row per charge; mint happens once.

create table if not exists public.sancus_rail_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rail text not null check (rail in ('QRIS', 'PROMPTPAY', 'PIX')),
  currency text not null check (currency in ('IDR', 'THB', 'BRL')),
  amount_minor bigint not null check (amount_minor > 0),         -- local currency, 2 decimals
  provider text not null,                                        -- midtrans | omise | payzu | simulated
  provider_ref text not null,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'PAID', 'MINTING', 'MINTED', 'FAILED', 'EXPIRED')),
  simulated boolean not null default false,
  qr_image_url text,
  qr_payload text,
  simulator_url text,
  destination_address text not null,
  destination_label text,
  token_address text not null,
  mint_tx text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sancus_rail_collections_once unique (provider, provider_ref)
);

create index if not exists sancus_rail_collections_user_idx on public.sancus_rail_collections (user_id, created_at desc);

alter table public.sancus_rail_collections enable row level security;
create policy "Users can view their own collections" on public.sancus_rail_collections for select using (auth.uid() = user_id);
create policy "Users can create their own collections" on public.sancus_rail_collections for insert with check (auth.uid() = user_id);
create policy "Users can update their own collections" on public.sancus_rail_collections for update using (auth.uid() = user_id);
grant select, insert, update on public.sancus_rail_collections to authenticated;
grant all on public.sancus_rail_collections to service_role;

create trigger handle_sancus_rail_collections_updated_at
  before update on public.sancus_rail_collections
  for each row execute function public.handle_updated_at();
