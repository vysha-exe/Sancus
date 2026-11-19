import { NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/api/with-auth"
import { validateJsonBody } from "@/lib/api/validate"
import { earnDeposit, earnWithdraw, exploreEarnVaults, getEarnError, getEarnPosition } from "@/lib/circle/earn-ops"
import { resolveRootTreasury, rootTreasuryWallet } from "@/lib/sancus/root-treasury"
import { parseToMinor, USDC_DECIMALS } from "@/lib/sancus/money"
import { postJournal, yieldAllocationJournal } from "@/lib/sancus/ledger"

const schema = z.object({
  action: z.enum(["DEPOSIT", "WITHDRAW"]),
  vaultAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  amount: z.string().regex(/^\d+(\.\d+)?$/).refine((value) => Number(value) > 0),
})

export const GET = withAuth(async (_req, { user, supabase }) => {
  const root = await resolveRootTreasury(supabase, user)
  if (!root) return NextResponse.json({ error: "Parent treasury access is required" }, { status: 403 })
  const wallet = await rootTreasuryWallet(supabase, root)
  if (!wallet) return NextResponse.json({ error: "Parent treasury wallet not found" }, { status: 409 })
  try {
    const result = await exploreEarnVaults({ asset: "USDC", sortBy: "apy", page: 1, pageSize: 100 })
    const vaults = result.vaults.filter((vault) => vault.asset.toUpperCase() === "USDC").slice(0, 6)
    const positions = await Promise.all(vaults.map((vault) => getEarnPosition(wallet.address, vault.vaultAddress)))
    const { data: activity } = await supabase.from("sancus_treasury_yield_actions").select("*").eq("company_id", root.companyId).order("created_at", { ascending: false }).limit(20)
    return NextResponse.json({ vaults, positions, activity: activity ?? [], walletId: wallet.circle_wallet_id })
  } catch (error) {
    const mapped = getEarnError(error)
    return NextResponse.json({ error: mapped.error, userMessage: mapped.userMessage }, { status: mapped.status })
  }
})

export const POST = withAuth(async (req, { user, supabase }) => {
  const key = req.headers.get("idempotency-key")?.trim()
  if (!key) return NextResponse.json({ error: "Missing Idempotency-Key header" }, { status: 400 })
  const root = await resolveRootTreasury(supabase, user)
  if (!root) return NextResponse.json({ error: "Parent treasury access is required" }, { status: 403 })
  const parsed = await validateJsonBody(req, schema)
  if (!parsed.ok) return parsed.response
  const wallet = await rootTreasuryWallet(supabase, root)
  if (!wallet) return NextResponse.json({ error: "Parent treasury wallet not found" }, { status: 409 })
  const { data: replay } = await supabase.from("sancus_treasury_yield_actions").select("*").eq("company_id", root.companyId).eq("idempotency_key", key).maybeSingle()
  if (replay) return NextResponse.json({ action: replay, replayed: true })
  const { data: intent, error: insertError } = await supabase.from("sancus_treasury_yield_actions").insert({
    user_id: user.id, company_id: root.companyId, wallet_id: wallet.circle_wallet_id,
    idempotency_key: key, action: parsed.data.action, vault_address: parsed.data.vaultAddress,
    amount: parsed.data.amount, status: "PENDING",
  }).select("*").single()
  if (insertError || !intent) return NextResponse.json({ error: insertError?.message ?? "Could not create yield action" }, { status: 500 })
  try {
    const result = parsed.data.action === "DEPOSIT"
      ? await earnDeposit(wallet.address, parsed.data.vaultAddress, parsed.data.amount)
      : await earnWithdraw(wallet.address, parsed.data.vaultAddress, parsed.data.amount)
    const { data } = await supabase.from("sancus_treasury_yield_actions").update({ status: "CONFIRMED", tx_hash: result.txHash }).eq("id", intent.id).select("*").single()
    const amountMinor = parseToMinor(result.amount, USDC_DECIMALS)
    if (amountMinor) await postJournal(supabase, yieldAllocationJournal(intent.id, parsed.data.action, amountMinor))
    return NextResponse.json({ action: data, result })
  } catch (error) {
    const mapped = getEarnError(error)
    await supabase.from("sancus_treasury_yield_actions").update({ status: "FAILED", error: mapped.userMessage }).eq("id", intent.id)
    return NextResponse.json({ error: mapped.error, userMessage: mapped.userMessage }, { status: mapped.status })
  }
})
