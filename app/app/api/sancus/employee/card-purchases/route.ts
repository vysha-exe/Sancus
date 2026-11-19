import { NextResponse } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { createAdminContext, withAuth } from "@/lib/api/with-auth"
import { loadAccount } from "@/lib/sancus/accounts-server"
import { toEmployeeCardPurchaseDto, type EmployeeCardPurchaseRow } from "@/lib/sancus/employee-spending"
import { FIXED_USD_RATES } from "@/lib/sancus/fixed-rates"
import { reserveSpendFunds } from "@/lib/sancus/spend-funding"

const schema = z.object({
  methodId: z.string().uuid(),
  source: z.enum(["CARD", "SPENDING_METHOD"]),
  merchantName: z.string().trim().min(1).max(120),
  amount: z.number().positive().max(250_000_000),
})

const zeroDecimal = new Set(["JPY"])
const monthStart = () => {
  const value = new Date()
  value.setUTCDate(1)
  value.setUTCHours(0, 0, 0, 0)
  return value.toISOString()
}
const dayStart = () => {
  const value = new Date()
  value.setUTCHours(0, 0, 0, 0)
  return value.toISOString()
}

export const GET = withAuth(async (_req, { user, supabase }) => {
  const account = await loadAccount(supabase, user)
  if (account.type !== "EMPLOYEE") return NextResponse.json({ error: "Employee login required" }, { status: 403 })
  const { supabase: admin } = await createAdminContext()
  const { data, error } = await admin
    .from("sancus_card_purchases")
    .select("*")
    .eq("employee_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30)
  if (error) return NextResponse.json({ error: "Could not load card purchases" }, { status: 500 })
  return NextResponse.json({ purchases: ((data ?? []) as EmployeeCardPurchaseRow[]).map(toEmployeeCardPurchaseDto) })
})

export const POST = withAuth(async (req, { user, supabase }) => {
  const account = await loadAccount(supabase, user)
  if (account.type !== "EMPLOYEE") return NextResponse.json({ error: "Employee login required" }, { status: 403 })
  const parsed = await validateJsonBody(req, schema)
  if (!parsed.ok) return parsed.response
  const { supabase: admin } = await createAdminContext()

  const table = parsed.data.source === "CARD" ? "sancus_cards" : "sancus_spending_methods"
  const { data: method } = await admin.from(table).select("*").eq("id", parsed.data.methodId).eq("employee_id", user.id).maybeSingle()
  if (!method) return NextResponse.json({ error: "This card is not assigned to your login" }, { status: 404 })
  if (parsed.data.source === "CARD" && method.status !== "ACTIVE") {
    return NextResponse.json({ error: `Declined: card is ${String(method.status).toLowerCase()}` }, { status: 403 })
  }
  if (parsed.data.source === "SPENDING_METHOD" && (method.method_type !== "CARD" || method.status !== "ACTIVE")) {
    return NextResponse.json({ error: `Declined: card access is ${String(method.status).toLowerCase()}` }, { status: 403 })
  }
  if (!method.company_id || !method.funding_account_id) {
    return NextResponse.json({ error: "This card is not linked to a branch operating bank account" }, { status: 409 })
  }

  const currency = String(method.currency)
  const scale = zeroDecimal.has(currency) ? 1 : 100
  const amountMinor = Math.round(parsed.data.amount * scale)
  const rate = FIXED_USD_RATES[currency as keyof typeof FIXED_USD_RATES]
  if (!rate) return NextResponse.json({ error: `Unsupported card currency: ${currency}` }, { status: 400 })
  const usdMicro = BigInt(Math.round((parsed.data.amount / rate) * 1_000_000))

  const [{ data: membership }, { data: monthPurchases }, { data: todayPurchases }] = await Promise.all([
    admin.from("sancus_memberships").select("per_payment_limit_minor, daily_limit_minor").eq("user_id", user.id).eq("status", "ACTIVE").limit(1).maybeSingle(),
    admin.from("sancus_card_purchases").select("amount_minor").eq(parsed.data.source === "CARD" ? "card_id" : "spending_method_id", parsed.data.methodId).in("status", ["HELD", "SETTLED"]).gte("created_at", monthStart()),
    admin.from("sancus_card_purchases").select("amount_minor, currency").eq("employee_id", user.id).in("status", ["HELD", "SETTLED"]).gte("created_at", dayStart()),
  ])
  const perPayment = membership?.per_payment_limit_minor == null ? null : BigInt(membership.per_payment_limit_minor)
  if (perPayment != null && usdMicro > perPayment) {
    return NextResponse.json({ error: "Declined: this purchase exceeds your per-payment limit" }, { status: 403 })
  }
  const monthlyUsed = (monthPurchases ?? []).reduce((sum, purchase) => sum + BigInt(purchase.amount_minor), 0n)
  if (monthlyUsed + BigInt(amountMinor) > BigInt(method.monthly_limit_minor)) {
    return NextResponse.json({ error: "Declined: this purchase exceeds your card's monthly limit" }, { status: 403 })
  }
  const dailyUsed = (todayPurchases ?? []).reduce((sum, purchase) => {
    const purchaseCurrency = String(purchase.currency) as keyof typeof FIXED_USD_RATES
    const purchaseScale = zeroDecimal.has(purchaseCurrency) ? 1 : 100
    const purchaseRate = FIXED_USD_RATES[purchaseCurrency] ?? 1
    return sum + BigInt(Math.round((Number(purchase.amount_minor) / purchaseScale / purchaseRate) * 1_000_000))
  }, 0n)
  const dailyLimit = membership?.daily_limit_minor == null ? null : BigInt(membership.daily_limit_minor)
  if (dailyLimit != null && dailyUsed + usdMicro > dailyLimit) {
    return NextResponse.json({ error: "Declined: this purchase exceeds your daily limit" }, { status: 403 })
  }

  const { data, error } = await admin.from("sancus_card_purchases").insert({
    user_id: method.user_id,
    employee_id: user.id,
    employee_name: method.employee_name,
    card_id: parsed.data.source === "CARD" ? method.id : null,
    spending_method_id: parsed.data.source === "SPENDING_METHOD" ? method.id : null,
    company_id: method.company_id,
    funding_account_id: method.funding_account_id,
    merchant_name: parsed.data.merchantName,
    amount_minor: amountMinor,
    currency,
    status: "HELD",
  }).select("*").single()
  if (error || !data) return NextResponse.json({ error: "Could not create the card authorization" }, { status: 500 })
  try {
    const holdRef = `card:${data.id}`
    await reserveSpendFunds(admin, {
      accountId: method.funding_account_id,
      amountMinor: BigInt(data.amount_minor),
      ref: holdRef,
      sourceType: "CARD_PURCHASE",
      sourceId: data.id,
    })
    await admin.from("sancus_card_purchases").update({
      funding_status: "HELD", funding_amount_minor: String(data.amount_minor), funding_hold_tx_hash: holdRef,
    }).eq("id", data.id)
  } catch (cause) {
    await admin.from("sancus_card_purchases").update({
      status: "DECLINED", funding_status: "UNFUNDED",
      decline_reason: cause instanceof Error ? cause.message : "Insufficient bank balance",
    }).eq("id", data.id)
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Insufficient bank balance" }, { status: 409 })
  }
  return NextResponse.json({ purchase: toEmployeeCardPurchaseDto(data as EmployeeCardPurchaseRow) }, { status: 201 })
})
