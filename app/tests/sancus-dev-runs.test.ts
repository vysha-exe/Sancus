import { describe, expect, it } from "vitest"
import { sanitizeProviderPayload, step, workflow } from "@/lib/sancus/dev-runs"

describe("Dev Payment Lab audit data", () => {
  it("redacts provider credentials and card tokens without hiding useful status", () => {
    expect(sanitizeProviderPayload({
      status: "APPROVED",
      card_token: "card-secret",
      nested: { accessToken: "api-secret", reference: "tx-1" },
    })).toEqual({
      status: "APPROVED",
      card_token: "[REDACTED]",
      nested: { accessToken: "[REDACTED]", reference: "tx-1" },
    })
  })

  it("turns ordered run steps into the UI workflow", () => {
    const steps = [step("authorization", true, "Approved")]
    expect(workflow(steps)).toEqual({ authorization: { ok: true, detail: "Approved" } })
  })
})
