import type { LocalRailStatus } from "../local-rails"

const DEFAULT_BASE_URL = "https://api.omise.co"

export type OmiseCharge = {
  id?: string
  status?: string
  paid?: boolean
  amount?: number
  currency?: string
  failure_code?: string | null
  failure_message?: string | null
  source?: { scannable_code?: { image?: { download_uri?: string } } }
  [key: string]: unknown
}

function config() {
  const secretKey = process.env.OMISE_SECRET_KEY?.trim()
  if (!secretKey) throw new Error("OMISE_SECRET_KEY is not configured")
  return {
    secretKey,
    baseUrl: (process.env.OMISE_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, ""),
  }
}

async function request(path: string, init: RequestInit = {}): Promise<OmiseCharge> {
  const { secretKey, baseUrl } = config()
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
      ...init.headers,
    },
    signal: init.signal ?? AbortSignal.timeout(15_000),
    cache: "no-store",
  })
  const body = (await response.json().catch(() => ({}))) as OmiseCharge
  if (!response.ok) throw new Error(String(body.failure_message || body.failure_code || `Omise returned HTTP ${response.status}`))
  return body
}

export async function createPromptPayCharge(input: { amountSatang: number; reference?: string }) {
  const form = new URLSearchParams()
  form.set("amount", String(input.amountSatang))
  form.set("currency", "THB")
  form.set("source[type]", "promptpay")
  if (input.reference) form.set("description", input.reference)
  const charge = await request("/charges", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  })
  const qrImageUrl = charge.source?.scannable_code?.image?.download_uri
  if (!charge.id || !qrImageUrl) throw new Error("Omise created the charge without returning a PromptPay QR")
  return { charge, qrImageUrl }
}

export function getOmiseCharge(id: string) {
  return request(`/charges/${encodeURIComponent(id)}`)
}

export function mapOmiseStatus(charge: OmiseCharge): LocalRailStatus {
  if (charge.paid || charge.status === "successful") return "SETTLED"
  if (charge.status === "failed") return "FAILED"
  if (charge.status === "expired") return "EXPIRED"
  return "PENDING"
}

