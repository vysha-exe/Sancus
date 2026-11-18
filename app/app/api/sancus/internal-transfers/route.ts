import { NextResponse } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { getCompany } from "@/lib/sancus/company-api"
import {
  branchBank,
  executeInternalTransfer,
  fixedRate,
  isLocalCurrency,
  localMinorForUsdc,
  toInternalTransferDto,
  type InternalTransferRow,
} from "@/lib/sancus/internal-transfers"
import { evaluatePayout, loadCompanyPolicy, spentToday } from "@/lib/sancus/policy"

const createSchema = z.object({
  sourceCompanyId: z.string().uuid(),
  destinationCompanyId: z.string().uuid(),
  amountUsdc: z.number().positive().max(200_000),
  memo: z.string().trim().max(140).optional(),
})

async function roleAt(
  supabase: Parameters<Parameters<typeof withAuth>[0]>[1]["supabase"],
  userId: string,
  companyId: string
) {
  const { data } = await supabase.rpc("sancus_effective_role", { p_user: userId, p_company: companyId })
  return typeof data === "string" ? data : null
}

async function walletFor(
  supabase: Parameters<Parameters<typeof withAuth>[0]>[1]["supabase"],
  companyId: string
) {
  const { data } = await supabase
    .from("wallets")
    .select("circle_wallet_id, address, blockchain, name")
    .eq("company_id", companyId)
    .eq("blockchain", "ARC-TESTNET")
    .eq("type", "treasury")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  return data
}

async function namesFor(
  supabase: Parameters<Parameters<typeof withAuth>[0]>[1]["supabase"],
  rows: InternalTransferRow[]
) {
  const ids = Array.from(new Set(rows.flatMap((row) => [row.source_company_id, row.destination_company_id])))
  if (!ids.length) return new Map<string, string>()
  const { data } = await supabase.from("sancus_companies").select("id, name").in("id", ids)
  return new Map((data ?? []).map((company) => [company.id as string, company.name as string]))
}

export const GET = withAuth(async (req, { supabase }) => {
  const companyId = req.nextUrl.searchParams.get("companyId")
  if (companyId && !z.string().uuid().safeParse(companyId).success) {
    return NextResponse.json({ error: "Invalid branch id" }, { status: 400 })
  }

  let query = supabase
    .from("sancus_internal_transfers")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100)
  if (companyId) query = query.or(`source_company_id.eq.${companyId},destination_company_id.eq.${companyId}`)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: "Could not load internal transfers" }, { status: 500 })

  const rows = (data ?? []) as InternalTransferRow[]
  const names = await namesFor(supabase, rows)
  return NextResponse.json({
    transfers: rows.map((row) =>
      toInternalTransferDto(row, {
        source: names.get(row.source_company_id),
        destination: names.get(row.destination_company_id),
      })
    ),
  })
})

