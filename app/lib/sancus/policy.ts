// Sancus: spending policy engine.
//
// Every payout is checked before money moves:
//   BLOCK           recipient on the blocklist, over the per-payment limit, or over the daily limit
//   NEEDS_APPROVAL  at or above the approval threshold → waits in Approvals, funds reserved
//   ALLOW           sent straight away
// Amounts are USDC minor units (6 decimals).

import type { SupabaseClient } from "@supabase/supabase-js"
import { displayMinor, USDC_DECIMALS } from "./money"

export type PolicyRules = {
  twoSignoffs: boolean
  newRecipients: boolean
  afterHours: boolean
}

export type Policy = {
  approvalThresholdMinor: bigint
  perPaymentLimitMinor: bigint
  dailyLimitMinor: bigint
  blockedRecipients: string[]
  rules: PolicyRules
}

export const DEFAULT_RULES: PolicyRules = { twoSignoffs: true, newRecipients: true, afterHours: false }

export const DEFAULT_POLICY: Policy = {
  approvalThresholdMinor: 1_000_000_000n, // $1,000
  perPaymentLimitMinor: 50_000_000_000n, // $50,000
  dailyLimitMinor: 100_000_000_000n, // $100,000
  blockedRecipients: [],
  rules: DEFAULT_RULES,
}

export type Decision = "ALLOW" | "NEEDS_APPROVAL" | "BLOCK"
export type Evaluation = { decision: Decision; reason: string | null }

const usd = (m: bigint) => `$${displayMinor(m, USDC_DECIMALS, "", 2)}`
const norm = (s: string) => s.trim().toLowerCase().replace(/[\s-]/g, "")

export function isBlocked(policy: Policy, recipient: { name: string; proxyValue: string }): boolean {
  const keys = [norm(recipient.name), norm(recipient.proxyValue)]
  return policy.blockedRecipients.some((b) => keys.includes(norm(b)))
}

export function evaluatePayout(input: {
  policy: Policy
  amountMinor: bigint
  recipient: { name: string; proxyValue: string }
  spentTodayMinor: bigint
  /** True when this account has never paid this recipient before. */
  isNewRecipient?: boolean
}): Evaluation {
  const { policy, amountMinor, recipient, spentTodayMinor, isNewRecipient } = input
  if (isBlocked(policy, recipient)) {
    return { decision: "BLOCK", reason: `${recipient.name} is on your blocked list` }
  }
  if (amountMinor > policy.perPaymentLimitMinor) {
    return { decision: "BLOCK", reason: `Over the ${usd(policy.perPaymentLimitMinor)} per-payment limit` }
  }
  if (spentTodayMinor + amountMinor > policy.dailyLimitMinor) {
    const left = policy.dailyLimitMinor - spentTodayMinor
    return {
      decision: "BLOCK",
      reason: `Over the ${usd(policy.dailyLimitMinor)} daily limit (${usd(left > 0n ? left : 0n)} left today)`,
    }
  }
  if (policy.rules.newRecipients && isNewRecipient) {
    return { decision: "NEEDS_APPROVAL", reason: "First payment to someone new needs an approver" }
  }
  if (amountMinor >= policy.approvalThresholdMinor) {
    return { decision: "NEEDS_APPROVAL", reason: `${usd(amountMinor)} is at or over the ${usd(policy.approvalThresholdMinor)} approval rule` }
  }
  return { decision: "ALLOW", reason: null }
}

type PolicyRow = {
  approval_threshold_minor: number | string
  per_payment_limit_minor: number | string
  daily_limit_minor: number | string
  blocked_recipients: string[] | null
  rules?: Partial<PolicyRules> | null
}

/** Fills any missing or non-boolean keys with the defaults. */
export function normalizeRules(raw: Partial<PolicyRules> | null | undefined): PolicyRules {
  const pick = (k: keyof PolicyRules) => (typeof raw?.[k] === "boolean" ? raw[k]! : DEFAULT_RULES[k])
  return { twoSignoffs: pick("twoSignoffs"), newRecipients: pick("newRecipients"), afterHours: pick("afterHours") }
}

