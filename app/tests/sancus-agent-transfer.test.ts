import { describe, expect, it } from "vitest"
import { resolveAccount } from "@/lib/sancus/agent/tools"

const accounts = [
  { id: "11111111-1111-1111-1111-111111111111", name: "Lion City Trading", isRoot: true },
  { id: "22222222-2222-2222-2222-222222222222", name: "Lion City Bangkok", isRoot: false },
  { id: "33333333-3333-3333-3333-333333333333", name: "Lion City Jakarta", isRoot: false },
  { id: "44444444-4444-4444-4444-444444444444", name: "Jakarta Warehouse", isRoot: false },
  { id: "55555555-5555-5555-5555-555555555555", name: "Lion City New York", isRoot: false },
]

describe("agent transfer: resolveAccount", () => {
  it("finds an account by what the person called it", () => {
    expect(resolveAccount(accounts, "bangkok")).toMatchObject({ name: "Lion City Bangkok" })
    expect(resolveAccount(accounts, "New York")).toMatchObject({ name: "Lion City New York" })
    expect(resolveAccount(accounts, "HQ")).toMatchObject({ name: "Lion City Trading" })
    expect(resolveAccount(accounts, accounts[2].id)).toMatchObject({ name: "Lion City Jakarta" })
  })

  it("asks instead of guessing when a name is ambiguous or unknown", () => {
    expect(resolveAccount(accounts, "Jakarta")).toMatch(/more than one account/)
    expect(resolveAccount(accounts, "Lion City Jakarta")).toMatchObject({ name: "Lion City Jakarta" })
    expect(resolveAccount(accounts, "Rio")).toMatch(/no account called "Rio"/)
  })
})
