// Development-only receive-flow probe. Simulates a paid local-rail collection and
// immediately credits the selected branch's local operating bank account.
import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/api/with-auth"
import { validateJsonBody } from "@/lib/api/validate"
import { effectiveRole, type CompanyRow, type MembershipRow } from "@/lib/sancus/companies"
import { createDevRun, finishDevRun, step, workflow } from "@/lib/sancus/dev-runs"
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

  const { data: bankAccount } = await supabase
    .from("sancus_receive_accounts")
    .select("id, bank_name, account_number")
    .eq("company_id", company.id)
    .maybeSingle()
  if (!bankAccount) return NextResponse.json({ error: `${company.name} has no local bank account to receive the test payment` }, { status: 409 })

  const reference = `dev-receive-${randomUUID()}`
  const steps = [step("receiveCode", true, `${info.label} identity resolved to ${company.name}`)]
  const run = await createDevRun(supabase, { userId: user.id, companyId: company.id, runType: `${rail}_RECEIVE`, provider: "MOCK_BANK", steps })
  steps.push(step("mockPayment", true, `Mock customer paid ${info.currency} ${(Number(amountMinor) / 100).toFixed(2)}`))
  const { data, error } = await supabase
    .from("sancus_rail_collections")
    .insert({
      user_id: user.id,
      company_id: company.id,
      receive_account_id: bankAccount.id,
      rail,
      currency: info.currency,
      amount_minor: amountMinor.toString(),
      provider: "simulated",
      provider_ref: reference,
      status: "PAID",
      simulated: true,
      qr_image_url: null,
      qr_payload: null,
      simulator_url: null,
      destination_address: bankAccount.account_number,
      destination_label: `${bankAccount.bank_name} · ${company.name}`,
      token_address: MOCK_TOKENS[info.currency].address,
    })
    .select()
    .single()
  if (error || !data) {
    const message = error?.message || "Could not record the sandbox charge"
    await finishDevRun(supabase, run.id, { status: "FAILED", steps, providerRef: reference, error: message })
    return NextResponse.json({ error: message, workflow: workflow(steps), runId: run.id }, { status: 500 })
  }
  const credited = await refreshCollection(supabase, data as CollectionRow)
  if (credited.status !== "CREDITED") {
    const message = credited.error || "Could not credit the branch bank account"
    steps.push(step("bankDeposit", false, message))
    await finishDevRun(supabase, run.id, { status: "FAILED", steps, sourceRecordType: "RAIL_COLLECTION", sourceRecordId: data.id, providerRef: reference, error: message })
    return NextResponse.json({ error: message, collection: toApi(credited), workflow: workflow(steps), runId: run.id }, { status: 500 })
  }
  steps.push(step("bankDeposit", true, `${bankAccount.bank_name} credited ${company.name}'s ${info.currency} operating account`))
  await finishDevRun(supabase, run.id, { status: "PASSED", steps, sourceRecordType: "RAIL_COLLECTION", sourceRecordId: data.id, providerRef: reference })
  return NextResponse.json({
    collection: toApi(credited), workflow: workflow(steps), runId: run.id,
  }, { status: 201 })
})
