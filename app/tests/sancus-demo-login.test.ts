import { describe, expect, it } from "vitest"
import { demoCredentials, isDemoLoginEnabled, safeNextPath } from "@/lib/sancus/demo-login"

describe("demo login", () => {
  it("is off unless explicitly enabled", () => {
    expect(isDemoLoginEnabled({})).toBe(false)
    expect(isDemoLoginEnabled({ SANCUS_DEMO_LOGIN: "1" })).toBe(false)
    expect(isDemoLoginEnabled({ SANCUS_DEMO_LOGIN: "true", NODE_ENV: "development" })).toBe(true)
  })

  it("needs a second flag in production", () => {
    expect(isDemoLoginEnabled({ SANCUS_DEMO_LOGIN: "true", NODE_ENV: "production" })).toBe(false)
    expect(
      isDemoLoginEnabled({ SANCUS_DEMO_LOGIN: "true", NODE_ENV: "production", SANCUS_DEMO_LOGIN_ALLOW_PRODUCTION: "true" })
    ).toBe(true)
  })

  it("requires an email and a password of 8+ characters", () => {
    expect(demoCredentials({ SANCUS_DEMO_EMAIL: "a@b.c", SANCUS_DEMO_PASSWORD: "short" })).toBeNull()
    expect(demoCredentials({ SANCUS_DEMO_EMAIL: "a@b.c", SANCUS_DEMO_PASSWORD: "long-enough" })).toEqual({
      email: "a@b.c",
      password: "long-enough",
    })
  })

  it("only redirects to in-app pages", () => {
    expect(safeNextPath("/dashboard/wallets")).toBe("/dashboard/wallets")
    expect(safeNextPath("https://evil.example")).toBe("/dashboard/pay")
    expect(safeNextPath("//evil.example")).toBe("/dashboard/pay")
    expect(safeNextPath("/api/sancus/payouts")).toBe("/dashboard/pay")
    expect(safeNextPath(null)).toBe("/dashboard/pay")
  })
})
