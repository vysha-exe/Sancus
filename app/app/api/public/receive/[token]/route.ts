import { randomUUID } from "node:crypto"
import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { z } from "zod"
import { toCollectionDto, type CollectionRail } from "@/lib/sancus/local-rails"
import { collectionRailConfig, createProviderCollection, validateCollectionAmount } from "@/lib/sancus/provider-collection"

const amountSchema = z.object({ amount: z.number().positive() })

function adminClient() {
  let url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  if (!url) {
    const connection = process.env.DBL_CONNECTION_STRING?.trim() || process.env.DB_CONNECTION_STRING?.trim() || process.env.DATABASE_URL?.trim()
    if (connection) {
      try {
        const parsed = new URL(connection)
        const hostRef = parsed.hostname.match(/^db\.([a-z0-9-]+)\.supabase\.co$/i)?.[1]
        const userRef = decodeURIComponent(parsed.username).match(/^postgres\.([a-z0-9-]+)$/i)?.[1]
        const ref = hostRef || userRef
        if (ref) url = `https://${ref}.supabase.co`
      } catch {
        // The configuration error below is clearer than exposing the connection parse failure.
      }
    }
  }
  const key = process.env.SUPABASE_SECRET_KEY?.trim()
  if (!url || !key) throw new Error("Public receive links require Supabase admin configuration")
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function loadLink(token: string) {
  const supabase = adminClient()
  const { data: link } = await supabase
    .from("sancus_receive_links")
    .select("id, company_id, rail, public_token, owner_user_id, active")
    .eq("public_token", token)
    .eq("active", true)
    .maybeSingle()
  if (!link) return { supabase, link: null, company: null }
  const { data: company } = await supabase
    .from("sancus_companies")
    .select("id, name, base_currency")
    .eq("id", link.company_id)
    .maybeSingle()
  return { supabase, link, company }
}

async function loadUsdcAddress(supabase: ReturnType<typeof adminClient>, companyId: string) {
  const { data } = await supabase
    .from("wallets")
    .select("address")
    .eq("company_id", companyId)
    .not("address", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  return typeof data?.address === "string" ? data.address : null
}

export async function GET(_request: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params
    if (!z.string().uuid().safeParse(token).success) return NextResponse.json({ error: "Receive link not found" }, { status: 404 })
    const { supabase, link, company } = await loadLink(token)
    if (!link || !company) return NextResponse.json({ error: "Receive link not found" }, { status: 404 })
    if (link.rail === "USDC") {
      const walletAddress = await loadUsdcAddress(supabase, company.id)
      return NextResponse.json({
        receiveLink: {
          companyName: company.name,
          rail: "USDC",
          currency: "USDC",
          walletAddress,
        },
      })
    }
    const rail = link.rail as CollectionRail
    const config = collectionRailConfig[rail]
    return NextResponse.json({
      receiveLink: {
        companyName: company.name,
        rail,
        currency: config.currency,
        minAmount: config.min,
        maxAmount: config.max,
      },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Receive link unavailable" }, { status: 503 })
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params
    if (!z.string().uuid().safeParse(token).success) return NextResponse.json({ error: "Receive link not found" }, { status: 404 })
    const idempotencyKey = request.headers.get("idempotency-key")?.trim()
    if (!idempotencyKey || idempotencyKey.length > 100) return NextResponse.json({ error: "Missing Idempotency-Key header" }, { status: 400 })
    const parsed = amountSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: "Enter a valid amount" }, { status: 400 })

    const { supabase, link, company } = await loadLink(token)
    if (!link || !company) return NextResponse.json({ error: "Receive link not found" }, { status: 404 })
    if (link.rail === "USDC") return NextResponse.json({ error: "Send USDC directly to the wallet address shown on this page" }, { status: 400 })
    const rail = link.rail as CollectionRail
    const amountError = validateCollectionAmount(rail, parsed.data.amount)
    if (amountError) return NextResponse.json({ error: amountError }, { status: 400 })

    const { data: replay } = await supabase
      .from("sancus_collections")
      .select("*")
      .eq("user_id", link.owner_user_id)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle()
    if (replay) return NextResponse.json({ collection: toCollectionDto(replay, company.name), replayed: true })

    const reference = `public-${rail.toLowerCase()}-${randomUUID()}`
    const created = await createProviderCollection({ rail, amount: parsed.data.amount, reference, companyName: company.name })
    const { data, error } = await supabase.from("sancus_collections").insert({
      user_id: link.owner_user_id,
      company_id: company.id,
      idempotency_key: idempotencyKey,
      rail,
      provider: created.provider,
      customer_name: null,
      reference,
      currency: created.currency,
      amount_local_minor: created.amountMinor,
      provider_transaction_id: created.providerId,
      provider_status: created.providerStatus,
      status: created.status,
      qr_image_url: created.qrImageUrl,
      qr_payload: created.qrPayload,
      simulator_url: created.simulatorUrl,
      provider_payload: created.payload,
      simulated: false,
    }).select("*").single()
    if (error || !data) return NextResponse.json({ error: "The provider QR was created, but Sancus could not save it" }, { status: 500 })
    return NextResponse.json({ collection: toCollectionDto(data, company.name) }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create payment QR" }, { status: 502 })
  }
}
