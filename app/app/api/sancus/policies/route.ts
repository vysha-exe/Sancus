// Sancus: read / update the account's spending policy.
import { NextResponse } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { parseToMinor, USDC_DECIMALS } from "@/lib/sancus/money"
import { loadPolicy, serializePolicy } from "@/lib/sancus/policy"

export const GET = withAuth(async (_req, { user, supabase }) => {
  const policy = await loadPolicy(supabase, user.id)
  return NextResponse.json({ policy: serializePolicy(policy) })
})

/** Amounts are USD decimal strings, e.g. "1000" or "2500.50". All fields optional. */
const bodySchema = z.object({
  approvalThreshold: z.string().max(20).optional(),
  perPaymentLimit: z.string().max(20).optional(),
  dailyLimit: z.string().max(20).optional(),
  blockedRecipients: z.array(z.string().min(1).max(140)).max(200).optional(),
})

export const PUT = withAuth(async (req, { user, supabase }) => {
  const parsed = await validateJsonBody(req, bodySchema)
  if (!parsed.ok) return parsed.response

  const current = await loadPolicy(supabase, user.id)
  const toMinor = (v: string | undefined, fallback: bigint, field: string) => {
    if (v === undefined) return { ok: true as const, value: fallback }
    const m = parseToMinor(v, USDC_DECIMALS)
    return m === null || m <= 0n
      ? { ok: false as const, issue: { field, message: "Enter a positive dollar amount" } }
      : { ok: true as const, value: m }
  }

  const threshold = toMinor(parsed.data.approvalThreshold, current.approvalThresholdMinor, "approvalThreshold")
  const perPayment = toMinor(parsed.data.perPaymentLimit, current.perPaymentLimitMinor, "perPaymentLimit")
  const daily = toMinor(parsed.data.dailyLimit, current.dailyLimitMinor, "dailyLimit")
  const issues = [threshold, perPayment, daily].flatMap((r) => (r.ok ? [] : [r.issue]))
  if (issues.length) return NextResponse.json({ error: "Invalid policy", issues }, { status: 400 })
  if (!threshold.ok || !perPayment.ok || !daily.ok) return NextResponse.json({ error: "Invalid policy" }, { status: 400 })

  if (perPayment.value > daily.value) {
    return NextResponse.json(
      { error: "Per-payment limit can't be higher than the daily limit", issues: [{ field: "perPaymentLimit", message: "Higher than the daily limit" }] },
      { status: 400 }
    )
  }

  const { error } = await supabase.from("sancus_policies").upsert({
    user_id: user.id,
    approval_threshold_minor: threshold.value.toString(),
    per_payment_limit_minor: perPayment.value.toString(),
    daily_limit_minor: daily.value.toString(),
    blocked_recipients: parsed.data.blockedRecipients ?? current.blockedRecipients,
  })
  if (error) {
    console.error("Failed to save policy", error)
    return NextResponse.json({ error: "Could not save policy" }, { status: 500 })
  }

  return NextResponse.json({ policy: serializePolicy(await loadPolicy(supabase, user.id)) })
})
