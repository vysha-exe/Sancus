// Sancus: Singapore payout partner adapter.
//
// The real partner (StraitsX-style: receives USDC, pays SGD over PayNow/FAST)
// plugs in behind `PayoutProvider`. Until sandbox credentials arrive, the
// SimulatedSgPayoutProvider walks each payout through a realistic lifecycle
// based on elapsed time, so the UI and ledger behave like the real thing.

import type { SgRail } from "./paynow"

export type PayoutStatus =
  | "PENDING_APPROVAL" // over the approval rule: funds reserved, waiting for an approver
  | "CREATED" // payout recorded, quote locked
  | "FUNDS_SENT" // USDC sent from the treasury to the partner (onchain leg)
  | "CONVERTING" // partner converting USDC -> SGD
  | "PAYING_OUT" // SGD sent over PayNow / FAST
  | "COMPLETED"
  | "FAILED"
  | "REJECTED" // declined by an approver; funds released

export const TERMINAL_STATUSES: PayoutStatus[] = ["COMPLETED", "FAILED", "REJECTED"]

export const STATUS_STEPS: { status: PayoutStatus; label: string }[] = [
  { status: "CREATED", label: "Quote locked" },
  { status: "FUNDS_SENT", label: "USDC sent to partner" },
  { status: "CONVERTING", label: "Converting USDC → SGD" },
  { status: "PAYING_OUT", label: "Paying out" },
  { status: "COMPLETED", label: "Delivered" },
]

export function isTerminal(s: PayoutStatus): boolean {
  return TERMINAL_STATUSES.includes(s)
}

export type ProviderPayout = {
  id: string
  rail: SgRail
  status: PayoutStatus
  createdAt: Date
  sgdAmountMinor: bigint
}

export interface PayoutProvider {
  readonly name: string
  readonly simulated: boolean
  /** Hand the payout to the partner; returns the partner's reference. */
  submit(payout: ProviderPayout): Promise<{ providerRef: string }>
  /** Current status as reported by the partner. */
  status(payout: ProviderPayout, now?: Date): Promise<PayoutStatus>
}

/** Seconds after creation at which each simulated step is reached. */
export const SIM_TIMELINE_SECONDS: Record<Exclude<PayoutStatus, "FAILED" | "REJECTED" | "PENDING_APPROVAL">, number> = {
  CREATED: 0,
  FUNDS_SENT: 2,
  CONVERTING: 5,
  PAYING_OUT: 9,
  COMPLETED: 14,
}

/**
 * Demo hook (like Circle CPN's "magic values"): a payout of exactly S$13.13
 * fails at the payout step, so the failure path can be shown on stage.
 */
export const SIM_FAIL_AMOUNT_SGD_MINOR = 13_13n

export function simulatedStatusAt(payout: ProviderPayout, now: Date): PayoutStatus {
  // Waiting for an approver: nothing has been handed to the partner yet.
  if (isTerminal(payout.status) || payout.status === "PENDING_APPROVAL") return payout.status
  const elapsed = (now.getTime() - payout.createdAt.getTime()) / 1000
  const failAtPayout = payout.sgdAmountMinor === SIM_FAIL_AMOUNT_SGD_MINOR
  let current: PayoutStatus = "CREATED"
  for (const [status, at] of Object.entries(SIM_TIMELINE_SECONDS) as [PayoutStatus, number][]) {
    if (elapsed >= at) current = status
  }
  if (failAtPayout && (current === "PAYING_OUT" || current === "COMPLETED")) {
    return elapsed >= SIM_TIMELINE_SECONDS.COMPLETED ? "FAILED" : "PAYING_OUT"
  }
  // Never move backwards relative to what is already stored.
  const order = STATUS_STEPS.map((s) => s.status)
  return order.indexOf(current) >= order.indexOf(payout.status) ? current : payout.status
}

export class SimulatedSgPayoutProvider implements PayoutProvider {
  readonly name = "straitsx-simulated"
  readonly simulated = true

  async submit(payout: ProviderPayout) {
    return { providerRef: `SIM-SX-${payout.id.slice(0, 8).toUpperCase()}` }
  }

  async status(payout: ProviderPayout, now: Date = new Date()) {
    return simulatedStatusAt(payout, now)
  }
}

export function getPayoutProvider(): PayoutProvider {
  // TODO(sancus): return a StraitsX sandbox provider when STRAITSX_API_KEY is set.
  // See docs.straitsx.com "Regular Payout" (PayNow proxy type + value, FAST bank
  // transfer, sandbox status mocking + callbacks).
  return new SimulatedSgPayoutProvider()
}
