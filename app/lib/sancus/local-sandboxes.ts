// Sancus: local collection rails in sandbox, ported from RuoHan's rails-demo adapters.
//   QRIS (Indonesia)   → Midtrans sandbox   (MIDTRANS_SERVER_KEY)
//   PromptPay (Thai)   → Omise test mode    (OMISE_SECRET_KEY)
//   Pix (Brazil)       → PayZu sandbox      (PAYZU_SANDBOX_TOKEN), else simulated
// Each charge is normalised to PENDING | PAID | FAILED | EXPIRED.

import type { LocalCurrency } from "./mock-tokens"

export type LocalRail = "QRIS" | "PROMPTPAY" | "PIX"
export type ChargeStatus = "PENDING" | "PAID" | "FAILED" | "EXPIRED"

export const RAIL_INFO: Record<LocalRail, { currency: LocalCurrency; country: string; label: string; minMinor: bigint; maxMinor: bigint }> = {
  QRIS: { currency: "IDR", country: "ID", label: "QRIS (Indonesia)", minMinor: 1_000_00n, maxMinor: 10_000_000_00n },
  PROMPTPAY: { currency: "THB", country: "TH", label: "PromptPay (Thailand)", minMinor: 20_00n, maxMinor: 150_000_00n },
  PIX: { currency: "BRL", country: "BR", label: "Pix (Brazil)", minMinor: 1_00n, maxMinor: 50_000_00n },
}

export type CreatedCharge = {
  provider: "midtrans" | "omise" | "payzu" | "simulated"
  providerRef: string
  status: ChargeStatus
  qrImageUrl: string | null
  qrPayload: string | null
  simulatorUrl: string | null
  simulated: boolean
}

const basic = (user: string) => `Basic ${Buffer.from(`${user}:`).toString("base64")}`
const env = (k: string) => process.env[k]?.trim() || ""

export function railConfigured(rail: LocalRail): boolean {
  if (rail === "QRIS") return Boolean(env("MIDTRANS_SERVER_KEY"))
  if (rail === "PROMPTPAY") return Boolean(env("OMISE_SECRET_KEY"))
  return true // Pix falls back to simulated
}

async function call(provider: string, url: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) })
  const text = await res.text()
  let body: Record<string, unknown> = {}
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    body = { message: text.slice(0, 300) }
  }
  if (!res.ok) throw new Error(`${provider} ${res.status}: ${String(body.message ?? body.error_messages ?? body.error ?? "request failed")}`)
  return body
}

// ---------- create ----------

export async function createCharge(rail: LocalRail, amountMinor: bigint, reference: string): Promise<CreatedCharge> {
  if (rail === "QRIS") {
    const base = env("MIDTRANS_BASE_URL") || "https://api.sandbox.midtrans.com"
    const tx = await call("midtrans", `${base}/v2/charge`, {
      method: "POST",
      headers: { authorization: basic(env("MIDTRANS_SERVER_KEY")), "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        payment_type: "qris",
        transaction_details: { order_id: reference, gross_amount: Number(amountMinor / 100n) }, // whole rupiah
        qris: { acquirer: "gopay" },
      }),
    })
    const actions = (tx.actions as { name: string; url: string }[] | undefined) ?? []
    const qr = actions.find((a) => a.name === "generate-qr-code" || a.name === "generate-qr-code-v2")
    return {
      provider: "midtrans",
      providerRef: String(tx.order_id ?? reference),
      status: normaliseMidtrans(String(tx.transaction_status ?? "pending")),
      qrImageUrl: qr?.url ?? null,
      qrPayload: (tx.qr_string as string | undefined) ?? null,
      simulatorUrl: "https://simulator.sandbox.midtrans.com/openapi/qris/index",
      simulated: false,
    }
  }

  if (rail === "PROMPTPAY") {
    const base = env("OMISE_BASE_URL") || "https://api.omise.co"
    const form = new URLSearchParams({ amount: amountMinor.toString(), currency: "THB", "source[type]": "promptpay" })
    const charge = await call("omise", `${base}/charges`, {
      method: "POST",
      headers: { authorization: basic(env("OMISE_SECRET_KEY")), "content-type": "application/x-www-form-urlencoded" },
      body: form,
    })
    const source = charge.source as { scannable_code?: { image?: { download_uri?: string } } } | undefined
    return {
      provider: "omise",
      providerRef: String(charge.id),
      status: normaliseOmise(String(charge.status ?? "pending")),
      qrImageUrl: source?.scannable_code?.image?.download_uri ?? null,
      qrPayload: null,
      simulatorUrl: "https://dashboard.omise.co/test/charges",
      simulated: false,
    }
  }

  // PIX
  const token = env("PAYZU_SANDBOX_TOKEN")
  if (token) {
    const base = env("PAYZU_BASE_URL") || "https://pix.sandbox.payzu.dev/v1"
    const charge = await call("payzu", `${base}/pix`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ amount: Number(amountMinor) / 100, expiresIn: 600, clientReference: reference }),
    })
    return {
      provider: "payzu",
      providerRef: String(charge.id),
      status: normalisePayzu(String(charge.status ?? "PENDING")),
      qrImageUrl: charge.qrCodeBase64 ? `data:image/png;base64,${charge.qrCodeBase64}` : null,
      qrPayload: (charge.qrCodeText as string | undefined) ?? null,
      simulatorUrl: null,
      simulated: false,
    }
  }
  return {
    provider: "simulated",
    providerRef: reference,
    status: "PENDING",
    qrImageUrl: null,
    qrPayload: `SIMULATED-PIX:${reference}`,
    simulatorUrl: null,
    simulated: true,
  }
}

