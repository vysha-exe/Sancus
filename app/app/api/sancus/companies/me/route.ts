// Sancus: every company tree the signed-in user can see, with roles, wallets and live balances.
import { NextResponse } from "next/server"
import { withAuth } from "@/lib/api/with-auth"
import { buildCompanyTree, countNodes, effectiveRole, type CompanyRow, type MembershipRow } from "@/lib/sancus/companies"
import { listCompanyWallets, withBalances } from "@/lib/sancus/company-wallets"
import { loadNodeDeductions } from "@/lib/sancus/node-spend"
import { circleConfigured } from "@/lib/sancus/provision"

export const GET = withAuth(async (_req, { user, supabase }) => {
  // This can run with the service-role client for simple login, so filter explicitly.
  const { data: companies, error } = await supabase
    .from("sancus_companies")
    .select("id, parent_id, root_id, name, country, base_currency, created_at")
    .order("created_at", { ascending: true })
  if (error) {
    console.error("Failed to load companies", error)
    return NextResponse.json({ error: "Could not load your companies" }, { status: 500 })
  }
  const allRows = (companies ?? []) as CompanyRow[]
  const allIds = allRows.map((c) => c.id)

  const { data: memberships } = allIds.length
    ? await supabase.from("sancus_memberships").select("company_id, user_id, role, status").in("company_id", allIds)
    : { data: [] }
  const membershipRows = (memberships ?? []) as MembershipRow[]
  const rows = allRows.filter((company) => effectiveRole(allRows, membershipRows, user.id, company.id).role !== null)
  const ids = rows.map((company) => company.id)
  const [wallets, deductions] = await Promise.all([
    listCompanyWallets(supabase, ids).then(withBalances),
    // Payments each node made on simulated legs (same rule as the dashboard balance).
    loadNodeDeductions(supabase, ids),
  ])
  const tree = buildCompanyTree(rows, membershipRows, wallets, user.id, deductions)

  return NextResponse.json({
    circleConfigured: circleConfigured(),
    tree,
    nodeCount: countNodes(tree),
    walletCount: wallets.length,
  })
})
