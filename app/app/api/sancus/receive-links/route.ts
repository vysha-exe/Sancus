import { NextResponse } from "next/server"
import { withAuth } from "@/lib/api/with-auth"
import { effectiveRole, type CompanyRow, type MembershipRow } from "@/lib/sancus/companies"
import { collectionRailConfig } from "@/lib/sancus/provider-collection"
import type { CollectionRail } from "@/lib/sancus/local-rails"
import { sandboxReceiveAccount, type ReceiveAccount } from "@/lib/sancus/receive-accounts"

type ReceiveRail = CollectionRail | "USDC"

type ReceiveLinkRow = {
  id: string
  company_id: string
  rail: ReceiveRail
  public_token: string
  active: boolean
  created_at: string
}

type ReceiveAccountRow = {
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

function toReceiveAccount(row: ReceiveAccountRow, heldMinor = 0n): ReceiveAccount {
  const postedMinor = BigInt(row.balance_minor)
  return {
    companyId: row.company_id,
    bankName: row.bank_name,
    accountName: row.account_name,
    accountNumber: row.account_number,
    accountType: row.account_type,
    routingLabel: row.routing_label,
    routingValue: row.routing_value,
    currency: row.currency,
    balanceMinor: (postedMinor > heldMinor ? postedMinor - heldMinor : 0n).toString(),
    postedMinor: postedMinor.toString(),
    heldMinor: heldMinor.toString(),
    provider: row.provider,
    simulated: row.simulated,
  }
}

export const GET = withAuth(async (_request, { user, supabase }) => {
  const [{ data: companies }, { data: memberships }] = await Promise.all([
    supabase.from("sancus_companies").select("id, parent_id, root_id, name, country, base_currency, created_at"),
    supabase.from("sancus_memberships").select("company_id, user_id, role, status"),
  ])
  const companyRows = (companies ?? []) as CompanyRow[]
  const membershipRows = (memberships ?? []) as MembershipRow[]
  const accessibleIds = companyRows
    .filter((company) => effectiveRole(companyRows, membershipRows, user.id, company.id).role !== null)
    .map((company) => company.id)
  if (!accessibleIds.length) return NextResponse.json({ links: [] })

  const [{ data: links, error }, { data: accounts, error: accountsError }, { data: holds }] = await Promise.all([
    supabase
      .from("sancus_receive_links")
      .select("id, company_id, rail, public_token, active, created_at")
      .in("company_id", accessibleIds)
      .eq("active", true)
      .order("created_at"),
    supabase
      .from("sancus_receive_accounts")
      .select("company_id, bank_name, account_name, account_number, account_type, routing_label, routing_value, currency, balance_minor, provider, simulated")
      .in("company_id", accessibleIds),
    supabase
      .from("sancus_bank_holds")
      .select("company_id, amount_minor")
      .in("company_id", accessibleIds)
      .eq("status", "ACTIVE"),
  ])
  if (error) return NextResponse.json({ error: "Could not load static receive links" }, { status: 500 })
  if (accountsError) console.warn("receive accounts unavailable; using sandbox projection", accountsError.message)

  const rows = (links ?? []) as ReceiveLinkRow[]
  const companyById = new Map(companyRows.map((company) => [company.id, company]))
  const heldByCompany = new Map<string, bigint>()
  for (const hold of holds ?? []) {
    heldByCompany.set(hold.company_id, (heldByCompany.get(hold.company_id) ?? 0n) + BigInt(hold.amount_minor))
  }
  const accountByCompany = new Map(((accounts ?? []) as ReceiveAccountRow[]).map((account) => [
    account.company_id,
    toReceiveAccount(account, heldByCompany.get(account.company_id) ?? 0n),
  ]))

  return NextResponse.json({
    links: rows.flatMap((row) => {
      const company = companyById.get(row.company_id)
      if (!company) return []
      const currency = row.rail === "USDC" ? "USDC" : collectionRailConfig[row.rail].currency
      const bankAccount = accountByCompany.get(company.id) ?? sandboxReceiveAccount({
        id: company.id,
        name: company.name,
        country: company.country,
        currency: company.base_currency,
      })
      return [{
        id: row.id,
        companyId: row.company_id,
        companyName: company.name,
        companyCurrency: company.base_currency,
        rail: row.rail,
        currency,
        publicToken: row.public_token,
        bankAccount,
        createdAt: row.created_at,
      }]
    }),
  })
})
