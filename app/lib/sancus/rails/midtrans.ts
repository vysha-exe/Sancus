import crypto from "node:crypto"

const DEFAULT_BASE_URL = "https://api.sandbox.midtrans.com"

type MidtransAction = {
  name?: string
  method?: string
  url?: string
}

export type MidtransTransaction = {
  transaction_id?: string
  order_id?: string
  transaction_status?: string
  status_code?: string
  status_message?: string
  gross_amount?: string
  currency?: string
  payment_type?: string
  fraud_status?: string
  settlement_time?: string
  expiry_time?: string
  actions?: MidtransAction[]
  signature_key?: string
  [key: string]: unknown
}

export type QrisStatus = "PENDING" | "SETTLED" | "FAILED" | "EXPIRED"

function config() {
  const serverKey = process.env.MIDTRANS_SERVER_KEY?.trim()
  if (!serverKey) throw new Error("MIDTRANS_SERVER_KEY is not configured")
  return {
    serverKey,
    baseUrl: (process.env.MIDTRANS_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, ""),
  }
}

function authorization(serverKey: string) {
  return `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`
}

async function request(path: string, init: RequestInit = {}): Promise<MidtransTransaction> {
  const { serverKey, baseUrl } = config()
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: authorization(serverKey),
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: init.signal ?? AbortSignal.timeout(15_000),
    cache: "no-store",
  })
  const body = (await response.json().catch(() => ({}))) as MidtransTransaction
  if (!response.ok) {
    throw new Error(body.status_message || `Midtrans returned HTTP ${response.status}`)
  }
  return body
}

export async function createQrisCharge(input: {
  orderId: string
  amountIdr: number
  merchantName: string
  employeeName: string
}) {
  const transaction = await request("/v2/charge", {
    method: "POST",
    body: JSON.stringify({
      payment_type: "qris",
      transaction_details: {
        order_id: input.orderId,
        gross_amount: input.amountIdr,
      },
      item_details: [
        {
          id: "sancus-sandbox-purchase",
          price: input.amountIdr,
          quantity: 1,
          name: input.merchantName.slice(0, 50),
        },
      ],
      customer_details: {
        first_name: input.employeeName.slice(0, 20),
      },
      qris: { acquirer: "gopay" },
    }),
  })
  const qr = transaction.actions?.find((action) =>
    ["generate-qr-code-v2", "generate-qr-code"].includes(action.name ?? "")
  )
  if (!transaction.transaction_id || !qr?.url) {
    throw new Error("Midtrans created the charge without returning a QR code")
  }
  return { transaction, qrImageUrl: qr.url }
}

export async function getQrisTransaction(id: string) {
  return request(`/v2/${encodeURIComponent(id)}/status`)
}

export function mapQrisStatus(status?: string): QrisStatus {
  switch (status?.toLowerCase()) {
    case "settlement":
    case "capture":
      return "SETTLED"
    case "expire":
      return "EXPIRED"
    case "deny":
    case "cancel":
    case "failure":
      return "FAILED"
    default:
      return "PENDING"
  }
}

export function verifyMidtransSignature(payload: MidtransTransaction): boolean {
  const serverKey = process.env.MIDTRANS_SERVER_KEY?.trim()
  const provided = payload.signature_key
  if (!serverKey || !provided || !payload.order_id || !payload.status_code || !payload.gross_amount) {
    return false
  }
  const expected = crypto
    .createHash("sha512")
    .update(`${payload.order_id}${payload.status_code}${payload.gross_amount}${serverKey}`)
    .digest("hex")
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

