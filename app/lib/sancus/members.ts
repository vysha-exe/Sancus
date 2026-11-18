// Sancus: team membership helpers for invite / role change.
import { randomBytes } from "crypto"
import type { Role } from "./companies"

export const INVITE_ROLES: Role[] = ["ADMIN", "FINANCE", "EMPLOYEE", "VIEWER"]

export function newInviteToken(): string {
  return randomBytes(24).toString("hex")
}

export function inviteExpiresAt(days = 14): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
}

/** Rank for "can this actor assign that role?" — higher can assign lower. */
export function roleRank(role: Role): number {
  switch (role) {
    case "OWNER":
      return 5
    case "ADMIN":
      return 4
    case "FINANCE":
      return 3
    case "EMPLOYEE":
      return 2
    case "VIEWER":
      return 1
  }
}

export function canAssignRole(actor: Role, target: Role): boolean {
  if (actor === "OWNER") return true
  if (actor === "ADMIN") return target !== "OWNER" && roleRank(actor) > roleRank(target)
  return false
}

export type MemberDto = {
  id: string
  companyId: string
  userId: string | null
  email: string | null
  role: Role
  status: string
  roleInherited: boolean
  perPaymentLimitMinor: string | null
  dailyLimitMinor: string | null
  invitedAt: string | null
  acceptedAt: string | null
}
