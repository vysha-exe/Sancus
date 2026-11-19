import { describe, expect, it } from "vitest"
import { buildPipeline, corridorFor } from "@/lib/sancus/process-pipeline"

describe("card process pipeline", () => {
  it("routes cards through the issuing branch currency without fUSDC", () => {
    const corridor = corridorFor("Card", { destinationKind: "card", currency: "THB" })
    expect(corridor.label).toBe("THB branch balance → card network")
    expect(corridor.localRail).toBe("Card network")
    expect(corridor.label).not.toContain("fUSDC")
  })

  it("shows authorization, clearing, and local branch settlement", () => {
    const result = buildPipeline({
      rail: "Card",
      status: "Settled",
      destinationKind: "card",
      currency: "IDR",
      localAmountLabel: "Rp400,000",
    })

    expect(result.steps.map((step) => step.id)).toEqual(["authorize", "card-network", "settle"])
    expect(result.steps[0]?.detail).toContain("issuing branch's IDR balance")
    expect(result.steps[0]?.detail).toContain("Parent Treasury is not used")
    expect(result.steps.map((step) => `${step.title} ${step.detail}`).join(" ")).not.toContain("fUSDC")
  })

  it("keeps branch transfers bank-first with the wallet only in the middle", () => {
    const result = buildPipeline({
      rail: "Internal",
      status: "Settled",
      destinationKind: "internal",
      currency: "THB",
    })
    expect(result.steps.map((step) => step.id)).toEqual(["bank-debit", "usdc", "bank-credit"])
    expect(result.steps[0]?.detail).toContain("bank funds")
    expect(result.steps[1]?.detail).toContain("only for the cross-border transport leg")
    expect(result.steps[2]?.detail).toContain("branch bank account")
  })

  it("settles incoming collections to the operating account without minting", () => {
    const result = buildPipeline({ rail: "Pix", status: "Settled", inbound: true, destinationKind: "collection", currency: "BRL" })
    const copy = result.steps.map((step) => `${step.title} ${step.detail}`).join(" ")
    expect(result.steps.map((step) => step.id)).toContain("bank-credit")
    expect(copy).toContain("operating account")
    expect(copy.toLowerCase()).not.toContain("mint")
  })
})
