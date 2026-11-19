// Sancus: who may approve a payment, and whether an account pays straight away or only asks.
//
//   Company payments  The approver must be able to decide approvals, manage the payment's company,
//                     and be someone other than the person who asked for it.
//   Personal payments Only the owner decides (a solo account has nobody else to ask).
//
// Pure, so the API routes and the Approvals screen share one rule and it's unit-tested.
// The database backs up the "not your own" part with a check constraint.

import type { Permission } from "./accounts"

export type Approver = {
  userId: string
  can(p: Permission): boolean
  manageableCompanyIds(): string[]
}

export type ApprovalSubject = {
  /** The person who asked for the payment (the row's user_id). */
  requesterId: string
  /** Null for personal payments. */
  companyId: string | null
}

export type ApprovalCheck =
  | { ok: true }
  | { ok: false; code: "NO_PERMISSION" | "OWN_REQUEST" | "NOT_YOURS"; error: string }

export function checkApprover(approver: Approver, subject: ApprovalSubject): ApprovalCheck {
  if (!approver.can("approvals.decide")) {
    return { ok: false, code: "NO_PERMISSION", error: "Your account can't approve payments." }
  }
  if (subject.companyId === null) {
    return subject.requesterId === approver.userId
      ? { ok: true }
      : { ok: false, code: "NOT_YOURS", error: "This payment belongs to someone else's personal account." }
  }
  if (!approver.manageableCompanyIds().includes(subject.companyId)) {
    return { ok: false, code: "NOT_YOURS", error: "You don't manage the company this payment comes from." }
  }
  if (subject.requesterId === approver.userId) {
    return { ok: false, code: "OWN_REQUEST", error: "You can't approve your own payment. Ask another admin." }
  }
  return { ok: true }
}

/**
 * SEND     pays straight away when policy allows (admins, individuals)
 * REQUEST  every payment waits for an approver (employees)
 * null     can't start a payment at all
 */
export function paymentMode(account: Pick<Approver, "can">): "SEND" | "REQUEST" | null {
  if (account.can("money.send")) return "SEND"
  if (account.can("money.request")) return "REQUEST"
  return null
}

/** Reason shown in Approvals for a request that policy alone would have let through. */
export const EMPLOYEE_REQUEST_REASON = "Employee payments always need an admin's approval"
