import { NextResponse } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { getCompany } from "@/lib/sancus/company-api"
import {
  executeInternalTransfer,
  fixedRate,
  localMinorForUsdc,
  toInternalTransferDto,
  type InternalTransferRow,
} from "@/lib/sancus/internal-transfers"
import { evaluatePayout, loadCompanyPolicy, spentToday } from "@/lib/sancus/policy"
import { loadAccount } from "@/lib/sancus/accounts-server"
import { notifyApprovers } from "@/lib/sancus/approval-notify"
import { serviceOrUser } from "@/lib/sancus/service-client"
import { ensureCompanyReceiveAccount } from "@/lib/sancus/receive-accounts"
import type { CompanyRow } from "@/lib/sancus/companies"
import {
  bankMinorFromTransportMinor,
  fixedFxEnabled,
  quoteFixedFx,
  transportMinorFromBankMinor,
} from "@/lib/sancus/mock-fx"

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

async function bankAccountFor(
  supabase: Parameters<Parameters<typeof withAuth>[0]>[1]["supabase"],
  company: CompanyRow
) {
  const account = await ensureCompanyReceiveAccount(supabase, company)
  if (account.currency !== company.base_currency) return null
  return {
    id: account.id,
    bank_name: account.bank_name,
    account_label: account.account_type,
    account_last4: account.account_number.slice(-4),
    currency: account.currency,
  }
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

export const GET = withAuth(async (req, { user, supabase }) => {
  const companyId = req.nextUrl.searchParams.get("companyId")
  if (companyId && !z.string().uuid().safeParse(companyId).success) {
    return NextResponse.json({ error: "Invalid branch id" }, { status: 400 })
  }

  // A transfer belongs to both of its accounts. The table's RLS only shows rows where the user can
  // access BOTH ends, which hid a branch admin's own transfers to HQ (they have no role at HQ).
  // List with the service client instead, limited to transfers touching an account where this user
  // has a treasury-facing role. Employees only see their own requests (Me), never treasury moves.
  const { data: visible } = await supabase.from("sancus_companies").select("id")
  const visibleIds = ((visible ?? []) as { id: string }[]).map((company) => company.id)
  const accessible = (
    await Promise.all(
      visibleIds.map(async (id) => {
        const role = await roleAt(supabase, user.id, id)
        return role && role !== "EMPLOYEE" ? id : null
      })
    )
  ).filter((id): id is string => id !== null)
  const ids = companyId ? accessible.filter((id) => id === companyId) : accessible
  if (!ids.length) return NextResponse.json({ transfers: [] })

  const db = await serviceOrUser(supabase)
  const list = ids.join(",")
  const { data, error } = await db
    .from("sancus_internal_transfers")
    .select("*")
    .or(`source_company_id.in.(${list}),destination_company_id.in.(${list})`)
    .order("created_at", { ascending: false })
    .limit(100)
  if (error) {
    // Bad service key already falls back above; still fail soft if RLS hides the table.
    const retry = db === supabase ? null : await supabase
      .from("sancus_internal_transfers")
      .select("*")
      .or(`source_company_id.in.(${list}),destination_company_id.in.(${list})`)
      .order("created_at", { ascending: false })
      .limit(100)
    if (!retry || retry.error) return NextResponse.json({ error: "Could not load internal transfers" }, { status: 500 })
    const rows = (retry.data ?? []) as InternalTransferRow[]
    const names = await namesFor(supabase, rows)
    return NextResponse.json({
      transfers: rows.map((row) =>
        toInternalTransferDto(row, {
          source: names.get(row.source_company_id),
          destination: names.get(row.destination_company_id),
        })
      ),
    })
  }

  const rows = (data ?? []) as InternalTransferRow[]
  // Names of the other end (e.g. HQ seen from a branch) are shown by name only, as on the branch page.
  const names = await namesFor(db, rows)
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

  const db = await serviceOrUser(supabase)
  const { data: replay } = await db
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

  // Who may move money: anyone who manages the SOURCE (owner/admin/finance there) may send it to any
  // other account in the same company, e.g. a branch admin sending to HQ. The money never leaves the
  // company. The destination may be outside what they can see, so it's looked up with the service
  // client, but only after the source check passes.
  const source = await getCompany(supabase, sourceCompanyId)
  if (!source) return NextResponse.json({ error: "Branch not found" }, { status: 404 })
  const sourceRole = await roleAt(supabase, user.id, source.id)
  if (!sourceRole || !["OWNER", "ADMIN", "FINANCE"].includes(sourceRole)) {
    return NextResponse.json({ error: "You do not have access to move money out of this account" }, { status: 403 })
  }
  const destination = await getCompany(db, destinationCompanyId)
  if (!destination) return NextResponse.json({ error: "Branch not found" }, { status: 404 })
  if (source.root_id !== destination.root_id) {
    return NextResponse.json({ error: "Internal transfers must stay inside the same company" }, { status: 400 })
  }

  // The global admin has no limits: their internal moves skip the spending policy entirely.
  const account = await loadAccount(supabase, user)
  const globalAdmin = account.type === "ADMIN" && account.manageableCompanyIds().includes(source.id)

  const sourceCurrency = source.parent_id ? source.base_currency : "USDC"
  const destinationCurrency = destination.parent_id ? destination.base_currency : "USDC"
  const [sourceWallet, destinationWallet, sourceBank, destinationBank] = await Promise.all([
    walletFor(supabase, source.id),
    walletFor(db, destination.id),
    source.parent_id ? bankAccountFor(db, source) : Promise.resolve(null),
    destination.parent_id ? bankAccountFor(db, destination) : Promise.resolve(null),
  ])
  if (!sourceWallet || !destinationWallet) {
    return NextResponse.json({ error: "Both accounts need an Arc treasury wallet" }, { status: 409 })
  }

  if (source.parent_id && !sourceBank) {
    return NextResponse.json({ error: `${source.name} needs a ${sourceCurrency} operating bank account` }, { status: 409 })
  }
  if (destination.parent_id && !destinationBank) {
    return NextResponse.json({ error: `${destination.name} needs a ${destinationCurrency} operating bank account` }, { status: 409 })
  }

  const usdcAmountMinor = BigInt(Math.round(amountUsdc * 1_000_000))
  const sourceAmountMinor = localMinorForUsdc(usdcAmountMinor, sourceCurrency)
  if (!fixedFxEnabled()) {
    return NextResponse.json({ error: "Fixed FX is not configured on Arc testnet" }, { status: 503 })
  }
  let destinationAmountMinor: bigint
  try {
    const sourceTokenMinor = source.parent_id
      ? transportMinorFromBankMinor(sourceCurrency, sourceAmountMinor)
      : usdcAmountMinor
    const destinationTokenMinor = quoteFixedFx(sourceCurrency, destinationCurrency, sourceTokenMinor)
    destinationAmountMinor = destination.parent_id
      ? bankMinorFromTransportMinor(destinationCurrency, destinationTokenMinor)
      : destinationTokenMinor
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "This FX corridor is not supported" }, { status: 409 })
  }
  let evaluation: { decision: "ALLOW" | "NEEDS_APPROVAL" | "BLOCK"; reason: string | null } = { decision: "ALLOW", reason: null }
  if (!globalAdmin) {
    const policy = await loadCompanyPolicy(supabase, source.id, user.id)
    const { data: todayTransfers } = await db
      .from("sancus_internal_transfers")
      .select("usdc_amount_minor, status")
      .eq("source_company_id", source.id)
      .gte("created_at", new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString())
    const internalSpent = (todayTransfers ?? [])
      .filter((row) => !["DECLINED", "FAILED", "EXPIRED", "REVERSED"].includes(row.status))
      .reduce((sum, row) => sum + BigInt(row.usdc_amount_minor), 0n)
    evaluation = evaluatePayout({
      policy,
      amountMinor: usdcAmountMinor,
      recipient: { name: destination.name, proxyValue: destination.id },
      spentTodayMinor: (await spentToday(supabase, user.id)) + internalSpent,
    })
    if (evaluation.decision === "BLOCK") {
      return NextResponse.json({ error: evaluation.reason ?? "This transfer is outside the account policy" }, { status: 403 })
    }
  }

  const status = evaluation.decision === "NEEDS_APPROVAL" ? "PENDING_APPROVAL" : "QUEUED"
  // Written with the service client: a branch admin can't see (so RLS can't check) the destination.
  const { data: inserted, error } = await db
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
      source_bank_account_id: sourceBank?.id ?? null,
      destination_bank_account_id: destinationBank?.id ?? null,
      source_bank_name: sourceBank?.bank_name ?? null,
      source_bank_label: sourceBank?.account_label ?? null,
      source_bank_last4: sourceBank?.account_last4 ?? null,
      status,
      approval_reason: evaluation.reason,
      simulated: Boolean(source.parent_id || destination.parent_id),
    })
    .select("*")
    .single()

  if (error || !inserted) {
    if (error?.code === "23505") {
      const { data } = await db
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
    // Tell the company's admins (not the requester) that a transfer is waiting for them.
    await notifyApprovers({
      requesterId: user.id,
      companyId: source.id,
      title: `Approve transfer: ${source.name} → ${destination.name}`,
      body: evaluation.reason ?? "Needs your approval",
      payload: { internalTransferId: row.id, sourceCompanyId, destinationCompanyId },
    })
    return NextResponse.json(
      { transfer: toInternalTransferDto(row, { source: source.name, destination: destination.name }), needsApproval: true },
      { status: 201 }
    )
  }

  row = await executeInternalTransfer(db, row)
  return NextResponse.json(
    { transfer: toInternalTransferDto(row, { source: source.name, destination: destination.name }) },
    { status: row.status === "FAILED" ? 502 : 201 }
  )
})
