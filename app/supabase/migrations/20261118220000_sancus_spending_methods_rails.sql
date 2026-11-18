-- Allow QRIS / PromptPay (and simulated CARD) spending methods alongside Pix.
alter table public.sancus_spending_methods
  drop constraint if exists sancus_spending_methods_method_type_check;
alter table public.sancus_spending_methods
  add constraint sancus_spending_methods_method_type_check
  check (method_type in ('PIX', 'QRIS', 'PROMPTPAY', 'CARD'));

alter table public.sancus_spending_methods
  drop constraint if exists sancus_spending_methods_currency_check;
alter table public.sancus_spending_methods
  add constraint sancus_spending_methods_currency_check
  check (currency in ('BRL', 'IDR', 'THB', 'USD'));

alter table public.sancus_spending_methods
  drop constraint if exists sancus_spending_methods_provider_check;
alter table public.sancus_spending_methods
  add constraint sancus_spending_methods_provider_check
  check (provider in ('PAYZU', 'MIDTRANS', 'OMISE', 'MARQETA', 'SIMULATED'));
