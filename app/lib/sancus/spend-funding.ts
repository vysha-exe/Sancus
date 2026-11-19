import type { SupabaseClient } from "@supabase/supabase-js"

export type SpendFundingAccount = {
  companyId: string
  companyName: string
  currency: string
  accountId: string
  bankName: string
}

export async function resolveEmployeeFundingAccount(
  supabase: SupabaseClient,
  input: { employeeId: string; companyId: string; currency: string }
): Promise<SpendFundingAccount> {
  const currency = input.currency.toUpperCase()
  if (!["USD", "SGD", "BRL", "IDR", "THB"].includes(currency)) {
    throw new Error(`${currency} branch funding is not available in this testnet demo`)
  }
  const { data: membership } = await supabase
    .from("sancus_memberships")
    .select("id")
    .eq("company_id", input.companyId)
    .eq("user_id", input.employeeId)
    .eq("status", "ACTIVE")
    .in("role", ["EMPLOYEE", "FINANCE"])
    .maybeSingle()
  if (!membership) throw new Error("The employee is not active in the selected company")

  const { data: company } = await supabase
    .from("sancus_companies")
    .select("id, name, base_currency")
    .eq("id", input.companyId)
    .maybeSingle()
  if (!company) throw new Error("The employee's company no longer exists")
  if (String(company.base_currency).toUpperCase() !== currency) {
    throw new Error(`${company.name} is funded in ${company.base_currency}, not ${currency}`)
  }

  const { data: account } = await supabase
    .from("sancus_receive_accounts")
    .select("id, bank_name, currency")
    .eq("company_id", input.companyId)
    .maybeSingle()
  if (!account) throw new Error(`${company.name} needs an operating bank account before it can fund employee spending`)
  if (String(account.currency).toUpperCase() !== currency) {
    throw new Error(`${company.name}'s operating account is funded in ${account.currency}, not ${currency}`)
  }

  return {
    companyId: company.id,
    companyName: company.name,
    currency,
    accountId: account.id,
    bankName: account.bank_name,
  }
}

export async function loadFundingAccount(
  supabase: SupabaseClient,
  input: { companyId: string; accountId: string }
): Promise<{ id: string; bankName: string; currency: string }> {
  const { data } = await supabase
    .from("sancus_receive_accounts")
    .select("id, bank_name, currency")
    .eq("id", input.accountId)
    .eq("company_id", input.companyId)
    .maybeSingle()
  if (!data) throw new Error("The issuing company's operating bank account is unavailable")
  return { id: data.id, bankName: data.bank_name, currency: data.currency }
}

export async function reserveSpendFunds(
  supabase: SupabaseClient,
  input: { accountId: string; amountMinor: bigint; ref: string; sourceType: string; sourceId?: string }
): Promise<string> {
  const { error } = await supabase.rpc("sancus_bank_create_hold", {
    p_account_id: input.accountId,
    p_amount_minor: input.amountMinor.toString(),
    p_reference: input.ref,
    p_source_type: input.sourceType,
    p_source_id: input.sourceId ?? input.ref,
  })
  if (error) throw new Error(error.message)
  return input.ref
}

export async function settleSpendFunds(supabase: SupabaseClient, input: { ref: string }): Promise<string> {
  const { error } = await supabase.rpc("sancus_bank_capture_hold", { p_reference: input.ref })
  if (error) throw new Error(error.message)
  return input.ref
}

export async function releaseSpendFunds(supabase: SupabaseClient, input: { ref: string }): Promise<string> {
  const { error } = await supabase.rpc("sancus_bank_release_hold", { p_reference: input.ref })
  if (error) throw new Error(error.message)
  return input.ref
}
