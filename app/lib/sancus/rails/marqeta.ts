import { randomUUID } from "node:crypto"
import { stableDemoToken } from "../demo-fallback"

const DEFAULT_BASE_URL = "https://sandbox-api.marqeta.com/v3"

export type MarqetaConfig = {
  baseUrl: string
  applicationToken: string
  adminAccessToken: string
  cardProductToken?: string
}

export type MarqetaIssueInput = {
  firstName: string
  lastName: string
  label: string
  currency: string
  monthlyLimit: number
}

export type MarqetaIssuedCard = {
  userToken: string
  cardToken: string
  velocityControlToken: string
  lastFour: string
  status: string
  simulated: boolean
}

type MarqetaResponse = {
  token?: string
  last_four?: string
  state?: string
  status?: string
  data?: Array<{ token?: string; active?: boolean }>
  error_message?: string
  message?: string
}

function readConfig(): MarqetaConfig {
  const applicationToken = process.env.MARQETA_APPLICATION_TOKEN?.trim()
  const adminAccessToken = process.env.MARQETA_ADMIN_ACCESS_TOKEN?.trim()
  if (!applicationToken || !adminAccessToken) throw new Error("Marqeta sandbox credentials are not configured")
  return {
    applicationToken,
    adminAccessToken,
    cardProductToken: process.env.MARQETA_CARD_PRODUCT_TOKEN?.trim() || undefined,
    baseUrl: (process.env.MARQETA_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, ""),
  }
}

export function isMarqetaConfigured() {
  return Boolean(process.env.MARQETA_APPLICATION_TOKEN?.trim() && process.env.MARQETA_ADMIN_ACCESS_TOKEN?.trim())
}

async function request(config: MarqetaConfig, path: string, init: RequestInit, fetchImpl: typeof fetch) {
  const authorization = Buffer.from(`${config.applicationToken}:${config.adminAccessToken}`).toString("base64")
  const response = await fetchImpl(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${authorization}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: init.signal ?? AbortSignal.timeout(20_000),
    cache: "no-store",
  })
  const body = (await response.json().catch(() => ({}))) as MarqetaResponse
  if (!response.ok) throw new Error(body.error_message || body.message || `Marqeta returned HTTP ${response.status}`)
  return body
}

export async function issueMarqetaCardWithConfig(
  config: MarqetaConfig,
  input: MarqetaIssueInput,
  fetchImpl: typeof fetch = fetch,
): Promise<MarqetaIssuedCard> {
  const userToken = randomUUID().replace(/-/g, "")
  const user = await request(config, "/users", {
    method: "POST",
    body: JSON.stringify({
      token: userToken,
      first_name: input.firstName.slice(0, 40),
      last_name: input.lastName.slice(0, 40),
      active: true,
      metadata: { source: "sancus", label: input.label.slice(0, 40) },
    }),
  }, fetchImpl)
  if (!user.token) throw new Error("Marqeta created the cardholder without returning a token")

  let cardProductToken = config.cardProductToken
  if (!cardProductToken) {
    const products = await request(config, "/cardproducts?count=10&start_index=0", { method: "GET" }, fetchImpl)
    cardProductToken = products.data?.find((product) => product.active !== false)?.token
  }
  if (!cardProductToken) throw new Error("Marqeta has no active card product; set MARQETA_CARD_PRODUCT_TOKEN")

  const velocityToken = randomUUID().replace(/-/g, "")
  const velocity = await request(config, "/velocitycontrols", {
    method: "POST",
    body: JSON.stringify({
      token: velocityToken,
      name: `${input.label.slice(0, 30)} monthly limit`,
      association: { user_token: user.token },
      currency_code: input.currency,
      amount_limit: input.monthlyLimit,
      usage_limit: -1,
      velocity_window: "MONTH",
      approvals_only: true,
      include_purchases: true,
      include_withdrawals: false,
      include_transfers: false,
      include_cashback: true,
      active: true,
    }),
  }, fetchImpl)
  if (!velocity.token) throw new Error("Marqeta created the spending control without returning a token")

  const card = await request(config, "/cards", {
    method: "POST",
    body: JSON.stringify({ user_token: user.token, card_product_token: cardProductToken }),
  }, fetchImpl)
  if (!card.token) throw new Error("Marqeta created the card without returning a token")

  return {
    userToken: user.token,
    cardToken: card.token,
    velocityControlToken: velocity.token,
    lastFour: card.last_four || "0000",
    status: card.state || card.status || "ACTIVE",
    simulated: false,
  }
}

export function issueMarqetaCard(input: MarqetaIssueInput) {
  return issueMarqetaCardWithConfig(readConfig(), input)
}

export type MarqetaLimitInput = {
  velocityControlToken: string
  userToken: string
  label: string
  currency: string
  monthlyLimit: number
}

export async function updateMarqetaCardLimitWithConfig(
  config: MarqetaConfig,
  input: MarqetaLimitInput,
  fetchImpl: typeof fetch = fetch,
) {
  await request(config, `/velocitycontrols/${encodeURIComponent(input.velocityControlToken)}`, {
    method: "PUT",
    body: JSON.stringify({
      token: input.velocityControlToken,
      name: `${input.label.slice(0, 30)} monthly limit`,
      association: { user_token: input.userToken },
      currency_code: input.currency,
      amount_limit: input.monthlyLimit,
      usage_limit: -1,
      velocity_window: "MONTH",
      approvals_only: true,
      include_purchases: true,
      include_withdrawals: false,
      include_transfers: false,
      include_cashback: true,
      active: true,
    }),
  }, fetchImpl)
}

export function updateMarqetaCardLimit(input: MarqetaLimitInput) {
  return updateMarqetaCardLimitWithConfig(readConfig(), input)
}

export function simulatedMarqetaCard(seed: string): MarqetaIssuedCard {
  const token = stableDemoToken(seed, 24)
  const suffix = String((Number.parseInt(token.slice(0, 8), 16) % 10_000)).padStart(4, "0")
  return {
    userToken: `SIM-MQ-USER-${token}`,
    cardToken: `SIM-MQ-CARD-${token}`,
    velocityControlToken: `SIM-MQ-LIMIT-${token}`,
    lastFour: suffix,
    status: "ACTIVE",
    simulated: true,
  }
}
