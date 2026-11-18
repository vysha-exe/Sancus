import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { useDemoFallback } from "@/lib/sancus/demo-fallback"
import { toCollectionDto, type CollectionRail } from "@/lib/sancus/local-rails"
import { createQrisCharge, mapQrisStatus } from "@/lib/sancus/rails/midtrans"
import { createPromptPayCharge, mapOmiseStatus } from "@/lib/sancus/rails/omise"
import { createPixCollection, mapPayZuStatus, simulatedPixCollection } from "@/lib/sancus/rails/payzu"

const schema = z.object({
  rail: z.enum(["QRIS", "PROMPTPAY", "PIX"]),
  amount: z.number().positive(),
  customerName: z.string().max(120).optional(),
  reference: z.string().max(120).optional(),
})

const config = {
  QRIS: { provider: "MIDTRANS", currency: "IDR", decimals: 0, min: 1_000, max: 100_000_000 },
  PROMPTPAY: { provider: "OMISE", currency: "THB", decimals: 2, min: 20, max: 150_000 },
  PIX: { provider: "PAYZU", currency: "BRL", decimals: 2, min: 1, max: 5_000 },
} as const

export const GET = withAuth(async (_req, { user, supabase }) => {
  const { data, error } = await supabase.from("sancus_collections").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50)
  if (error) return NextResponse.json({ error: "Could not load collections" }, { status: 500 })
  return NextResponse.json({ collections: (data ?? []).map(toCollectionDto) })
})

export const POST = withAuth(async (req, { user, supabase }) => {
  const key = req.headers.get("idempotency-key")?.trim()
  if (!key || key.length > 100) return NextResponse.json({ error: "Missing Idempotency-Key header" }, { status: 400 })
  const { data: replay } = await supabase.from("sancus_collections").select("*").eq("user_id", user.id).eq("idempotency_key", key).maybeSingle()
  if (replay) return NextResponse.json({ collection: toCollectionDto(replay), replayed: true })
  const parsed = await validateJsonBody(req, schema)
  if (!parsed.ok) return parsed.response
  const rail = parsed.data.rail as CollectionRail
  const c = config[rail]
  if (parsed.data.amount < c.min || parsed.data.amount > c.max) {
    return NextResponse.json({ error: `${rail} amount must be between ${c.min} and ${c.max} ${c.currency}` }, { status: 400 })
  }
  const amountMinor = Math.round(parsed.data.amount * 10 ** c.decimals)
  const reference = parsed.data.reference?.trim() || `sancus-${rail.toLowerCase()}-${randomUUID()}`

  try {
    let providerId: string, providerStatus: string, status, qrImageUrl: string | null = null, qrPayload: string | null = null
    let simulatorUrl: string | null = null, payload: Record<string, unknown>, simulated = false
    if (rail === "QRIS") {
      const result = await createQrisCharge({ orderId: reference, amountIdr: Math.round(parsed.data.amount), merchantName: parsed.data.customerName || "Sancus collection", employeeName: "Customer" })
      providerId = result.transaction.transaction_id!
      providerStatus = result.transaction.transaction_status || "pending"
      status = mapQrisStatus(providerStatus)
      qrImageUrl = result.qrImageUrl
      simulatorUrl = "https://simulator.sandbox.midtrans.com/openapi/qris/index"
      payload = result.transaction
    } else if (rail === "PROMPTPAY") {
      const result = await createPromptPayCharge({ amountSatang: amountMinor, reference })
      providerId = result.charge.id!
      providerStatus = result.charge.status || "pending"
      status = mapOmiseStatus(result.charge)
      qrImageUrl = result.qrImageUrl
      simulatorUrl = "https://dashboard.omise.co/test/charges"
      payload = result.charge
    } else {
      simulated = useDemoFallback("PAYZU_SANDBOX_TOKEN")
      const result = simulated
        ? simulatedPixCollection({ amountBrl: parsed.data.amount, reference })
        : await createPixCollection({ amountBrl: parsed.data.amount, reference })
      providerId = result.id!
      providerStatus = result.status || "PENDING"
      status = mapPayZuStatus(providerStatus)
      qrImageUrl = result.qrCodeBase64 ? `data:image/png;base64,${result.qrCodeBase64}` : null
      qrPayload = result.qrCodeText || null
      payload = { ...result, qrCodeBase64: result.qrCodeBase64 ? "[QR IMAGE]" : undefined }
    }
    const { data, error } = await supabase.from("sancus_collections").insert({
      user_id: user.id, idempotency_key: key, rail, provider: c.provider,
      customer_name: parsed.data.customerName?.trim() || null, reference,
      currency: c.currency, amount_local_minor: amountMinor, provider_transaction_id: providerId,
      provider_status: providerStatus, status, qr_image_url: qrImageUrl, qr_payload: qrPayload,
      simulator_url: simulatorUrl, provider_payload: payload, simulated,
    }).select("*").single()
    if (error || !data) return NextResponse.json({ error: "Provider charge was created, but Sancus could not save it" }, { status: 500 })
    return NextResponse.json({ collection: toCollectionDto(data) }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Collection provider failed" }, { status: 502 })
  }
})

