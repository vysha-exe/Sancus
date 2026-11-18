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
  const transaction = one(await request("/pix", {
    method: "POST",
    body: JSON.stringify({ amount: input.amountBrl, expiresIn: 600, clientReference: input.reference }),
  }))
  if (!transaction.id) throw new Error("PayZu created the charge without returning an id")
  return transaction
}

export async function getPixCollection(id: string) {
  return one(await request(`/pix?id=${encodeURIComponent(id)}`))
}

export async function resolvePixQr(qrPayload: string) {
  return one(await request("/pix/qrcode/read", { method: "POST", body: JSON.stringify({ emv: qrPayload }) }))
}

export async function payPix(input: {
  amountBrl: number
  reference: string
  qrPayload?: string
  pixKey?: string
  description?: string
}) {
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

