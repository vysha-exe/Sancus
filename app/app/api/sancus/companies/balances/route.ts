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

  const [wallets, deductions] = await Promise.all([
    listCompanyWallets(supabase, ids).then((records) => withBalances(records)),
    loadNodeDeductions(supabase, ids),
  ])

  return NextResponse.json({
    wallets,
    deductions: Object.fromEntries([...deductions].map(([companyId, amount]) => [companyId, amount.toString()])),
    fetchedAt: new Date().toISOString(),
  })
})
