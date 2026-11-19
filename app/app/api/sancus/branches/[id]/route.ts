import { NextResponse } from "next/server"
import { withAuth } from "@/lib/api/with-auth"
import { getCompany, idFromPath } from "@/lib/sancus/company-api"
import { listCompanyWallets, withBalances } from "@/lib/sancus/company-wallets"
import { toInternalTransferDto, type InternalTransferRow } from "@/lib/sancus/internal-transfers"
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
  const [{ data: bankAccounts }, { data: bankHolds }] = await Promise.all([
    supabase.from("sancus_receive_accounts").select("id, company_id, bank_name, account_type, account_number, currency, balance_minor").in("company_id", ids),
    supabase.from("sancus_bank_holds").select("account_id, amount_minor").in("company_id", ids).eq("status", "ACTIVE"),
  ])
  const heldByAccount = new Map<string, bigint>()
  for (const hold of bankHolds ?? []) {
    heldByAccount.set(hold.account_id, (heldByAccount.get(hold.account_id) ?? 0n) + BigInt(hold.amount_minor))
  }

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
    const bankAccount = (bankAccounts ?? []).find((item) => item.company_id === node.id) ?? null
    const postedMinor = bankAccount ? BigInt(bankAccount.balance_minor) : 0n
    const heldMinor = bankAccount ? heldByAccount.get(bankAccount.id) ?? 0n : 0n
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
      availableMinor: isRoot ? ownMinor.toString() : (postedMinor > heldMinor ? postedMinor - heldMinor : 0n).toString(),
      postedMinor: isRoot ? ownMinor.toString() : postedMinor.toString(),
      heldMinor: isRoot ? "0" : heldMinor.toString(),
      walletLiquidityMinor: ownMinor.toString(),
      wallet,
      bank: !isRoot && bankAccount ? {
        id: bankAccount.id,
        name: bankAccount.bank_name,
        label: bankAccount.account_type,
        last4: bankAccount.account_number.slice(-4),
        currency: bankAccount.currency,
        simulated: true,
      } : null,
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
