import type { SupabaseClient } from "@supabase/supabase-js"
import { effectiveRole, type CompanyRow, type MembershipRow } from "./companies"

export type RegionalBalanceDto = {
  country: "BR"
  currency: "BRL"
  openingMinor: string
  inboundMinor: string
  outboundMinor: string
  availableMinor: string
  updatedAt: string
}

export async function getRegionalBalance(supabase: SupabaseClient, userId: string): Promise<RegionalBalanceDto> {
  const [{ data: companies }, { data: memberships }] = await Promise.all([
    supabase.from("sancus_companies").select("id, parent_id, root_id, name, country, base_currency, created_at"),
    supabase.from("sancus_memberships").select("company_id, user_id, role, status"),
  ])
  const companyRows = (companies ?? []) as CompanyRow[]
  const membershipRows = (memberships ?? []) as MembershipRow[]
  const brazil = companyRows.find((company) =>
    company.country === "BR" && effectiveRole(companyRows, membershipRows, userId, company.id).role !== null
  )
  if (!brazil) throw new Error("No accessible Brazil operating account")

  const { data: account, error: accountError } = await supabase
    .from("sancus_receive_accounts")
    .select("id, balance_minor")
    .eq("company_id", brazil.id)
    .eq("currency", "BRL")
    .maybeSingle()
  if (accountError || !account) throw new Error("Could not load the Brazil operating account")

  const [{ data: entries, error: entriesError }, { data: holds, error: holdsError }] = await Promise.all([
    supabase.from("sancus_bank_entries").select("direction, amount_minor, entry_type").eq("account_id", account.id),
    supabase.from("sancus_bank_holds").select("amount_minor").eq("account_id", account.id).eq("status", "ACTIVE"),
  ])
  if (entriesError || holdsError) throw new Error("Could not calculate the Brazil operating balance")

  const opening = (entries ?? [])
    .filter((entry) => entry.entry_type === "OPENING_BALANCE")
    .reduce((sum, entry) => sum + BigInt(entry.amount_minor), 0n)
  const inbound = (entries ?? [])
    .filter((entry) => entry.direction === "CREDIT" && entry.entry_type !== "OPENING_BALANCE")
    .reduce((sum, entry) => sum + BigInt(entry.amount_minor), 0n)
  const outbound = (entries ?? [])
    .filter((entry) => entry.direction === "DEBIT")
    .reduce((sum, entry) => sum + BigInt(entry.amount_minor), 0n)
  const held = (holds ?? []).reduce((sum, hold) => sum + BigInt(hold.amount_minor), 0n)
  const posted = BigInt(account.balance_minor)
  return {
    country: "BR",
    currency: "BRL",
    openingMinor: opening.toString(),
    inboundMinor: inbound.toString(),
    outboundMinor: outbound.toString(),
    availableMinor: (posted > held ? posted - held : 0n).toString(),
    updatedAt: new Date().toISOString(),
  }
}
