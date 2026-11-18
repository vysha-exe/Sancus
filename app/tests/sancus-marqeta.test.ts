import { describe, expect, it, vi } from "vitest"
import { issueMarqetaCardWithConfig, type MarqetaConfig } from "@/lib/sancus/rails/marqeta"

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
