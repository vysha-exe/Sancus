// Development-only receive-flow probe. It behaves like a customer scanning a
// reusable branch QR: choose an amount, record the paid rail event, then run the
// real Arc testnet mint used by the production collection workflow.
import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/api/with-auth"
import { validateJsonBody } from "@/lib/api/validate"
import { effectiveRole, type CompanyRow, type MembershipRow } from "@/lib/sancus/companies"
import { RAIL_INFO, type LocalRail } from "@/lib/sancus/local-sandboxes"
import { MOCK_TOKENS } from "@/lib/sancus/mock-tokens"
import { refreshCollection, toApi, type CollectionRow } from "@/lib/sancus/rail-collections"

const schema = z.object({
  rail: z.enum(["QRIS", "PROMPTPAY", "PIX"]),
  companyId: z.string().uuid(),
  amountMinor: z.union([z.string().regex(/^\d+$/), z.number().int().positive()]),
})

function enabled() {
  return process.env.NODE_ENV !== "production" || process.env.SANCUS_ENABLE_DEV_ENDPOINTS === "true"
}

export const POST = withAuth(async (req, { user, supabase }) => {
  if (!enabled()) return NextResponse.json({ error: "Dev payment tools are disabled" }, { status: 404 })
  const parsed = await validateJsonBody(req, schema)
  if (!parsed.ok) return parsed.response
  const rail = parsed.data.rail as LocalRail
  const info = RAIL_INFO[rail]
  const amountMinor = BigInt(parsed.data.amountMinor)
  if (amountMinor < info.minMinor || amountMinor > info.maxMinor) {
    return NextResponse.json({ error: `Amount must be between ${info.minMinor / 100n} and ${info.maxMinor / 100n} ${info.currency}` }, { status: 400 })
  }

  const [{ data: companies }, { data: memberships }] = await Promise.all([
    supabase.from("sancus_companies").select("id, parent_id, root_id, name, country, base_currency, created_at"),
    supabase.from("sancus_memberships").select("company_id, user_id, role, status"),
  ])
  const companyRows = (companies ?? []) as CompanyRow[]
  const company = companyRows.find((row) => row.id === parsed.data.companyId)
  const role = company ? effectiveRole(companyRows, (memberships ?? []) as MembershipRow[], user.id, company.id).role : null
  if (!company || !role) return NextResponse.json({ error: "Receive code points to a branch you cannot access" }, { status: 403 })
  if (company.parent_id === null) return NextResponse.json({ error: "The parent treasury cannot receive through a local QR rail" }, { status: 400 })
  if (company.country !== info.country || company.base_currency !== info.currency) {
    return NextResponse.json({ error: `${info.label} must pay a ${info.currency} branch` }, { status: 400 })
  }

  const { data: wallet } = await supabase
    .from("wallets")
    .select("address, name")
    .eq("company_id", company.id)
    .order("created_at")
    .limit(1)
    .maybeSingle()
  if (!wallet) return NextResponse.json({ error: `${company.name} has no wallet to receive the test payment` }, { status: 409 })

  const providerRef = `dev-receive-${randomUUID()}`
  const { data, error } = await supabase
    .from("sancus_rail_collections")
    .insert({
      user_id: user.id,
      rail,
      currency: info.currency,
      amount_minor: amountMinor.toString(),
      provider: "simulated",
      provider_ref: providerRef,
      status: "PAID",
      simulated: true,
      qr_payload: `DEV:${providerRef}`,
      destination_address: wallet.address,
      destination_label: `${company.name} (branch)`,
      token_address: MOCK_TOKENS[info.currency].address,
    })
    .select()
    .single()
  if (error || !data) return NextResponse.json({ error: "Could not record the fake rail payment", detail: error?.message }, { status: 500 })

  const collection = await refreshCollection(supabase, data as CollectionRow)
  const api = toApi(collection)
  return NextResponse.json({
    collection: api,
    workflow: {
      receiveCode: { ok: true, detail: `${info.label} identity resolved to ${company.name}` },
      railPayment: { ok: true, detail: `${info.currency} payment recorded as paid` },
      cryptoMint: {
        ok: collection.status === "MINTED",
        detail: collection.status === "MINTED" ? `Minted ${MOCK_TOKENS[info.currency].symbol} on Arc testnet` : collection.error || `Stopped at ${collection.status}`,
        transaction: collection.mint_tx,
      },
    },
  }, { status: collection.status === "MINTED" ? 201 : 202 })
})
