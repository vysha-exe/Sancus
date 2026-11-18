-- Expand notifications toward docs/notifications.md (title/body/link/category/priority).
-- Prefs stay client-side for now (full prefs/digest backend is out of this slice).

alter table public.sancus_notifications
  add column if not exists company_id uuid references public.sancus_companies(id) on delete set null,
  add column if not exists category text,
  add column if not exists priority text not null default 'info',
  add column if not exists title text,
  add column if not exists body text,
  add column if not exists link text,
  add column if not exists resolved_at timestamptz;

create index if not exists sancus_notifications_unread_idx
  on public.sancus_notifications (user_id, created_at desc)
  where read_at is null;