export const POST = withAuth(async (req, { user, supabase }) => {
  const key = req.headers.get("idempotency-key")?.trim()
  if (!key || key.length > 100) {
    return NextResponse.json({ error: "Missing Idempotency-Key header" }, { status: 400 })
  }

  const { data: replay } = await supabase
    .from("sancus_internal_transfers")
    .select("*")
    .eq("user_id", user.id)
    .eq("idempotency_key", key)
    .maybeSingle()
  if (replay) return NextResponse.json({ transfer: toInternalTransferDto(replay as InternalTransferRow), replayed: true })

  const parsed = await validateJsonBody(req, createSchema)
  if (!parsed.ok) return parsed.response
  const { sourceCompanyId, destinationCompanyId, amountUsdc, memo } = parsed.data
  if (sourceCompanyId === destinationCompanyId) {
    return NextResponse.json({ error: "Choose a different destination" }, { status: 400 })
  }

  const [source, destination] = await Promise.all([
    getCompany(supabase, sourceCompanyId),
    getCompany(supabase, destinationCompanyId),
  ])
  if (!source || !destination) return NextResponse.json({ error: "Branch not found" }, { status: 404 })
  if (source.root_id !== destination.root_id) {
    return NextResponse.json({ error: "Internal transfers must stay inside the same company" }, { status: 400 })
  }

  const [sourceRole, destinationRole] = await Promise.all([
    roleAt(supabase, user.id, source.id),
    roleAt(supabase, user.id, destination.id),
  ])
  if (!sourceRole || !["OWNER", "ADMIN", "FINANCE"].includes(sourceRole) || !destinationRole) {
    return NextResponse.json({ error: "You do not have access to move money between these accounts" }, { status: 403 })
  }

  const [sourceWallet, destinationWallet] = await Promise.all([
    walletFor(supabase, source.id),
    walletFor(supabase, destination.id),
  ])
  if (!sourceWallet || !destinationWallet) {
    return NextResponse.json({ error: "Both accounts need an Arc treasury wallet" }, { status: 409 })
  }

  const sourceCurrency = source.parent_id ? source.base_currency : "USDC"
  const destinationCurrency = destination.parent_id ? destination.base_currency : "USDC"
  if (source.parent_id && !isLocalCurrency(sourceCurrency)) {
    return NextResponse.json({ error: `${source.name} does not have a supported local settlement token yet` }, { status: 409 })
  }
  if (destination.parent_id && !isLocalCurrency(destinationCurrency)) {
    return NextResponse.json({ error: `${destination.name} does not have a supported local settlement token yet` }, { status: 409 })
  }

  const usdcAmountMinor = BigInt(Math.round(amountUsdc * 1_000_000))
  const sourceAmountMinor = localMinorForUsdc(usdcAmountMinor, sourceCurrency)
  const destinationAmountMinor = localMinorForUsdc(usdcAmountMinor, destinationCurrency)
  const policy = await loadCompanyPolicy(supabase, source.id, user.id)
  const { data: todayTransfers } = await supabase
    .from("sancus_internal_transfers")
    .select("usdc_amount_minor, status")
    .eq("source_company_id", source.id)
    .gte("created_at", new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString())
  const internalSpent = (todayTransfers ?? [])
    .filter((row) => !["DECLINED", "FAILED", "EXPIRED", "REVERSED"].includes(row.status))
    .reduce((sum, row) => sum + BigInt(row.usdc_amount_minor), 0n)
  const evaluation = evaluatePayout({
    policy,
    amountMinor: usdcAmountMinor,
    recipient: { name: destination.name, proxyValue: destination.id },
    spentTodayMinor: (await spentToday(supabase, user.id)) + internalSpent,
  })
  if (evaluation.decision === "BLOCK") {
    return NextResponse.json({ error: evaluation.reason ?? "This transfer is outside the account policy" }, { status: 403 })
  }

  const bank = source.parent_id ? branchBank(source.country, sourceWallet.address) : null
  const status = evaluation.decision === "NEEDS_APPROVAL" ? "PENDING_APPROVAL" : "QUEUED"
  const { data: inserted, error } = await supabase
    .from("sancus_internal_transfers")
    .insert({
      user_id: user.id,
      root_company_id: source.root_id,
      source_company_id: source.id,
      destination_company_id: destination.id,
      idempotency_key: key,
      memo: memo || null,
      source_currency: sourceCurrency,
      destination_currency: destinationCurrency,
      usdc_amount_minor: usdcAmountMinor.toString(),
      source_amount_minor: sourceAmountMinor.toString(),
      destination_amount_minor: destinationAmountMinor.toString(),
      source_rate: String(fixedRate(sourceCurrency)),
      destination_rate: String(fixedRate(destinationCurrency)),
      source_wallet_id: sourceWallet.circle_wallet_id,
      source_address: sourceWallet.address,
      destination_wallet_id: destinationWallet.circle_wallet_id,
      destination_address: destinationWallet.address,
      source_bank_name: bank?.name ?? null,
      source_bank_label: bank?.label ?? null,
      source_bank_last4: bank?.last4 ?? null,
      status,
      approval_reason: evaluation.reason,
      simulated: Boolean(source.parent_id || destination.parent_id),
    })
    .select("*")
    .single()

  if (error || !inserted) {
    if (error?.code === "23505") {
      const { data } = await supabase
        .from("sancus_internal_transfers")
        .select("*")
        .eq("user_id", user.id)
        .eq("idempotency_key", key)
        .maybeSingle()
      if (data) return NextResponse.json({ transfer: toInternalTransferDto(data as InternalTransferRow), replayed: true })
    }
    return NextResponse.json({ error: error?.message ?? "Could not create the transfer" }, { status: 500 })
  }

  let row = inserted as InternalTransferRow
  if (status === "PENDING_APPROVAL") {
    await supabase.from("sancus_notifications").insert({
      user_id: user.id,
      type: "approval.requested",
      payload: { internalTransferId: row.id, sourceCompanyId, destinationCompanyId },
    })
    return NextResponse.json(
      { transfer: toInternalTransferDto(row, { source: source.name, destination: destination.name }), needsApproval: true },
      { status: 201 }
    )
  }

  row = await executeInternalTransfer(supabase, row)
  return NextResponse.json(
    { transfer: toInternalTransferDto(row, { source: source.name, destination: destination.name }) },
    { status: row.status === "FAILED" ? 502 : 201 }
  )
})
