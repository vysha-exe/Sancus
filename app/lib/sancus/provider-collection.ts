import { createQrisCharge, mapQrisStatus } from "@/lib/sancus/rails/midtrans"
import { createPromptPayCharge, mapOmiseStatus } from "@/lib/sancus/rails/omise"
import { createPixCollection, mapPayZuStatus } from "@/lib/sancus/rails/payzu"
import type { CollectionRail } from "@/lib/sancus/local-rails"

export const collectionRailConfig = {
  QRIS: { provider: "MIDTRANS", currency: "IDR", decimals: 0, min: 1_000, max: 100_000_000 },
  PROMPTPAY: { provider: "OMISE", currency: "THB", decimals: 2, min: 20, max: 150_000 },
  PIX: { provider: "PAYZU", currency: "BRL", decimals: 2, min: 1, max: 5_000 },
} as const

export function validateCollectionAmount(rail: CollectionRail, amount: number) {
  const config = collectionRailConfig[rail]
  if (!Number.isFinite(amount) || amount < config.min || amount > config.max) {
    return `${rail} amount must be between ${config.min} and ${config.max} ${config.currency}`
  }
  return null
}

export async function createProviderCollection(input: {
  rail: CollectionRail
  amount: number
  reference: string
  companyName: string
}) {
  const config = collectionRailConfig[input.rail]
  const amountMinor = Math.round(input.amount * 10 ** config.decimals)
  let providerId: string
  let providerStatus: string
  let status
  let qrImageUrl: string | null = null
  let qrPayload: string | null = null
  let simulatorUrl: string | null = null
  let payload: Record<string, unknown>

  if (input.rail === "QRIS") {
    const result = await createQrisCharge({
      orderId: input.reference,
      amountIdr: Math.round(input.amount),
      merchantName: input.companyName,
      employeeName: "Customer",
    })
    providerId = result.transaction.transaction_id!
    providerStatus = result.transaction.transaction_status || "pending"
    status = mapQrisStatus(providerStatus)
    qrImageUrl = result.qrImageUrl
    simulatorUrl = "https://simulator.sandbox.midtrans.com/openapi/qris/index"
    payload = result.transaction
  } else if (input.rail === "PROMPTPAY") {
    const result = await createPromptPayCharge({ amountSatang: amountMinor, reference: input.reference })
    providerId = result.charge.id!
    providerStatus = result.charge.status || "pending"
    status = mapOmiseStatus(result.charge)
    qrImageUrl = result.qrImageUrl
    simulatorUrl = "https://dashboard.omise.co/test/charges"
    payload = result.charge
  } else {
    const result = await createPixCollection({ amountBrl: input.amount, reference: input.reference })
    providerId = result.id!
    providerStatus = result.status || "PENDING"
    status = mapPayZuStatus(providerStatus)
    qrImageUrl = result.qrCodeBase64 ? `data:image/png;base64,${result.qrCodeBase64}` : null
    qrPayload = result.qrCodeText || null
    payload = { ...result, qrCodeBase64: result.qrCodeBase64 ? "[QR IMAGE]" : undefined }
  }

  return {
    amountMinor,
    provider: config.provider,
    currency: config.currency,
    providerId,
    providerStatus,
    status,
    qrImageUrl,
    qrPayload,
    simulatorUrl,
    payload,
  }
}
