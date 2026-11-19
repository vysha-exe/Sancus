-- The seed helper is an internal trigger/backfill primitive. Prevent API roles
-- from invoking the SECURITY DEFINER function with a fabricated company row.
revoke all on function public.sancus_seed_receive_account(public.sancus_companies) from public;
revoke all on function public.sancus_seed_receive_account(public.sancus_companies) from anon;
revoke all on function public.sancus_seed_receive_account(public.sancus_companies) from authenticated;
grant execute on function public.sancus_seed_receive_account(public.sancus_companies) to service_role;
