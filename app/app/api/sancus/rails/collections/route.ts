// Sancus: local-rail collections (QRIS / PromptPay / Pix sandboxes → mock stablecoin mint).
//   GET  → your recent collections; pending ones are refreshed (and minted once paid)
//   POST → { rail, amountMinor } creates a sandbox charge and returns its QR
import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { createCharge, RAIL_INFO, railConfigured, type LocalRail } from "@/lib/sancus/local-sandboxes"
import { MOCK_TOKENS, railBotConfigured } from "@/lib/sancus/mock-tokens"
import { refreshCollection, resolveDestination, toApi, type CollectionRow } from "@/lib/sancus/rail-collections"

const createSchema = z.object({
  rail: z.enum(["QRIS", "PROMPTPAY", "PIX"]),
  amountMinor: z.union([z.string().regex(/^\d+$/), z.number().int().positive()]),
})

export const GET = withAuth(async (_req, { supabase }) => {
  const { data, error } = await supabase
    .from("sancus_rail_collections")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20)
  if (error) return NextResponse.json({ error: "Could not load collections" }, { status: 500 })
  const rows = await Promise.all(
    ((data ?? []) as CollectionRow[]).map((r) => (r.status === "PENDING" || r.status === "PAID" ? refreshCollection(supabase, r) : r))
  )
  return NextResponse.json({
    railBot: railBotConfigured(),
    rails: (Object.keys(RAIL_INFO) as LocalRail[]).map((rail) => ({
      rail,
      ...RAIL_INFO[rail],
      minMinor: RAIL_INFO[rail].minMinor.toString(),
      maxMinor: RAIL_INFO[rail].maxMinor.toString(),
      configured: railConfigured(rail),
      token: MOCK_TOKENS[RAIL_INFO[rail].currency],
    })),
    collections: rows.map(toApi),
  })
})

export const POST = withAuth(async (req, { user, supabase }) => {
  if (!railBotConfigured()) return NextResponse.json({ error: "Rail bot isn't set up (MOCK_RAIL_MINTER_KEY)" }, { status: 503 })
  const parsed = await validateJsonBody(req, createSchema)
  if (!parsed.ok) return parsed.response
  const rail = parsed.data.rail as LocalRail
  const info = RAIL_INFO[rail]
  const amount = BigInt(parsed.data.amountMinor)
  if (amount < info.minMinor || amount > info.maxMinor) {
    return NextResponse.json({ error: `Amount must be between ${info.minMinor / 100n} and ${info.maxMinor / 100n} ${info.currency}` }, { status: 400 })
  }
  if (!railConfigured(rail)) return NextResponse.json({ error: `${info.label} sandbox key isn't set` }, { status: 503 })

  const destination = await resolveDestination(supabase, user.id, rail)
  if (!destination) return NextResponse.json({ error: "No branch bank account is available for this local rail." }, { status: 409 })

  const reference = `sancus-${rail.toLowerCase()}-${randomUUID().slice(0, 12)}`
  let charge
  try {
    charge = await createCharge(rail, amount, reference)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sandbox charge failed" }, { status: 502 })
  }

  const { data, error } = await supabase
    .from("sancus_rail_collections")
    .insert({
      user_id: user.id,
      company_id: destination.companyId,
      receive_account_id: destination.receiveAccountId,
      rail,
      currency: info.currency,
      amount_minor: amount.toString(),
      provider: charge.provider,
      provider_ref: charge.providerRef,
      status: charge.status,
      simulated: charge.simulated,
      qr_image_url: charge.qrImageUrl,
      qr_payload: charge.qrPayload,
      simulator_url: charge.simulatorUrl,
      destination_address: destination.address,
      destination_label: destination.label,
      token_address: MOCK_TOKENS[info.currency].address,
    })
    .select()
    .single()
  if (error || !data) {
    console.error("Failed to save collection", error)
    return NextResponse.json({ error: "Charge created but couldn't be saved" }, { status: 500 })
  }
  return NextResponse.json({ collection: toApi(data as CollectionRow) }, { status: 201 })
})
