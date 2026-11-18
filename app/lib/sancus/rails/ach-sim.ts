// Sancus: mock US ACH off-ramp provider (Bridge-shaped).
//
// Walks an ACH payout through Bridge-style transfer states based on elapsed time:
//   CREATED → FUNDS_RECEIVED → PAYMENT_SUBMITTED → PAYMENT_PROCESSED   (→ RETURNED, later, sometimes)
// Everything here is SIMULATED. Two clocks:
//   accelerated  the whole payout in ~12 s for demos (default), clearly labelled simulated
//   realistic    banking-day timing: standard ACH settles next business day, same-day ACH in hours,
//                returns can arrive up to 2 business days after settlement
//
// Sandbox magic values (like Bridge / Circle CPN test values), so failures can be shown on stage:
//   account number ending 0001  → fails at submission, R03 "No account / unable to locate account"
//   account number ending 0002  → completes, then RETURNED R01 "Insufficient funds"
//   amount exactly $13.13       → fails at submission, R04 "Invalid account number structure"

export type AchSpeed = "STANDARD" | "SAME_DAY"
export type AchDemoMode = "accelerated" | "realistic"
export type AchStatus =
  | "PENDING_APPROVAL" // over the approval rule; funds reserved
  | "CREATED" // quote locked, waiting for USDC at the off-ramp partner (Bridge: awaiting_funds)
  | "FUNDS_RECEIVED" // partner has the USDC (onchain in TESTNET_SETTLEMENT, mocked in MOCK_ONLY)
  | "PAYMENT_SUBMITTED" // ACH entry sent to the network
  | "PAYMENT_PROCESSED" // settled at the recipient's bank
  | "FAILED" // rejected before settlement; funds come back
  | "RETURNED" // recipient bank sent it back after settlement
  | "REJECTED" // declined by an approver

export const ACH_STEPS: { status: AchStatus; label: string }[] = [
  { status: "CREATED", label: "Quote locked" },
  { status: "FUNDS_RECEIVED", label: "USDC received by off-ramp partner" },
  { status: "PAYMENT_SUBMITTED", label: "ACH payment submitted" },
  { status: "PAYMENT_PROCESSED", label: "Settled at recipient bank" },
]
const ORDER = ACH_STEPS.map((s) => s.status)

export const RETURN_CODES: Record<string, string> = {
  R01: "Insufficient funds",
  R02: "Account closed",
  R03: "No account / unable to locate account",
  R04: "Invalid account number structure",
  R10: "Customer advises not authorized",
  R29: "Corporate customer advises not authorized",
}

export const MAGIC = {
  failAccountSuffix: "0001",
  returnAccountSuffix: "0002",
  failAmountUsdMinor: 13_13n,
} as const

/** Accelerated demo: seconds after the payout starts at which each state is reached. */
export const ACCELERATED_SECONDS = { FUNDS_RECEIVED: 3, PAYMENT_SUBMITTED: 6, PAYMENT_PROCESSED: 12, RETURNED: 18 } as const

export function demoModeFromEnv(env: Record<string, string | undefined> = process.env): AchDemoMode {
  return env.ACH_DEMO_MODE?.trim().toLowerCase() === "realistic" ? "realistic" : "accelerated"
}

export type SimPayment = {
  status: AchStatus
  speed: AchSpeed
  demoMode: AchDemoMode
  /** When the payout was handed to the partner (approval time if it needed approval). */
  startedAt: Date
  accountLast4: string
  usdAmountMinor: bigint
}

export type SimOutcome = { status: AchStatus; returnCode: string | null }

function addMs(d: Date, ms: number) {
  return new Date(d.getTime() + ms)
}

/** Adds US business days (skips Sat/Sun; bank holidays ignored in the mock). */
export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from)
  let left = days
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1)
    const wd = d.getUTCDay()
    if (wd !== 0 && wd !== 6) left--
  }
  return d
}

function plannedFailure(p: SimPayment): { code: string } | null {
  if (p.accountLast4 === MAGIC.failAccountSuffix) return { code: "R03" }
  if (p.usdAmountMinor === MAGIC.failAmountUsdMinor) return { code: "R04" }
  return null
}
function plannedReturn(p: SimPayment): { code: string } | null {
  return p.accountLast4 === MAGIC.returnAccountSuffix ? { code: "R01" } : null
}

/** When each state is (or was) expected to happen, for the timeline shown to users. */
export function expectedTimes(p: Pick<SimPayment, "speed" | "demoMode" | "startedAt">): Record<"FUNDS_RECEIVED" | "PAYMENT_SUBMITTED" | "PAYMENT_PROCESSED" | "RETURNED", Date> {
  const t0 = p.startedAt
  if (p.demoMode === "accelerated") {
    return {
      FUNDS_RECEIVED: addMs(t0, ACCELERATED_SECONDS.FUNDS_RECEIVED * 1000),
      PAYMENT_SUBMITTED: addMs(t0, ACCELERATED_SECONDS.PAYMENT_SUBMITTED * 1000),
      PAYMENT_PROCESSED: addMs(t0, ACCELERATED_SECONDS.PAYMENT_PROCESSED * 1000),
      RETURNED: addMs(t0, ACCELERATED_SECONDS.RETURNED * 1000),
    }
  }
  const funds = addMs(t0, 60_000) // USDC confirmation at the partner
  const submitted = addMs(funds, 30 * 60_000) // next ACH submission window
  const processed = p.speed === "SAME_DAY" ? addMs(submitted, 4 * 3600_000) : addBusinessDays(submitted, 1)
  return { FUNDS_RECEIVED: funds, PAYMENT_SUBMITTED: submitted, PAYMENT_PROCESSED: processed, RETURNED: addBusinessDays(processed, 2) }
}

