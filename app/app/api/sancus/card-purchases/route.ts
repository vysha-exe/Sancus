import { NextResponse } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { createAdminContext, withAuth } from "@/lib/api/with-auth"
import { requirePermission } from "@/lib/sancus/accounts-server"
import { toEmployeeCardPurchaseDto, type EmployeeCardPurchaseRow } from "@/lib/sancus/employee-spending"
import { reserveSpendFunds } from "@/lib/sancus/spend-funding"

const schema = z.object({
  cardId: z.string().uuid(),
  merchantName: z.string().trim().min(1).max(120),
  amount: z.number().positive().max(250_000_000),
})

const zeroDecimal = new Set(["JPY"])

export const GET = withAuth(async (_req, { user, supabase }) => {
  const denied = await requirePermission(supabase, user, "activity.view")
  if (denied) return denied
  const { data, error } = await supabase.from("sancus_card_purchases").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50)
  if (error) return NextResponse.json({ error: "Could not load card purchases" }, { status: 500 })
  return NextResponse.json({ purchases: ((data ?? []) as EmployeeCardPurchaseRow[]).map(toEmployeeCardPurchaseDto) })
})

export const POST = withAuth(async (req, { user, supabase }) => {
  const denied = await requirePermission(supabase, user, "spending.manage")
  if (denied) return denied
  const parsed = await validateJsonBody(req, schema)
  if (!parsed.ok) return parsed.response

  const { data: card } = await supabase.from("sancus_cards").select("*").eq("id", parsed.data.cardId).eq("user_id", user.id).maybeSingle()
  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 })
  if (card.status !== "ACTIVE") {
    return NextResponse.json({ error: `Declined: card is ${String(card.status).toLowerCase()}` }, { status: 403 })
  }
  if (!card.company_id || !card.funding_account_id) {
    return NextResponse.json({ error: "This card is not linked to a branch operating bank account" }, { status: 409 })
  }

  const scale = zeroDecimal.has(card.currency) ? 1 : 100
  // Admin simulate: attribute to the acting user so we never violate auth.users FKs
  // when card.employee_id is a demo slug or a non-auth uuid.
  const { supabase: admin } = await createAdminContext()
  const { data, error } = await admin.from("sancus_card_purchases").insert({
    user_id: user.id,
    employee_id: user.id,
    employee_name: card.employee_name,
    card_id: card.id,
    company_id: card.company_id,
    funding_account_id: card.funding_account_id,
    merchant_name: parsed.data.merchantName,
    amount_minor: Math.round(parsed.data.amount * scale),
    currency: card.currency,
    status: "HELD",
  }).select("*").single()
  if (error || !data) return NextResponse.json({ error: "Could not create the card authorization" }, { status: 500 })
  try {
    const holdRef = `card:${data.id}`
    await reserveSpendFunds(admin, {
      accountId: card.funding_account_id,
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
