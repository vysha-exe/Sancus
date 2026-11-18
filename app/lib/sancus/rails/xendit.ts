import crypto from "node:crypto"
import type { LocalRailStatus } from "../local-rails"

const DEFAULT_BASE_URL = "https://api.xendit.co"
const API_VERSION = "2025-09-01"

export type XenditPayoutStatus =
  | "ACCEPTED"
  | "PENDING_COMPLIANCE_ASSESSMENT"
  | "REJECTED"
  | "ROUTING"
  | "REQUESTED"
  | "READY"
  | "LOCKED"
  | "EXPIRED"
  | "FAILED"
  | "SUCCEEDED"
  | "CANCELLED"
  | "REVERSED"

export type XenditPayout = {
  payout_id?: string
  status?: XenditPayoutStatus
  reference_id?: string
  processor_reference?: string
  source_currency?: string
  source_amount?: number
  destination_currency?: string
  destination_amount?: number
  failure_code?: string
  created?: string
  updated?: string
  estimated_arrival_time?: string
  recipient?: {
    account_details?: { account_number?: string; [key: string]: unknown }
    [key: string]: unknown
  }
  error_code?: string
  message?: string
  [key: string]: unknown
}

export type XenditCreateInput = {
  idempotencyKey: string
  referenceId: string
  country: "TH" | "ID" | "PH"
  currency: "THB" | "IDR" | "PHP"
  recipientName: string
  accountNumber: string
  routingType: "SWIFT" | "WALLET" | "MOBILE_NO" | "NATIONAL_ID"
  routingValue: string
  amountMinor: number
  relationship: "EMPLOYEE" | "SUPPLIER"
  description?: string
}

const sandboxAddresses: Record<XenditCreateInput["country"], {
  province_state: string; city: string; street_line_1: string; postal_code: string
}> = {
  TH: { province_state: "Bangkok", city: "Bangkok", street_line_1: "1 Sandbox Road", postal_code: "10110" },
  ID: { province_state: "DKI Jakarta", city: "Jakarta", street_line_1: "1 Sandbox Road", postal_code: "10110" },
  PH: { province_state: "Metro Manila", city: "Makati City", street_line_1: "1 Sandbox Road", postal_code: "1200" },
}

function config() {
  const secretKey = process.env.XENDIT_SECRET_KEY?.trim()
  if (!secretKey) throw new Error("XENDIT_SECRET_KEY is not configured")
  if (!secretKey.startsWith("xnd_development_") || secretKey.length <= 35) {
    throw new Error("Sancus only accepts a Xendit development key for this hackathon integration")
  }
  return {
    secretKey,
    baseUrl: (process.env.XENDIT_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, ""),
  }
}

export function isXenditConfigured() {
  const value = process.env.XENDIT_SECRET_KEY?.trim() || ""
  return value.startsWith("xnd_development_") && value.length > 35
}

async function request(path: string, init: RequestInit = {}): Promise<XenditPayout> {
  const { secretKey, baseUrl } = config()
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
      "Content-Type": "application/json",
      "api-version": API_VERSION,
      ...init.headers,
    },
    signal: init.signal ?? AbortSignal.timeout(20_000),
    cache: "no-store",
  })
  const body = (await response.json().catch(() => ({}))) as XenditPayout
  if (!response.ok) {
    if (body.error_code === "REQUEST_FORBIDDEN_ERROR") {
      throw new Error("Xendit key is valid but needs Money-out Write permission")
    }
    throw new Error(body.message || body.error_code || `Xendit returned HTTP ${response.status}`)
  }
  return body
}

/** Xendit rejects "+" and other symbols. PromptPay mobiles are sent as digits, e.g. 66912345678. */
function xenditAccountValue(routingType: XenditCreateInput["routingType"], value: string) {
  return routingType === "MOBILE_NO" ? value.replace(/[^A-Za-z0-9]/g, "") : value
}

export async function createXenditPayout(input: XenditCreateInput) {
  const accountNumber = xenditAccountValue(input.routingType, input.accountNumber)
  const routingValue = xenditAccountValue(input.routingType, input.routingValue)
  const payout = await request("/v3/payouts", {
    method: "POST",
    headers: { "idempotency-key": input.idempotencyKey },
    body: JSON.stringify({
      reference_id: input.referenceId,
      recipient: {
        type: "BUSINESS",
        business_name: input.recipientName.slice(0, 50),
        relationship: input.relationship,
        account_details: {
          currency: input.currency,
          account_country: input.country,
          account_holder_name: input.recipientName,
          account_number: accountNumber,
          routing_type_1: input.routingType,
          routing_value_1: routingValue,
        },
        address: { country: input.country, ...sandboxAddresses[input.country] },
      },
      payout_details: {
        source_currency: input.currency,
        source_amount: input.amountMinor,
        destination_currency: input.currency,
      },
      source_of_fund: "BUSINESS_REVENUE",
      purpose_code: input.relationship === "EMPLOYEE" ? "OFFICE" : "TRADES",
      description: input.description?.slice(0, 100) || `Sancus ${input.referenceId}`,
      metadata: { source: "sancus-hackathon", country: input.country },
    }),
  })
  if (!payout.payout_id) throw new Error("Xendit accepted the request without returning a payout ID")
  return payout
}

export function getXenditPayout(id: string) {
  return request(`/v3/payouts/${encodeURIComponent(id)}`)
}

export function mapXenditStatus(status?: string): LocalRailStatus | "COMPLIANCE_REVIEW" | "REVERSED" {
  switch (status?.toUpperCase()) {
    case "SUCCEEDED": return "SETTLED"
    case "FAILED":
    case "REJECTED":
    case "EXPIRED": return "FAILED"
    case "CANCELLED": return "CANCELLED"
    case "REVERSED": return "REVERSED"
    case "PENDING_COMPLIANCE_ASSESSMENT": return "COMPLIANCE_REVIEW"
    default: return "PENDING"
  }
}

export function sanitizeXenditPayout(payout: XenditPayout): XenditPayout {
  const copy = structuredClone(payout)
  if (copy.recipient?.account_details?.account_number) {
    copy.recipient.account_details.account_number = "[MASKED]"
  }
  return copy
}

export function verifyXenditWebhookToken(value: string | null) {
  const expected = process.env.XENDIT_WEBHOOK_TOKEN?.trim()
  if (!expected || !value) return false
  const a = Buffer.from(value)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
