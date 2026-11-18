import type { LocalRailStatus } from "../local-rails"

const DEFAULT_BASE_URL = "https://pix.sandbox.payzu.dev/v1"

export type PayZuTransaction = {
  id?: string
  status?: string
  amount?: number
  qrCodeBase64?: string
  qrCodeText?: string
  name?: string
  document?: string
  qrCodeType?: string
  amountEditable?: boolean
  expiresIn?: number
  endToEndId?: string
  paidAt?: string
  cancellationReason?: string
  message?: string
  errorCode?: string
  data?: PayZuTransaction[]
  [key: string]: unknown
}

/**
 * No PayZu token (their sandbox tokens expire every 24 h): fall back to a local simulation so the
 * Brazil corridor still works in the demo. Simulated ids start with "sim_"; rows are already
 * stored with simulated: true. Payouts settle at once; collections settle ~10 s after creation.
 */
export function payzuConfigured(): boolean {
  return Boolean(process.env.PAYZU_SANDBOX_TOKEN?.trim())
}
const SIM_COLLECTION_SECONDS = 10
const simId = (kind: "pay" | "col") => `sim_${kind}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
const isSim = (id: string) => id.startsWith("sim_")
function simCollectionStatus(id: string): PayZuTransaction {
  const created = Number(id.split("_")[2])
  const done = Number.isFinite(created) && Date.now() - created >= SIM_COLLECTION_SECONDS * 1000
  return { id, status: done ? "COMPLETED" : "PENDING", ...(done ? { paidAt: new Date().toISOString() } : {}) }
}

function config() {
  const token = process.env.PAYZU_SANDBOX_TOKEN?.trim()
  if (!token) throw new Error("PAYZU_SANDBOX_TOKEN is not configured")
  return {
    token,
    baseUrl: (process.env.PAYZU_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, ""),
  }
}

async function request(path: string, init: RequestInit = {}): Promise<PayZuTransaction | PayZuTransaction[]> {
  const { token, baseUrl } = config()
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: init.signal ?? AbortSignal.timeout(15_000),
    cache: "no-store",
  })
  const body = (await response.json().catch(() => ({}))) as PayZuTransaction | PayZuTransaction[]
  if (!response.ok) {
    const error = body as PayZuTransaction
    if (response.status === 401 && error.errorCode === "PZA100") {
      throw new Error("PayZu sandbox token expired or was revoked. Generate a new 24-hour token.")
    }
    throw new Error(String(error.message || error.errorCode || `PayZu returned HTTP ${response.status}`))
  }
  return body
}

function one(value: PayZuTransaction | PayZuTransaction[]): PayZuTransaction {
  if (Array.isArray(value)) return value[0] ?? {}
  return value.data?.[0] ?? value
}

export async function createPixCollection(input: { amountBrl: number; reference: string }) {
  if (!payzuConfigured()) {
    return { id: simId("col"), status: "PENDING", amount: input.amountBrl, qrCodeText: `SIMULATED-PIX:${input.reference}` } as PayZuTransaction
  }
  const transaction = one(await request("/pix", {
    method: "POST",
    body: JSON.stringify({ amount: input.amountBrl, expiresIn: 600, clientReference: input.reference }),
  }))
  if (!transaction.id) throw new Error("PayZu created the charge without returning an id")
  return transaction
}

export async function getPixCollection(id: string) {
  if (isSim(id)) return simCollectionStatus(id)
  return one(await request(`/pix?id=${encodeURIComponent(id)}`))
}

export async function resolvePixQr(qrPayload: string) {
  if (!payzuConfigured()) return { name: "Pix recipient (simulated)", qrCodeType: "STATIC", amountEditable: true, emv: qrPayload } as PayZuTransaction
  return one(await request("/pix/qrcode/read", { method: "POST", body: JSON.stringify({ emv: qrPayload }) }))
}

export async function payPix(input: {
  amountBrl: number
  reference: string
  qrPayload?: string
  pixKey?: string
  description?: string
}) {
  if (!payzuConfigured()) {
    const id = simId("pay")
    return { id, status: "COMPLETED", amount: input.amountBrl, endToEndId: `E${Date.now()}SIM`, paidAt: new Date().toISOString() } as PayZuTransaction
  }
  const byQr = Boolean(input.qrPayload)
  const transaction = one(await request(byQr ? "/withdraw/qrcode" : "/withdraw", {
    method: "POST",
    body: JSON.stringify(byQr ? {
      qrCode: input.qrPayload,
      amount: input.amountBrl,
      clientReference: input.reference,
      description: input.description,
    } : {
      pixKey: input.pixKey,
      amount: input.amountBrl,
      clientReference: input.reference,
      description: input.description,
    }),
  }))
  if (!transaction.id) throw new Error("PayZu created the payment without returning an id")
  return transaction
}

export async function getPixPayment(id: string) {
  if (isSim(id)) return { id, status: "COMPLETED" } as PayZuTransaction
  return one(await request(`/withdraw?id=${encodeURIComponent(id)}`))
}

export function mapPayZuStatus(status?: string): LocalRailStatus {
  switch (status?.toUpperCase()) {
    case "COMPLETED": return "SETTLED"
    case "CANCELED": return "CANCELLED"
    case "ERROR": return "FAILED"
    case "EXPIRED": return "EXPIRED"
    default: return "PENDING"
  }
}

