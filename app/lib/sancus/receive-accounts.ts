import type { SupabaseClient } from "@supabase/supabase-js"
import type { CompanyRow } from "./companies"

export type ReceiveAccount = {
  companyId: string
  bankName: string
  accountName: string
  accountNumber: string
  accountType: string
  routingLabel: string
  routingValue: string
  currency: string
  balanceMinor: string
  postedMinor: string
  heldMinor: string
  provider: string
  simulated: boolean
}

export type ReceiveAccountRow = {
  id: string
  company_id: string
  bank_name: string
  account_name: string
  account_number: string
  account_type: string
  routing_label: string
  routing_value: string
  currency: string
  balance_minor: number | string
  provider: string
  simulated: boolean
}

type BankPreset = Pick<ReceiveAccount, "bankName" | "routingLabel" | "routingValue">

const BANK_BY_COUNTRY: Record<string, BankPreset> = {
  SG: { bankName: "DBS Bank", routingLabel: "Bank / branch code", routingValue: "7171-001" },
  ID: { bankName: "Bank Central Asia", routingLabel: "Bank code", routingValue: "014" },
  TH: { bankName: "Kasikornbank", routingLabel: "Bank code", routingValue: "004" },
  BR: { bankName: "Itaú Unibanco", routingLabel: "ISPB", routingValue: "60701190" },
  US: { bankName: "JPMorgan Chase", routingLabel: "Routing number", routingValue: "021000021" },
  GB: { bankName: "Barclays", routingLabel: "Sort code", routingValue: "20-00-00" },
  AU: { bankName: "Commonwealth Bank", routingLabel: "BSB", routingValue: "062-000" },
  MY: { bankName: "Maybank", routingLabel: "Bank code", routingValue: "MBBEMYKL" },
  PH: { bankName: "BDO Unibank", routingLabel: "SWIFT / BIC", routingValue: "BNORPHMM" },
  VN: { bankName: "Vietcombank", routingLabel: "SWIFT / BIC", routingValue: "BFTVVNVX" },
  HK: { bankName: "HSBC Hong Kong", routingLabel: "Clearing code", routingValue: "004" },
  JP: { bankName: "MUFG Bank", routingLabel: "Bank / branch code", routingValue: "0005-001" },
  KR: { bankName: "KB Kookmin Bank", routingLabel: "Bank code", routingValue: "004" },
  TW: { bankName: "CTBC Bank", routingLabel: "Bank code", routingValue: "822" },
  CN: { bankName: "Bank of China", routingLabel: "CNAPS code", routingValue: "104100000004" },
  IN: { bankName: "HDFC Bank", routingLabel: "IFSC", routingValue: "HDFC0000001" },
}

function deterministicAccountNumber(companyId: string) {
  const translated = companyId.replaceAll("-", "").toLowerCase().replace(/[a-f]/g, (letter) => String(letter.charCodeAt(0) - 96))
  return translated.replace(/\D/g, "").slice(0, 12).padEnd(12, "0")
}

/** Visible fallback while the receive-account migration is being applied. */
export function sandboxReceiveAccount(company: { id: string; name: string; country: string; currency: string }): ReceiveAccount {
  const preset = BANK_BY_COUNTRY[company.country] ?? {
    bankName: "Local operating bank",
    routingLabel: "SWIFT / BIC",
    routingValue: "SANCUS00",
  }
  return {
    companyId: company.id,
    bankName: preset.bankName,
    accountName: company.name,
    accountNumber: deterministicAccountNumber(company.id),
    accountType: "Operating account",
    routingLabel: preset.routingLabel,
    routingValue: preset.routingValue,
    currency: company.currency,
    balanceMinor: "0",
    postedMinor: "0",
    heldMinor: "0",
    provider: "Sancus sandbox",
    simulated: true,
  }
}

const RECEIVE_ACCOUNT_COLUMNS = "id, company_id, bank_name, account_name, account_number, account_type, routing_label, routing_value, currency, balance_minor, provider, simulated"

/**
 * Return the branch operating account, creating its deterministic sandbox
 * account when an older branch predates the database seed trigger.
 */
export async function ensureCompanyReceiveAccount(
  supabase: SupabaseClient,
  company: Pick<CompanyRow, "id" | "name" | "country" | "base_currency">
): Promise<ReceiveAccountRow> {
  const existing = await supabase
    .from("sancus_receive_accounts")
    .select(RECEIVE_ACCOUNT_COLUMNS)
    .eq("company_id", company.id)
    .maybeSingle()
  if (existing.data) return existing.data as ReceiveAccountRow
  if (existing.error) throw new Error(existing.error.message)

  const fallback = sandboxReceiveAccount({
    id: company.id,
    name: company.name,
    country: company.country,
    currency: company.base_currency,
  })
  const inserted = await supabase
    .from("sancus_receive_accounts")
    .insert({
      company_id: company.id,
      bank_name: fallback.bankName,
      account_name: fallback.accountName,
      account_number: fallback.accountNumber,
      account_type: fallback.accountType,
      routing_label: fallback.routingLabel,
      routing_value: fallback.routingValue,
      currency: fallback.currency,
      provider: fallback.provider,
      simulated: fallback.simulated,
    })
    .select(RECEIVE_ACCOUNT_COLUMNS)
    .single()
  if (inserted.data) return inserted.data as ReceiveAccountRow

  // Another concurrent request may have created the unique company account.
  if (inserted.error?.code === "23505") {
    const replay = await supabase
      .from("sancus_receive_accounts")
      .select(RECEIVE_ACCOUNT_COLUMNS)
      .eq("company_id", company.id)
      .single()
    if (replay.data) return replay.data as ReceiveAccountRow
  }
  throw new Error(inserted.error?.message ?? "Could not create the branch operating bank account")
}