export function etaLabel(speed: AchSpeed, demoMode: AchDemoMode): string {
  const real = speed === "SAME_DAY" ? "same banking day if before the cutoff" : "1–2 banking days"
  return demoMode === "accelerated" ? `Simulated: about 12 seconds in demo mode (real ACH: ${real})` : `Simulated: ${real}`
}

const isEnd = (s: AchStatus) => s === "FAILED" || s === "RETURNED" || s === "REJECTED"

/** The mock provider's view of a payout at `now`. Never moves a payout backwards. */
export function simulateAch(p: SimPayment, now: Date): SimOutcome {
  if (isEnd(p.status) || p.status === "PENDING_APPROVAL") return { status: p.status, returnCode: null }
  const t = expectedTimes(p)
  let status: AchStatus = "CREATED"
  if (now >= t.FUNDS_RECEIVED) status = "FUNDS_RECEIVED"
  if (now >= t.PAYMENT_SUBMITTED) status = "PAYMENT_SUBMITTED"

  const fail = plannedFailure(p)
  if (fail && now >= t.PAYMENT_SUBMITTED) return { status: "FAILED", returnCode: fail.code }

  if (now >= t.PAYMENT_PROCESSED) status = "PAYMENT_PROCESSED"
  const ret = plannedReturn(p)
  if (ret && now >= t.RETURNED) return { status: "RETURNED", returnCode: ret.code }

  // Stored state may be ahead (e.g. FUNDS_RECEIVED set right after a real onchain transfer).
  const keep = ORDER.indexOf(p.status) > ORDER.indexOf(status)
  return { status: keep ? p.status : status, returnCode: null }
}

/** Whether the simulator could still change this payout (used to decide when to poll). */
export function simCanChange(p: Pick<SimPayment, "status" | "accountLast4">): boolean {
  if (isEnd(p.status) || p.status === "PENDING_APPROVAL") return false
  if (p.status === "PAYMENT_PROCESSED") return p.accountLast4 === MAGIC.returnAccountSuffix
  return true
}

// ---------- Bridge-shaped webhook events ----------
// Bridge sends { event_id, event_category: "transfer", event_type: "transfer.updated", event_object: {...} }
// with event_object.state in snake case. The mock uses the same shape so a real Bridge sandbox can slot in.

export type BridgeTransferState =
  | "awaiting_funds"
  | "funds_received"
  | "payment_submitted"
  | "payment_processed"
  | "returned"
  | "error"
  | "canceled"

export type BridgeEvent = {
  event_id: string
  event_category: "transfer"
  event_type: string
  event_created_at?: string
  event_object: {
    id: string // provider transfer id (our provider_ref)
    state: BridgeTransferState
    return_details?: { reason?: string; code?: string } | null
  }
}

const TO_BRIDGE: Partial<Record<AchStatus, BridgeTransferState>> = {
  CREATED: "awaiting_funds",
  FUNDS_RECEIVED: "funds_received",
  PAYMENT_SUBMITTED: "payment_submitted",
  PAYMENT_PROCESSED: "payment_processed",
  RETURNED: "returned",
  FAILED: "error",
  REJECTED: "canceled",
}
const FROM_BRIDGE: Record<BridgeTransferState, AchStatus> = {
  awaiting_funds: "CREATED",
  funds_received: "FUNDS_RECEIVED",
  payment_submitted: "PAYMENT_SUBMITTED",
  payment_processed: "PAYMENT_PROCESSED",
  returned: "RETURNED",
  error: "FAILED",
  canceled: "REJECTED",
}
export const toBridgeState = (s: AchStatus) => TO_BRIDGE[s] ?? "awaiting_funds"
export const fromBridgeState = (s: string): AchStatus | null => FROM_BRIDGE[s as BridgeTransferState] ?? null

export function bridgeEvent(providerRef: string, status: AchStatus, returnCode: string | null, eventId: string): BridgeEvent {
  return {
    event_id: eventId,
    event_category: "transfer",
    event_type: "transfer.updated",
    event_created_at: new Date().toISOString(),
    event_object: {
      id: providerRef,
      state: toBridgeState(status),
      return_details: returnCode ? { code: returnCode, reason: RETURN_CODES[returnCode] ?? "Returned" } : null,
    },
  }
}

/**
 * Which transitions an incoming event may make. Returns can only follow settlement; failures only
 * before it; nothing leaves FAILED / RETURNED / REJECTED.
 */
export function canTransition(from: AchStatus, to: AchStatus): boolean {
  if (from === to || isEnd(from) || from === "PENDING_APPROVAL") return false
  if (to === "RETURNED") return from === "PAYMENT_PROCESSED"
  if (to === "FAILED") return from !== "PAYMENT_PROCESSED"
  if (to === "REJECTED") return false
  return ORDER.indexOf(to) > ORDER.indexOf(from)
}