export function policyFromRow(row: PolicyRow | null): Policy {
  if (!row) return DEFAULT_POLICY
  return {
    approvalThresholdMinor: BigInt(row.approval_threshold_minor),
    perPaymentLimitMinor: BigInt(row.per_payment_limit_minor),
    dailyLimitMinor: BigInt(row.daily_limit_minor),
    blockedRecipients: row.blocked_recipients ?? [],
    rules: normalizeRules(row.rules),
  }
}

export function serializePolicy(p: Policy) {
  return {
    approvalThresholdMinor: p.approvalThresholdMinor.toString(),
    perPaymentLimitMinor: p.perPaymentLimitMinor.toString(),
    dailyLimitMinor: p.dailyLimitMinor.toString(),
    blockedRecipients: p.blockedRecipients,
    rules: p.rules,
    twoSignoffs: p.rules.twoSignoffs,
    newRecipients: p.rules.newRecipients,
    afterHours: p.rules.afterHours,
  }
}

export type SerializedPolicy = ReturnType<typeof serializePolicy>

export async function loadPolicy(supabase: SupabaseClient, userId: string): Promise<Policy> {
  const { data } = await supabase
    .from("sancus_policies")
    .select("approval_threshold_minor, per_payment_limit_minor, daily_limit_minor, blocked_recipients, rules")
    .eq("user_id", userId)
    .maybeSingle()
  return policyFromRow(data as PolicyRow | null)
}

/** Company node policy; falls back to the actor's personal policy, then defaults. */
export async function loadCompanyPolicy(
  supabase: SupabaseClient,
  companyId: string,
  fallbackUserId?: string
): Promise<Policy> {
  const { data } = await supabase
    .from("sancus_company_policies")
    .select("approval_threshold_minor, per_payment_limit_minor, daily_limit_minor, blocked_recipients, rules")
    .eq("company_id", companyId)
    .maybeSingle()
  if (data) return policyFromRow(data as PolicyRow)
  if (fallbackUserId) return loadPolicy(supabase, fallbackUserId)
  return DEFAULT_POLICY
}

/**
 * True when this user has no earlier payout to the same recipient (matched loosely on name or proxy).
 * Declined, failed and still-waiting payments don't count: that person was never actually paid.
 */
export async function isNewRecipient(
  supabase: SupabaseClient,
  userId: string,
  recipient: { name: string; proxyValue: string }
): Promise<boolean> {
  const keys = [norm(recipient.name), norm(recipient.proxyValue)]
  const { data } = await supabase
    .from("sancus_payouts")
    .select("recipient_name, proxy_value, status")
    .eq("user_id", userId)
    .not("status", "in", "(REJECTED,FAILED,PENDING_APPROVAL)")
    .limit(1000)
  const paid = (data ?? []).some(
    (r) => keys.includes(norm(String(r.recipient_name ?? ""))) || keys.includes(norm(String(r.proxy_value ?? "")))
  )
  return !paid
}

/** ACH: new unless an earlier payment to the same saved recipient went through. */
export async function isNewAchRecipient(supabase: SupabaseClient, userId: string, recipientId: string): Promise<boolean> {
  const { data } = await supabase
    .from("sancus_ach_payments")
    .select("id")
    .eq("user_id", userId)
    .eq("recipient_id", recipientId)
    .not("status", "in", "(REJECTED,FAILED,PENDING_APPROVAL)")
    .limit(1)
  return (data ?? []).length === 0
}

/** USDC committed today (UTC) to payouts that weren't declined or failed. */
export async function spentToday(supabase: SupabaseClient, userId: string, now = new Date()): Promise<bigint> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
  const { data } = await supabase
    .from("sancus_payouts")
    .select("usdc_amount_minor, status")
    .eq("user_id", userId)
    .gte("created_at", start)
  // ACH off-ramp payouts count toward the same daily limit.
  const { data: ach } = await supabase
    .from("sancus_ach_payments")
    .select("usdc_amount_minor, status")
    .eq("user_id", userId)
    .gte("created_at", start)
  return [...(data ?? []), ...(ach ?? [])]
    .filter((r) => r.status !== "REJECTED" && r.status !== "FAILED")
    .reduce((s, r) => s + BigInt(r.usdc_amount_minor), 0n)
}
