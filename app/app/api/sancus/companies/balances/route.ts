import { NextResponse } from "next/server"
import { withAuth } from "@/lib/api/with-auth"
import { effectiveRole, type CompanyRow, type MembershipRow } from "@/lib/sancus/companies"
import { listCompanyWallets, withBalances } from "@/lib/sancus/company-wallets"
import { loadNodeDeductions } from "@/lib/sancus/node-spend"

export const GET = withAuth(async (_req, { user, supabase }) => {
  const { data: companies, error } = await supabase
    .from("sancus_companies")
    .select("id, parent_id, root_id, name, country, base_currency, created_at")
    .order("created_at", { ascending: true })
  if (error) return NextResponse.json({ error: "Could not load company balances" }, { status: 500 })

  const allRows = (companies ?? []) as CompanyRow[]
  const allIds = allRows.map((company) => company.id)
  const { data: memberships } = allIds.length
    ? await supabase.from("sancus_memberships").select("company_id, user_id, role, status").in("company_id", allIds)
    : { data: [] }
  const membershipRows = (memberships ?? []) as MembershipRow[]
  const rows = allRows.filter((company) => effectiveRole(allRows, membershipRows, user.id, company.id).role !== null)
  const ids = rows.map((company) => company.id)

  const [wallets, deductions, bankAccounts, bankHolds] = await Promise.all([
    listCompanyWallets(supabase, ids).then((records) => withBalances(records)),
    loadNodeDeductions(supabase, ids),
    ids.length
      ? supabase.from("sancus_receive_accounts").select("id, company_id, currency, balance_minor, bank_name").in("company_id", ids)
      : Promise.resolve({ data: [] }),
    ids.length
      ? supabase.from("sancus_bank_holds").select("account_id, amount_minor").in("company_id", ids).eq("status", "ACTIVE")
      : Promise.resolve({ data: [] }),
  ])
  const heldByAccount = new Map<string, bigint>()
  for (const hold of bankHolds.data ?? []) {
    heldByAccount.set(hold.account_id, (heldByAccount.get(hold.account_id) ?? 0n) + BigInt(hold.amount_minor))
  }

  return NextResponse.json({
    wallets,
    deductions: Object.fromEntries([...deductions].map(([companyId, amount]) => [companyId, amount.toString()])),
    bankBalances: Object.fromEntries((bankAccounts.data ?? []).map((account) => {
      const posted = BigInt(account.balance_minor)
      const held = heldByAccount.get(account.id) ?? 0n
      return [account.company_id, {
        currency: String(account.currency),
        balanceMinor: (posted > held ? posted - held : 0n).toString(),
        postedMinor: posted.toString(),
        heldMinor: held.toString(),
        bankName: String(account.bank_name),
      }]
    })),
    fetchedAt: new Date().toISOString(),
  })
})
