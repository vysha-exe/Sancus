-- Attribute inbound local QR collections to the branch receiving the funds.
alter table public.sancus_collections
  add column if not exists company_id uuid references public.sancus_companies(id) on delete set null;

create index if not exists sancus_collections_company_created_idx
  on public.sancus_collections (company_id, created_at desc);
