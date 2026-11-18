import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { requirePermission } from "@/lib/sancus/accounts-server"
import {
  createXenditPayout,
  isXenditConfigured,
  mapXenditStatus,
  sanitizeXenditPayout,
} from "@/lib/sancus/rails/xendit"
import { maskAccountNumber, toXenditPayoutDto, type XenditPayoutRow } from "@/lib/sancus/xendit-payouts"

const railConfig = {
  PROMPTPAY: { country: "TH", currency: "THB", decimals: 2, min: 1, max: 2_000_000 },
  BI_FAST: { country: "ID", currency: "IDR", decimals: 0, min: 10_000, max: 250_000_000 },
  INSTAPAY: { country: "PH", currency: "PHP", decimals: 2, min: 1, max: 50_000 },
  PESONET: { country: "PH", currency: "PHP", decimals: 2, min: 1, max: 10_000_000 },
} as const

const schema = z.object({
  purpose: z.enum(["EMPLOYEE_SPEND", "SUPPLIER_PAYMENT"]).default("EMPLOYEE_SPEND"),
  employeeName: z.string().trim().max(120).optional(),
  rail: z.enum(["PROMPTPAY", "BI_FAST", "INSTAPAY", "PESONET"]),
  recipientName: z.string().trim().min(1).max(120),
  accountNumber: z.string().trim().min(4).max(64),
  routingType: z.enum(["SWIFT", "WALLET", "MOBILE_NO", "NATIONAL_ID"]),
  routingValue: z.string().trim().min(2).max(64),
  amount: z.number().positive(),
  description: z.string().trim().max(100).optional(),
})

export const GET = withAuth(async (_req, { user, supabase }) => {
  const { data, error } = await supabase
    .from("sancus_xendit_payouts")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ error: "Could not load Xendit payouts" }, { status: 500 })
  return NextResponse.json({
    configured: isXenditConfigured(),
    payouts: ((data ?? []) as XenditPayoutRow[]).map(toXenditPayoutDto),
  })
})

export const POST = withAuth(async (req, { user, supabase }) => {
  const denied = await requirePermission(supabase, user, "money.send")
  if (denied) return denied
  const idempotencyKey = req.headers.get("idempotency-key")?.trim()
  if (!idempotencyKey || idempotencyKey.length > 100) {
    return NextResponse.json({ error: "Missing Idempotency-Key header" }, { status: 400 })
  }
  const { data: replay } = await supabase
    .from("sancus_xendit_payouts")
    .select("*")
    .eq("user_id", user.id)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle()
  if (replay) return NextResponse.json({ payout: toXenditPayoutDto(replay as XenditPayoutRow), replayed: true })

  const parsed = await validateJsonBody(req, schema)
  if (!parsed.ok) return parsed.response
  if (!isXenditConfigured()) {
    return NextResponse.json({ error: "Add a Xendit development key to enable sandbox payouts" }, { status: 503 })
  }

  const c = railConfig[parsed.data.rail]
  if (parsed.data.amount < c.min || parsed.data.amount > c.max) {
    return NextResponse.json({ error: `${parsed.data.rail} amount must be between ${c.min} and ${c.max} ${c.currency}` }, { status: 400 })
  }
  const amountMinor = Math.round(parsed.data.amount * 10 ** c.decimals)
  const reference = `sancus-xendit-${randomUUID()}`

  try {
    const payout = await createXenditPayout({
      idempotencyKey,
      referenceId: reference,
      country: c.country,
      currency: c.currency,
      recipientName: parsed.data.recipientName,
      accountNumber: parsed.data.accountNumber,
      routingType: parsed.data.routingType,
      routingValue: parsed.data.routingValue,
      amountMinor,
      relationship: parsed.data.purpose === "EMPLOYEE_SPEND" ? "EMPLOYEE" : "SUPPLIER",
      description: parsed.data.description,
    })
    const providerStatus = payout.status || "ACCEPTED"
    const status = mapXenditStatus(providerStatus)
    const { data, error } = await supabase.from("sancus_xendit_payouts").insert({
      user_id: user.id,
      idempotency_key: idempotencyKey,
      purpose: parsed.data.purpose,
      employee_name: parsed.data.employeeName || null,
      country: c.country,
      rail: parsed.data.rail,
      currency: c.currency,
      recipient_name: parsed.data.recipientName,
      account_number_masked: maskAccountNumber(parsed.data.accountNumber),
      routing_type: parsed.data.routingType,
      routing_value: parsed.data.routingValue,
      amount_minor: amountMinor,
      description: parsed.data.description || null,
      provider_transaction_id: payout.payout_id,
      provider_status: providerStatus,
      status,
      failure_reason: payout.failure_code || null,
      provider_payload: sanitizeXenditPayout(payout),
      simulated: true,
      settled_at: status === "SETTLED" ? payout.updated || new Date().toISOString() : null,
    }).select("*").single()
    if (error || !data) {
      return NextResponse.json({ error: "Xendit created the payout, but Sancus could not save it" }, { status: 500 })
    }
    return NextResponse.json({ payout: toXenditPayoutDto(data as XenditPayoutRow) }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Xendit payout failed" }, { status: 502 })
  }
})
