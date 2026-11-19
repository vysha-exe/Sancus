import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { effectiveRole, type CompanyRow, type MembershipRow } from "@/lib/sancus/companies"
import { toCollectionDto, type CollectionRail } from "@/lib/sancus/local-rails"
import { collectionRailConfig, createProviderCollection, validateCollectionAmount } from "@/lib/sancus/provider-collection"

const schema = z.object({
  rail: z.enum(["QRIS", "PROMPTPAY", "PIX"]),
  amount: z.number().positive(),
  companyId: z.string().uuid(),
  reference: z.string().max(120).optional(),
})

export const GET = withAuth(async (_req, { user, supabase }) => {
  const { data, error } = await supabase.from("sancus_collections").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50)
  if (error) return NextResponse.json({ error: "Could not load collections" }, { status: 500 })
  const companyIds = [...new Set((data ?? []).map((row) => row.company_id).filter(Boolean))] as string[]
  const { data: companies } = companyIds.length
    ? await supabase.from("sancus_companies").select("id, name").in("id", companyIds)
    : { data: [] }
  const names = new Map((companies ?? []).map((company) => [company.id, company.name]))
  return NextResponse.json({ collections: (data ?? []).map((row) => toCollectionDto(row, row.company_id ? names.get(row.company_id) ?? null : null)) })
})

export const POST = withAuth(async (req, { user, supabase }) => {
  const key = req.headers.get("idempotency-key")?.trim()
  if (!key || key.length > 100) return NextResponse.json({ error: "Missing Idempotency-Key header" }, { status: 400 })
  const { data: replay } = await supabase.from("sancus_collections").select("*").eq("user_id", user.id).eq("idempotency_key", key).maybeSingle()
  if (replay) return NextResponse.json({ collection: toCollectionDto(replay), replayed: true })
  const parsed = await validateJsonBody(req, schema)
  if (!parsed.ok) return parsed.response
  const rail = parsed.data.rail as CollectionRail
  const c = collectionRailConfig[rail]
  const [{ data: companies }, { data: memberships }] = await Promise.all([
    supabase.from("sancus_companies").select("id, parent_id, root_id, name, country, base_currency, created_at"),
    supabase.from("sancus_memberships").select("company_id, user_id, role, status"),
  ])
  const companyRows = (companies ?? []) as CompanyRow[]
  const company = companyRows.find((row) => row.id === parsed.data.companyId)
  const access = company ? effectiveRole(companyRows, (memberships ?? []) as MembershipRow[], user.id, company.id).role : null
  if (!company || !access) return NextResponse.json({ error: "You do not have access to that branch" }, { status: 403 })
  if (company.parent_id === null) return NextResponse.json({ error: "Choose a branch that receives local payments" }, { status: 400 })
  if (company.base_currency !== c.currency) return NextResponse.json({ error: `${rail} collections must be paid to a ${c.currency} branch` }, { status: 400 })
  const amountError = validateCollectionAmount(rail, parsed.data.amount)
  if (amountError) return NextResponse.json({ error: amountError }, { status: 400 })
  const reference = parsed.data.reference?.trim() || `sancus-${rail.toLowerCase()}-${randomUUID()}`

  try {
    const created = await createProviderCollection({ rail, amount: parsed.data.amount, reference, companyName: company.name })
    const { data, error } = await supabase.from("sancus_collections").insert({
      user_id: user.id, company_id: company.id, idempotency_key: key, rail, provider: created.provider,
      customer_name: null, reference,
      currency: created.currency, amount_local_minor: created.amountMinor, provider_transaction_id: created.providerId,
      provider_status: created.providerStatus, status: created.status, qr_image_url: created.qrImageUrl, qr_payload: created.qrPayload,
      simulator_url: created.simulatorUrl, provider_payload: created.payload, simulated: false,
    }).select("*").single()
    if (error || !data) return NextResponse.json({ error: "Provider charge was created, but Sancus could not save it" }, { status: 500 })
    return NextResponse.json({ collection: toCollectionDto(data, company.name) }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Collection provider failed" }, { status: 502 })
  }
})
