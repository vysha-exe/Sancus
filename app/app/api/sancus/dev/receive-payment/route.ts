// Development-only receive-flow probe. Creates a real provider sandbox charge
// for a reusable branch receive identity. Settlement and Arc minting happen on refresh.
import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/api/with-auth"
import { validateJsonBody } from "@/lib/api/validate"
import { effectiveRole, type CompanyRow, type MembershipRow } from "@/lib/sancus/companies"
import { createDevRun, finishDevRun, step, workflow } from "@/lib/sancus/dev-runs"
import { createCharge, RAIL_INFO, strictRailConfigured, type LocalRail } from "@/lib/sancus/local-sandboxes"
import { MOCK_TOKENS } from "@/lib/sancus/mock-tokens"
import { toApi, type CollectionRow } from "@/lib/sancus/rail-collections"

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

  if (!strictRailConfigured(rail)) {
    return NextResponse.json({ error: `${info.label} sandbox credentials are not configured` }, { status: 503 })
  }
  const reference = `dev-receive-${randomUUID()}`
  const steps = [step("receiveCode", true, `${info.label} identity resolved to ${company.name}`)]
  const run = await createDevRun(supabase, { userId: user.id, companyId: company.id, runType: `${rail}_RECEIVE`, provider: rail === "QRIS" ? "MIDTRANS" : rail === "PROMPTPAY" ? "OMISE" : "PAYZU", steps })
  let charge
  try {
    charge = await createCharge(rail, amountMinor, reference)
    if (charge.simulated) throw new Error("The provider returned a simulated charge; strict Dev tests require a configured sandbox")
    steps.push(step("providerCharge", true, `${charge.provider} created a sandbox charge`))
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider charge creation failed"
    steps.push(step("providerCharge", false, message))
    await finishDevRun(supabase, run.id, { status: "FAILED", steps, error: message })
    return NextResponse.json({ error: message, workflow: workflow(steps), runId: run.id }, { status: 502 })
  }
  const { data, error } = await supabase
    .from("sancus_rail_collections")
    .insert({
      user_id: user.id,
      rail,
      currency: info.currency,
      amount_minor: amountMinor.toString(),
      provider: charge.provider,
      provider_ref: charge.providerRef,
      status: charge.status,
      simulated: false,
      qr_image_url: charge.qrImageUrl,
      qr_payload: charge.qrPayload,
      simulator_url: charge.simulatorUrl,
      destination_address: wallet.address,
      destination_label: `${company.name} (branch)`,
      token_address: MOCK_TOKENS[info.currency].address,
    })
    .select()
    .single()
  if (error || !data) {
    const message = error?.message || "Could not record the sandbox charge"
    await finishDevRun(supabase, run.id, { status: "FAILED", steps, providerRef: charge.providerRef, error: message })
    return NextResponse.json({ error: message, workflow: workflow(steps), runId: run.id }, { status: 500 })
  }
  steps.push(step("settlement", true, "Charge created; complete it in the provider sandbox, then refresh"))
  await finishDevRun(supabase, run.id, { status: "WAITING", steps, sourceRecordType: "RAIL_COLLECTION", sourceRecordId: data.id, providerRef: charge.providerRef })
  return NextResponse.json({
    collection: toApi(data as CollectionRow), workflow: workflow(steps), runId: run.id,
  }, { status: 201 })
})
