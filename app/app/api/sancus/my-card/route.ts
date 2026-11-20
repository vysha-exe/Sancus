// Sancus: "Pay by virtual card" for employees and individuals.
//   GET  → the signed-in person's own cards (self-issued, or issued to them by their company)
//          and their recent card purchases.
//   POST → individuals can issue themselves a virtual card (Idempotency-Key header).
//          Business cards must be issued to a database employee from Team.
import { NextResponse } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { createAdminContext, withAuth } from "@/lib/api/with-auth"
import { loadAccount } from "@/lib/sancus/accounts-server"
import { toSancusCardDto, type SancusCardRow } from "@/lib/sancus/cards"
import { demoFallbacksEnabled } from "@/lib/sancus/demo-fallback"
import { isMarqetaConfigured, issueMarqetaCard, simulatedMarqetaCard } from "@/lib/sancus/rails/marqeta"
import { serviceOrUser } from "@/lib/sancus/service-client"

const schema = z.object({
  label: z.string().trim().min(1).max(60).default("Virtual card"),
  monthlyLimit: z.number().positive().max(100_000),
})

export type MyCardPurchaseDto = {
  id: string
  cardId: string | null
  merchantName: string
  amountMinor: string
  currency: string
  status: string
  txHash: string | null
  mintTxHash: string | null
  createdAt: string
}

export const GET = withAuth(async (_req, { user, supabase }) => {
  // Prefer service-role read (cards may be owned by the issuer). Fall back to the user
  // session if the service key is missing/invalid so the page still loads.
  const db = await serviceOrUser(supabase)
  const [{ data: cards, error }, { data: purchases }] = await Promise.all([
    db.from("sancus_cards").select("*").eq("employee_id", user.id).neq("status", "TERMINATED").order("created_at", { ascending: false }),
    db.from("sancus_card_purchases").select("*").eq("employee_id", user.id).order("created_at", { ascending: false }).limit(20),
  ])
  if (error) return NextResponse.json({ error: "Could not load your cards" }, { status: 500 })
  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const used = new Map<string, bigint>()
  for (const p of purchases ?? []) {
    if (!p.card_id || !["HELD", "SETTLED"].includes(p.status) || new Date(p.created_at) < monthStart) continue
    used.set(p.card_id, (used.get(p.card_id) ?? 0n) + BigInt(p.amount_minor))
  }
  return NextResponse.json({
    cards: ((cards ?? []) as SancusCardRow[]).map((c) => ({ ...toSancusCardDto(c), usedMinor: String(used.get(c.id) ?? 0n) })),
    purchases: (purchases ?? []).map(
      (p): MyCardPurchaseDto => ({
        id: p.id,
        cardId: p.card_id,
        merchantName: p.merchant_name,
        amountMinor: String(p.amount_minor),
        currency: p.currency,
        status: p.status,
        txHash: (p.provider_payload as { txHash?: string } | null)?.txHash ?? null,
        mintTxHash: (p.provider_payload as { mintTxHash?: string } | null)?.mintTxHash ?? null,
        createdAt: p.created_at,
      })
    ),
  })
})

export const POST = withAuth(async (req, { user, supabase }) => {
  const account = await loadAccount(supabase, user)
  if (account.type !== "INDIVIDUAL") {
    return NextResponse.json(
      { error: account.type === "EMPLOYEE" ? "Your card comes from your admin. Ask them to issue one from Team." : "Choose an active employee from Team before issuing a business card." },
      { status: 403 }
    )
  }
  const idempotencyKey = req.headers.get("idempotency-key")?.trim()
  if (!idempotencyKey || idempotencyKey.length > 100) return NextResponse.json({ error: "Missing Idempotency-Key header" }, { status: 400 })
  const parsed = await validateJsonBody(req, schema)
  if (!parsed.ok) return parsed.response

  const { supabase: admin } = await createAdminContext()
  const { data: replay } = await admin.from("sancus_cards").select("*").eq("user_id", user.id).eq("idempotency_key", idempotencyKey).maybeSingle()
  if (replay) return NextResponse.json({ card: toSancusCardDto(replay as SancusCardRow), replayed: true })

  const name = String(user.user_metadata?.first_name ?? user.email?.split("@")[0] ?? "Sancus")
  const lastName = String(user.user_metadata?.last_name ?? "Cardholder")
  try {
    const issued =
      isMarqetaConfigured() && !demoFallbacksEnabled()
        ? await issueMarqetaCard({ firstName: name, lastName, label: parsed.data.label, currency: "USD", monthlyLimit: parsed.data.monthlyLimit })
        : simulatedMarqetaCard(idempotencyKey)
    const { data, error } = await admin
      .from("sancus_cards")
      .insert({
        user_id: user.id,
        company_id: null,
        idempotency_key: idempotencyKey,
        employee_id: user.id,
        employee_name: name,
        label: parsed.data.label,
        country: "United States",
        currency: "USD",
        monthly_limit_minor: Math.round(parsed.data.monthlyLimit * 100),
        provider: "MARQETA",
        provider_user_token: issued.userToken,
        provider_card_token: issued.cardToken,
        velocity_control_token: issued.velocityControlToken,
        last_four: issued.lastFour,
        provider_status: issued.status,
        status: issued.status === "ACTIVE" ? "ACTIVE" : "SUSPENDED",
        simulated: issued.simulated,
      })
      .select("*")
      .single()
    if (error || !data) return NextResponse.json({ error: `The card was issued, but Sancus could not save it${error ? `: ${error.message}` : ""}` }, { status: 500 })
    return NextResponse.json({ card: toSancusCardDto(data as SancusCardRow) }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Card issuance failed" }, { status: 502 })
  }
})
