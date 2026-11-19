import { createHash } from "node:crypto"
import { NextResponse } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { requirePermission } from "@/lib/sancus/accounts-server"
import { withBuiltInPixMerchant, type DevMerchantPixQr } from "@/lib/sancus/dev-pix-merchant"
import { isPayZuSandboxConfigured, resolvePixQr } from "@/lib/sancus/rails/payzu"

const enabled = () => process.env.NODE_ENV !== "production" || process.env.SANCUS_ENABLE_DEV_ENDPOINTS === "true"

const createSchema = z.object({
  label: z.string().trim().min(1).max(120),
  payload: z.string().trim().min(8).max(8_000),
})

function toApi(row: Record<string, unknown>): DevMerchantPixQr {
  return {
    id: String(row.id),
    payload: String(row.qr_payload),
    label: String(row.label),
    merchantName: row.merchant_name ? String(row.merchant_name) : null,
    status: String(row.status),
    qrCodeType: row.qr_code_type ? String(row.qr_code_type) : null,
    amountEditable: Boolean(row.amount_editable),
    fixedAmountBrlMinor: row.fixed_amount_brl_minor == null ? null : String(row.fixed_amount_brl_minor),
    createdAt: String(row.created_at),
  }
}

export const GET = withAuth(async (_req, { user, supabase }) => {
  if (!enabled()) return NextResponse.json({ error: "Dev payment tools are disabled" }, { status: 404 })
  const denied = await requirePermission(supabase, user, "spending.manage")
  if (denied) return denied

  const { data, error } = await supabase
    .from("sancus_pix_merchant_qrs")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ error: "Could not load stored merchant Pix QR codes", detail: error.message }, { status: 500 })
  return NextResponse.json({
    qrs: withBuiltInPixMerchant((data ?? []).map((row) => toApi(row as Record<string, unknown>))),
  })
})

export const POST = withAuth(async (req, { user, supabase }) => {
  if (!enabled()) return NextResponse.json({ error: "Dev payment tools are disabled" }, { status: 404 })
  const denied = await requirePermission(supabase, user, "spending.manage")
  if (denied) return denied
  if (!isPayZuSandboxConfigured()) return NextResponse.json({ error: "PayZu sandbox is not configured" }, { status: 503 })
  const parsed = await validateJsonBody(req, createSchema)
  if (!parsed.ok) return parsed.response

  try {
    const resolved = await resolvePixQr(parsed.data.payload)
    const amount = Number(resolved.amount)
    const amountEditable = resolved.amountEditable === true
    const fixedAmountBrlMinor = !amountEditable && Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null
    if (!amountEditable && fixedAmountBrlMinor === null) {
      return NextResponse.json({ error: "PayZu identified a fixed QR without a valid amount" }, { status: 422 })
    }
    const fingerprint = createHash("sha256").update(parsed.data.payload).digest("hex")
    const { data, error } = await supabase
      .from("sancus_pix_merchant_qrs")
      .upsert({
        user_id: user.id,
        label: parsed.data.label,
        merchant_name: resolved.name || null,
        qr_payload: parsed.data.payload,
        payload_fingerprint: fingerprint,
        qr_code_type: resolved.qrCodeType || null,
        amount_editable: amountEditable,
        fixed_amount_brl_minor: fixedAmountBrlMinor,
        provider_payload: resolved,
        status: "ACTIVE",
      }, { onConflict: "user_id,payload_fingerprint" })
      .select("*")
      .single()
    if (error || !data) return NextResponse.json({ error: "Could not save the merchant Pix QR", detail: error?.message }, { status: 500 })
    return NextResponse.json({ qr: toApi(data as Record<string, unknown>) }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not read the merchant Pix QR" }, { status: 502 })
  }
})
