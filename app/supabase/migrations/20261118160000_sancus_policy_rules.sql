-- Sancus: approval toggles (two sign-offs, new recipients, after hours) saved with each policy.
-- Only newRecipients is enforced by the policy engine so far; the others are stored for later.
alter table public.sancus_policies
  add column if not exists rules jsonb not null default '{"twoSignoffs":true,"newRecipients":true,"afterHours":false}'::jsonb;

alter table public.sancus_company_policies
  add column if not exists rules jsonb not null default '{"twoSignoffs":true,"newRecipients":true,"afterHours":false}'::jsonb;
