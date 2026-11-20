// Sancus: pay with your own virtual card (tap to pay at a merchant).
//   POST { cardId, merchantName, amount } → authorises against the card's monthly limit, then
//   settles: the dollar amount moves onchain on Arc from the paying balance (personal, or the
//   company / branch the card belongs to) to its settlement wallet, and the purchase records the hash.
// Company-issued employee cards use the employee spending flow (limits, branch funding account),
// so those are forwarded to /api/sancus/employee/card-purchases.
import { NextResponse } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { createAdminContext, withAuth } from "@/lib/api/with-auth"
import { fundLocalRailOnchain } from "@/lib/sancus/local-rail-onchain"

const schema = z.object({
  cardId: z.string().uuid(),
  merchantName: z.string().trim().min(1).max(120),
  amount: z.number().positive().max(100_000),
})

export const POST = withAuth(async (req, { user }) => {
  const parsed = await validateJsonBody(req, schema)
  if (!parsed.ok) return parsed.response
  const { supabase: admin } = await createAdminContext()
  const { data: card } = await admin.from("sancus_cards").select("*").eq("id", parsed.data.cardId).eq("employee_id", user.id).maybeSingle()
  if (!card) return NextResponse.json({ error: "This card isn't yours" }, { status: 404 })
  if (card.status !== "ACTIVE") return NextResponse.json({ error: `Declined: card is ${String(card.status).toLowerCase()}` }, { status: 403 })

  // Employee cards issued by a company: per-payment and daily limits, branch funding account.
  if (card.funding_account_id) {
    const cookie = req.headers.get("cookie") ?? ""
    const auth = await fetch(new URL("/api/sancus/employee/card-purchases", req.nextUrl.origin), {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ methodId: card.id, source: "CARD", merchantName: parsed.data.merchantName, amount: parsed.data.amount }),
    })
    const authBody = await auth.json().catch(() => ({}))
    if (!auth.ok) return NextResponse.json({ error: authBody.error ?? "Declined" }, { status: auth.status })
    const settle = await fetch(new URL(`/api/sancus/employee/card-purchases/${authBody.purchase.id}/settle`, req.nextUrl.origin), { method: "POST", headers: { cookie } })
    const settleBody = await settle.json().catch(() => ({}))
    return NextResponse.json({ purchase: settleBody.purchase ?? authBody.purchase }, { status: settle.ok ? 201 : 202 })
  }

  // Self-issued cards: monthly limit, then settle onchain.
  const amountMinor = Math.round(parsed.data.amount * 100)
  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const { data: month } = await admin
    .from("sancus_card_purchases")
    .select("amount_minor")
    .eq("card_id", card.id)
    .in("status", ["HELD", "SETTLED"])
    .gte("created_at", monthStart.toISOString())
  const used = (month ?? []).reduce((s, p) => s + Number(p.amount_minor), 0)
  if (used + amountMinor > Number(card.monthly_limit_minor)) {
    return NextResponse.json({ error: "Declined: this purchase is over your card's monthly limit" }, { status: 403 })
  }

  let txHash: string | null = null
  let mintTxHash: string | null = null
  try {
    const onchain = await fundLocalRailOnchain(admin, user.id, card.company_id ?? null, {
      currency: "USD",
      amountMinor,
      decimals: 2,
      ref: `card:${card.id}`,
    })
    txHash = onchain?.txHash ?? null
    mintTxHash = onchain?.mintTxHash ?? null
  } catch (error) {
    await admin.from("sancus_card_purchases").insert({
      user_id: card.user_id,
      employee_id: user.id,
      employee_name: card.employee_name,
      card_id: card.id,
      company_id: card.company_id,
      merchant_name: parsed.data.merchantName,
      amount_minor: amountMinor,
      currency: "USD",
      status: "DECLINED",
      decline_reason: error instanceof Error ? error.message : "Insufficient balance",
      provider: "MARQETA",
      simulated: true,
      provider_payload: {},
      funding_status: "UNFUNDED",
    })
    return NextResponse.json({ error: `Declined: ${error instanceof Error ? error.message : "insufficient balance"}` }, { status: 409 })
  }

  const now = new Date().toISOString()
  const { data, error } = await admin
    .from("sancus_card_purchases")
    .insert({
      user_id: card.user_id,
      employee_id: user.id,
      employee_name: card.employee_name,
      card_id: card.id,
      company_id: card.company_id,
      merchant_name: parsed.data.merchantName,
      amount_minor: amountMinor,
      currency: "USD",
      status: "SETTLED",
      settled_at: now,
      provider: "MARQETA",
      simulated: true,
      provider_payload: { txHash, mintTxHash, network: "ARC-TESTNET" },
      funding_status: "SETTLED",
      funding_amount_minor: amountMinor,
    })
    .select("*")
    .single()
  if (error || !data) return NextResponse.json({ error: "Paid, but the purchase couldn't be saved" }, { status: 500 })
  return NextResponse.json(
    {
      purchase: {
        id: data.id,
        cardId: card.id,
        merchantName: data.merchant_name,
        amountMinor: String(data.amount_minor),
        currency: data.currency,
        status: data.status,
        txHash,
        mintTxHash,
        createdAt: data.created_at,
      },
    },
    { status: 201 }
  )
})
