import { NextResponse } from "next/server"
import { withAuth } from "@/lib/api/with-auth"
import { getCompany, idFromPath } from "@/lib/sancus/company-api"
import { listCompanyWallets, withBalances } from "@/lib/sancus/company-wallets"
import { branchBank, toInternalTransferDto, type InternalTransferRow } from "@/lib/sancus/internal-transfers"
import { toPayoutDto, type PayoutRow } from "@/lib/sancus/payouts"
import { serviceClient } from "@/lib/sancus/service-client"

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

  // The company's other accounts are listed with the service client (a branch admin can't see HQ, but
  // may send money there). Balances and wallets are only shown for accounts this user can access.
  const db = serviceClient() ?? supabase
  const { data: companies } = await db
    .from("sancus_companies")
    .select("id, parent_id, root_id, name, country, base_currency, created_at")
    .eq("root_id", company.root_id)
    .order("created_at", { ascending: true })
  const visibleNodes = (companies ?? []).filter(
    (node) => node.id === company.root_id || node.parent_id === company.root_id
  )
  const access = new Map(
    await Promise.all(
      visibleNodes.map(async (node) => {
        const [{ data: canSee }, { data: role }] = await Promise.all([
          supabase.rpc("sancus_can_access_company", { p_user: user.id, p_company: node.id }),
          supabase.rpc("sancus_effective_role", { p_user: user.id, p_company: node.id }),
        ])
        const canSendFrom = typeof role === "string" && ["OWNER", "ADMIN", "FINANCE"].includes(role)
        return [node.id as string, { canSee: Boolean(canSee), canSendFrom }] as const
      })
    )
  )
  const ids = visibleNodes.map((node) => node.id as string).filter((id) => access.get(id)?.canSee)
  const wallets = await withBalances(await listCompanyWallets(supabase, ids))

  const [transfersRes, payoutsRes, membersRes] = await Promise.all([
    // Every transfer in or out of this branch, including ones to accounts this user can't see.
    db
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
    const { canSee = false, canSendFrom = false } = access.get(node.id as string) ?? {}
    return {
      id: node.id,
      name: node.name,
      country: isRoot ? null : node.country,
      currency: isRoot ? "USDC" : node.base_currency,
      isRoot,
      /** False: name only (no balance or wallet), e.g. HQ seen from a branch admin. */
      canSee,
      /** This user may move money out of this account. */
      canSendFrom,
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
