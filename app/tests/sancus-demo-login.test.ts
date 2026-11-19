import { describe, expect, it } from "vitest"
import { isDemoUserEmail } from "@/lib/sancus/demo-accounts"
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
    expect(safeNextPath("https://evil.example")).toBe("/home")
    expect(safeNextPath("//evil.example")).toBe("/home")
    expect(safeNextPath("/api/sancus/payouts")).toBe("/home")
    expect(safeNextPath(null)).toBe("/home")
  })

  it("recognises every canned demo identity email", () => {
    const base = "demo@sancus.test"
    expect(isDemoUserEmail("demo@sancus.test", base)).toBe(true)
    expect(isDemoUserEmail("demo+finance@sancus.test", base)).toBe(true)
    expect(isDemoUserEmail("demo+branch@sancus.test", base)).toBe(true)
    expect(isDemoUserEmail("demo+employee@sancus.test", base)).toBe(true)
    expect(isDemoUserEmail("demo+individual@sancus.test", base)).toBe(true)
    expect(isDemoUserEmail("real.user@company.com", base)).toBe(false)
    expect(isDemoUserEmail(null, base)).toBe(false)
  })
})
