import { NextResponse } from "next/server"
import { withAuth } from "@/lib/api/with-auth"
import { getCompany, idFromPath } from "@/lib/sancus/company-api"
import { listCompanyWallets, withBalances } from "@/lib/sancus/company-wallets"
import { branchBank, toInternalTransferDto, type InternalTransferRow } from "@/lib/sancus/internal-transfers"
import { toPayoutDto, type PayoutRow } from "@/lib/sancus/payouts"

export const GET = withAuth(async (req, { user, supabase }) => {
  const companyId = idFromPath(req.nextUrl.pathname, "branches")
  if (!companyId) return NextResponse.json({ error: "Invalid branch id" }, { status: 400 })

  const company = await getCompany(supabase, companyId)
  if (!company) return NextResponse.json({ error: "Branch not found" }, { status: 404 })
  const { data: allowed } = await supabase.rpc("sancus_can_access_company", {
    p_user: user.id,
    p_company: company.id,
  })
  if (!allowed) return NextResponse.json({ error: "No access to this branch" }, { status: 403 })

  const { data: companies } = await supabase
    .from("sancus_companies")
    .select("id, parent_id, root_id, name, country, base_currency, created_at")
    .eq("root_id", company.root_id)
    .order("created_at", { ascending: true })
  const visibleNodes = (companies ?? []).filter(
    (node) => node.id === company.root_id || node.parent_id === company.root_id
  )
  const ids = visibleNodes.map((node) => node.id as string)
  const wallets = await withBalances(await listCompanyWallets(supabase, ids))

  const [transfersRes, payoutsRes, membersRes] = await Promise.all([
    supabase
      .from("sancus_internal_transfers")
      .select("*")
      .or(`source_company_id.eq.${company.id},destination_company_id.eq.${company.id}`)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("sancus_payouts")
      .select("*")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("sancus_memberships")
      .select("id, user_id, invited_email, role, status, per_payment_limit_minor")
      .eq("company_id", company.id)
      .neq("status", "DISABLED")
      .order("created_at", { ascending: true }),
  ])

  const names = new Map(visibleNodes.map((node) => [node.id as string, node.name as string]))
  const transfers = ((transfersRes.data ?? []) as InternalTransferRow[]).map((row) =>
    toInternalTransferDto(row, {
      source: names.get(row.source_company_id),
      destination: names.get(row.destination_company_id),
    })
  )

  const accounts = visibleNodes.map((node) => {
    const ownWallets = wallets.filter((wallet) => wallet.companyId === node.id)
    const ownMinor = ownWallets.reduce(
      (sum, wallet) => sum + (wallet.usdcMinor ? BigInt(wallet.usdcMinor) : 0n),
      0n
    )
    const wallet = ownWallets[0] ?? null
    const isRoot = node.id === company.root_id
    return {
      id: node.id,
      name: node.name,
      country: isRoot ? null : node.country,
      currency: isRoot ? "USDC" : node.base_currency,
      isRoot,
      availableMinor: ownMinor.toString(),
      wallet,
      bank: !isRoot && wallet ? branchBank(node.country, wallet.address) : null,
    }
  })
  const account = accounts.find((item) => item.id === company.id)!

  return NextResponse.json({
    branch: account,
    sources: accounts.filter((item) => item.id !== company.id),
    transfers,
    payouts: ((payoutsRes.data ?? []) as PayoutRow[]).map(toPayoutDto),
    members: membersRes.data ?? [],
  })
})
