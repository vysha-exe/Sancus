import { NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/api/with-auth"
import { validateJsonBody } from "@/lib/api/validate"
import { finishDevRun, sanitizeProviderPayload, step, workflow } from "@/lib/sancus/dev-runs"
import { toPixPaymentDto, type PixPaymentDbRow } from "@/lib/sancus/local-rails"
import { getPixPayment, mapPayZuStatus } from "@/lib/sancus/rails/payzu"
import { loadFundingAccount, releaseSpendFunds, settleSpendFunds } from "@/lib/sancus/spend-funding"

const schema = z.object({ runId: z.string().uuid().optional() })
const enabled = () => process.env.NODE_ENV !== "production" || process.env.SANCUS_ENABLE_DEV_ENDPOINTS === "true"

export const POST = withAuth(async (req, { user, supabase }) => {
  if (!enabled()) return NextResponse.json({ error: "Dev payment tools are disabled" }, { status: 404 })
  const id = req.nextUrl.pathname.split("/").pop()
  const validId = z.string().uuid().safeParse(id)
  if (!validId.success) return NextResponse.json({ error: "Invalid payment ID" }, { status: 400 })
  const parsed = await validateJsonBody(req, schema)
  if (!parsed.ok) return parsed.response
  const { data } = await supabase.from("sancus_pix_payments").select("*").eq("id", validId.data).eq("user_id", user.id).maybeSingle()
  if (!data) return NextResponse.json({ error: "Pix payment not found" }, { status: 404 })
  const provider = await getPixPayment(data.provider_transaction_id)
  const status = mapPayZuStatus(provider.status)
  const releasesHold = ["FAILED", "CANCELLED", "EXPIRED"].includes(status) && data.funding_status === "HELD"
  let releaseHash: string | null = data.funding_release_tx_hash ?? null
  if (releasesHold) {
    if (!data.company_id || !data.funding_account_id || !data.funding_amount_minor) {
      return NextResponse.json({ error: "This Pix payment is missing its issuing-company funding link" }, { status: 409 })
    }
    await loadFundingAccount(supabase, { companyId: data.company_id, accountId: data.funding_account_id })
    releaseHash = await releaseSpendFunds(supabase, { ref: `pix:${data.idempotency_key}` })
  }
  if (status === "SETTLED" && data.funding_status === "HELD") {
    await settleSpendFunds(supabase, { ref: `pix:${data.idempotency_key}` })
  }
  const { data: updated, error } = await supabase.from("sancus_pix_payments").update({
    provider_status: provider.status || data.provider_status,
    status,
    end_to_end_id: provider.endToEndId ?? data.end_to_end_id,
    provider_payload: sanitizeProviderPayload({ ...(data.provider_payload ?? {}), refreshed: provider }),
    failure_reason: status === "FAILED" || status === "CANCELLED" ? provider.cancellationReason || provider.message || status : null,
    settled_at: status === "SETTLED" ? provider.paidAt || new Date().toISOString() : null,
    funding_status: status === "SETTLED" && data.funding_status === "HELD"
      ? "SETTLED"
      : releasesHold
        ? "RELEASED"
        : data.funding_status,
    funding_release_tx_hash: releaseHash,
  }).eq("id", data.id).select("*").single()
  if (error || !updated) return NextResponse.json({ error: error?.message || "Could not update Pix payment" }, { status: 500 })
  const ok = status !== "FAILED" && status !== "CANCELLED" && status !== "EXPIRED"
  const steps = [step("providerStatus", ok, `PayZu sandbox payment is ${status.toLowerCase()}`)]
  const runStatus = status === "SETTLED" ? "PASSED" : ok ? "WAITING" : "FAILED"
  if (parsed.data.runId) await finishDevRun(supabase, parsed.data.runId, { status: runStatus, steps, sourceRecordType: "PIX_PAYMENT", sourceRecordId: data.id, providerRef: data.provider_transaction_id, error: ok ? null : status })
  return NextResponse.json({ payment: toPixPaymentDto(updated as PixPaymentDbRow), workflow: workflow(steps), runId: parsed.data.runId })
})