// ---------- status ----------

export const SIMULATED_PIX_SECONDS = 10

export async function chargeStatus(
  provider: CreatedCharge["provider"],
  providerRef: string,
  createdAt: Date,
  now = new Date()
): Promise<ChargeStatus> {
  if (provider === "simulated") {
    return (now.getTime() - createdAt.getTime()) / 1000 >= SIMULATED_PIX_SECONDS ? "PAID" : "PENDING"
  }
  if (provider === "midtrans") {
    const base = env("MIDTRANS_BASE_URL") || "https://api.sandbox.midtrans.com"
    const tx = await call("midtrans", `${base}/v2/${encodeURIComponent(providerRef)}/status`, {
      headers: { authorization: basic(env("MIDTRANS_SERVER_KEY")), accept: "application/json" },
    })
    return normaliseMidtrans(String(tx.transaction_status ?? "pending"))
  }
  if (provider === "omise") {
    const base = env("OMISE_BASE_URL") || "https://api.omise.co"
    const charge = await call("omise", `${base}/charges/${encodeURIComponent(providerRef)}`, {
      headers: { authorization: basic(env("OMISE_SECRET_KEY")) },
    })
    return normaliseOmise(String(charge.status ?? "pending"))
  }
  const base = env("PAYZU_BASE_URL") || "https://pix.sandbox.payzu.dev/v1"
  const charge = await call("payzu", `${base}/pix?id=${encodeURIComponent(providerRef)}`, {
    headers: { authorization: `Bearer ${env("PAYZU_SANDBOX_TOKEN")}`, accept: "application/json" },
  })
  const row = Array.isArray(charge) ? charge[0] : (charge.data as unknown[] | undefined)?.[0] ?? charge
  return normalisePayzu(String((row as Record<string, unknown>)?.status ?? "PENDING"))
}

/** Omise test mode can mark a PromptPay charge paid (stands in for scanning the QR). */
export async function markSandboxPaid(provider: CreatedCharge["provider"], providerRef: string): Promise<boolean> {
  if (provider !== "omise") return false
  const base = env("OMISE_BASE_URL") || "https://api.omise.co"
  await call("omise", `${base}/charges/${encodeURIComponent(providerRef)}/mark_as_paid`, {
    method: "POST",
    headers: { authorization: basic(env("OMISE_SECRET_KEY")) },
  })
  return true
}

// ---------- status mapping ----------

export function normaliseMidtrans(s: string): ChargeStatus {
  if (s === "settlement" || s === "capture") return "PAID"
  if (s === "expire") return "EXPIRED"
  if (s === "deny" || s === "cancel" || s === "failure") return "FAILED"
  return "PENDING"
}
export function normaliseOmise(s: string): ChargeStatus {
  if (s === "successful") return "PAID"
  if (s === "expired") return "EXPIRED"
  if (s === "failed" || s === "reversed") return "FAILED"
  return "PENDING"
}
export function normalisePayzu(s: string): ChargeStatus {
  const v = s.toUpperCase()
  if (v === "COMPLETED" || v === "PAID") return "PAID"
  if (v === "EXPIRED") return "EXPIRED"
  if (v === "FAILED" || v === "CANCELED" || v === "CANCELLED") return "FAILED"
  return "PENDING"
}
