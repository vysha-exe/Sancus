import { describe, expect, it, vi } from "vitest"
import {
  issueMarqetaCardWithConfig,
  simulateMarqetaAuthorizationWithConfig,
  simulateMarqetaClearingWithConfig,
  type MarqetaConfig,
} from "@/lib/sancus/rails/marqeta"

const config: MarqetaConfig = {
  baseUrl: "https://marqeta.example/v3",
  applicationToken: "app-token",
  adminAccessToken: "admin-token",
  cardProductToken: "product-1",
}

function response(body: object, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

describe("Marqeta card issuance", () => {
  it("creates a cardholder, monthly control, and virtual card", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const path = new URL(String(url)).pathname
      if (path.endsWith("/users")) return response({ token: "user-1" }, 201)
      if (path.endsWith("/velocitycontrols")) {
        const body = JSON.parse(String(init?.body))
        expect(body).toMatchObject({
          association: { user_token: "user-1" },
          amount_limit: 500,
          currency_code: "USD",
          velocity_window: "MONTH",
        })
        return response({ token: "velocity-1" }, 201)
      }
      if (path.endsWith("/cards")) return response({ token: "card-1", last_four: "4021", state: "ACTIVE" }, 201)
      throw new Error(`Unexpected request: ${path}`)
    }) as unknown as typeof fetch

    const card = await issueMarqetaCardWithConfig(config, {
      firstName: "Ana",
      lastName: "Souza",
      label: "Office supplies",
      currency: "USD",
      monthlyLimit: 500,
    }, fetchImpl)

    expect(card).toMatchObject({
      userToken: "user-1",
      cardToken: "card-1",
      velocityControlToken: "velocity-1",
      lastFour: "4021",
      status: "ACTIVE",
      simulated: false,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it("discovers an active card product when no token is configured", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const path = new URL(String(url)).pathname
      if (path.endsWith("/users")) return response({ token: "user-2" }, 201)
      if (path.endsWith("/cardproducts")) return response({ data: [{ token: "product-2", active: true }] })
      if (path.endsWith("/velocitycontrols")) return response({ token: "velocity-2" }, 201)
      if (path.endsWith("/cards")) return response({ token: "card-2", last_four: "7310", state: "ACTIVE" }, 201)
      throw new Error(`Unexpected request: ${path}`)
    }) as unknown as typeof fetch

    const card = await issueMarqetaCardWithConfig({ ...config, cardProductToken: undefined }, {
      firstName: "Rafael",
      lastName: "Lima",
      label: "Travel",
      currency: "BRL",
      monthlyLimit: 10_800,
    }, fetchImpl)

    expect(card.cardToken).toBe("card-2")
    expect(fetchImpl).toHaveBeenCalledTimes(4)
  })
})

describe("Marqeta sandbox transactions", () => {
  it("authorizes against the issued provider card token", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        card_token: "card-1",
        amount: 25,
        card_acceptor: { mid: "SANCUSDEV01", mcc: "5734", name: "Office Store" },
      })
      return response({ transaction: { token: "tx-auth-1", state: "PENDING", response: { code: "0000" } } }, 201)
    }) as unknown as typeof fetch
    const result = await simulateMarqetaAuthorizationWithConfig(config, { cardToken: "card-1", amount: 25, merchantName: "Office Store" }, fetchImpl)
    expect(result).toMatchObject({ token: "tx-auth-1", responseCode: "0000", approved: true })
  })

  it("clears a preceding authorization", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({ preceding_related_transaction_token: "tx-auth-1", amount: 25 })
      return response({ transaction: { token: "tx-clear-1", state: "COMPLETION", response: { code: "0000" } } }, 201)
    }) as unknown as typeof fetch
    const result = await simulateMarqetaClearingWithConfig(config, { authorizationToken: "tx-auth-1", amount: 25 }, fetchImpl)
    expect(result).toMatchObject({ token: "tx-clear-1", state: "COMPLETION", approved: true })
  })
})
