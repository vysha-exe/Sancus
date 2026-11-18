import { describe, expect, it } from "vitest"
import { canAssignRole, roleRank } from "@/lib/sancus/members"

describe("canAssignRole", () => {
  it("Owner can assign any role", () => {
    expect(canAssignRole("OWNER", "OWNER")).toBe(true)
    expect(canAssignRole("OWNER", "VIEWER")).toBe(true)
  })

  it("Admin cannot assign Owner or equal/higher", () => {
    expect(canAssignRole("ADMIN", "OWNER")).toBe(false)
    expect(canAssignRole("ADMIN", "ADMIN")).toBe(false)
    expect(canAssignRole("ADMIN", "FINANCE")).toBe(true)
    expect(canAssignRole("ADMIN", "VIEWER")).toBe(true)
  })

  it("Finance cannot invite", () => {
    expect(canAssignRole("FINANCE", "EMPLOYEE")).toBe(false)
  })

  it("ranks Owner above Admin", () => {
    expect(roleRank("OWNER")).toBeGreaterThan(roleRank("ADMIN"))
  })
})
