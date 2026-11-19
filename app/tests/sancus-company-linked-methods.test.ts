import { describe, expect, it } from "vitest"
import { toSancusCardDto } from "@/lib/sancus/cards"
import { toSpendingMethodDto } from "@/lib/sancus/local-rails"

describe("company-linked spending DTOs", () => {
  it("exposes the company and funding account for cards", () => {
    const card = toSancusCardDto({
      id: "card", company_id: "bangkok", funding_account_id: "bank", funding_wallet_id: null, employee_id: "employee",
      employee_name: "Malee", label: "Travel", country: "TH", currency: "THB",
      monthly_limit_minor: 1000, last_four: "1234", status: "ACTIVE", provider_status: "ACTIVE",
      simulated: false, created_at: "2026-11-18T00:00:00.000Z",
    })
    expect(card).toMatchObject({ companyId: "bangkok", fundingAccountId: "bank" })
  })

  it("exposes the company and funding account for local methods", () => {
    const method = toSpendingMethodDto({
      id: "pix", company_id: "brazil", funding_account_id: "bank", funding_wallet_id: null, employee_id: "employee",
      employee_name: "Malee", method_type: "PIX", provider: "PAYZU", label: "Pix spending",
      currency: "BRL", monthly_limit_minor: 1000, status: "ACTIVE", created_at: "2026-11-18T00:00:00.000Z",
    })
    expect(method).toMatchObject({ companyId: "brazil", fundingAccountId: "bank" })
  })
})
