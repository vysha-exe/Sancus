-- Sancus: uploaded supplier invoices. One row per upload; fields are extracted (LLM or a
-- filename-based mock), confirmed by the user, then the invoice is handed to the pay flow.
-- The original file lives in the private `invoices` storage bucket (written by the server
-- with the service role, so no storage policies are needed).

create table if not exists public.sancus_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  storage_path text,                                   -- null when the binary upload was skipped
  supplier_name text,
  invoice_number text,
  amount_minor bigint check (amount_minor is null or amount_minor >= 0),
  currency text default 'USD',
  due_date date,
  rail text,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'READY', 'PAID')),
  extracted jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sancus_invoices_user_idx on public.sancus_invoices (user_id, created_at desc);

alter table public.sancus_invoices enable row level security;
create policy "Users can view their own invoices" on public.sancus_invoices for select using (auth.uid() = user_id);
create policy "Users can create their own invoices" on public.sancus_invoices for insert with check (auth.uid() = user_id);
create policy "Users can update their own invoices" on public.sancus_invoices for update using (auth.uid() = user_id);
grant select, insert, update on public.sancus_invoices to authenticated;
grant all on public.sancus_invoices to service_role;

create trigger handle_sancus_invoices_updated_at
  before update on public.sancus_invoices
  for each row execute function public.handle_updated_at();

insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do nothing;
