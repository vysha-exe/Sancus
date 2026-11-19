// Sancus: ACH off-ramp I/O. Moves payments through the mock provider, settles the USDC leg when
// TESTNET_SETTLEMENT is on, keeps the double-entry ledger in step, and applies provider webhooks.
// Server only.

import { createHmac, timingSafeEqual } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { serviceClient } from "./service-client"
import { createClient } from "@supabase/supabase-js"
import { getAppKitSendError, sendUsdcOnSameChainWithAppKit } from "@/lib/circle/app-kit-send"
import { achJournalsFor, type AchPaymentRow } from "./ach"
import { postJournal, postJournalFor } from "./ledger"
import { formatMinor, USDC_DECIMALS } from "./money"
import { type AchStatus, type BridgeEvent, canTransition, fromBridgeState, RETURN_CODES, simCanChange, simulateAch } from "./rails/ach-sim"

export const ACH_PROVIDER = "bridge-simulated"

type Poster = { kind: "user" } | { kind: "service"; userId: string }

export async function syncAchLedger(db: SupabaseClient, row: AchPaymentRow, poster: Poster = { kind: "user" }): Promise<void> {
  // Journals always land in the requester's books, even when another admin approves or declines.
  const svc = poster.kind === "user" ? serviceClient() : null
  for (const j of achJournalsFor(row)) {
    if (poster.kind === "service") await postJournalFor(db, poster.userId, j)
    else if (svc) await postJournalFor(svc, row.user_id, j)
    else await postJournal(db, j)
  }
}

/**
 * Moves a payment to `next` if that's a legal transition from what's stored (guarded in the
 * UPDATE so concurrent pollers / webhooks can't double-apply), then syncs the ledger.
 */
export async function applyAchStatus(
  db: SupabaseClient,
  row: AchPaymentRow,
  next: AchStatus,
  returnCode: string | null,
  poster: Poster = { kind: "user" },
  now = new Date()
): Promise<AchPaymentRow> {
  if (!canTransition(row.status, next)) return row
  const iso = now.toISOString()
  const patch: Partial<AchPaymentRow> = { status: next }
  if (next === "PAYMENT_SUBMITTED" || ((next === "PAYMENT_PROCESSED" || next === "FAILED") && !row.submitted_at)) patch.submitted_at = iso
  if (next === "PAYMENT_PROCESSED") patch.processed_at = iso
  if (next === "FAILED" || next === "RETURNED") {
    patch.return_code = returnCode
    patch.returned_at = iso
    const why = returnCode ? `${returnCode}: ${RETURN_CODES[returnCode] ?? "returned"}` : "ACH payment failed"
    patch.failure_reason = `${next === "RETURNED" ? "Returned by recipient bank" : "Rejected by ACH network"} (${why}, simulated)`
  }
  const { data } = await db
    .from("sancus_ach_payments")
    .update(patch)
    .eq("id", row.id)
    .eq("status", row.status)
    .select("*")
    .maybeSingle()
  if (!data) {
    // Someone else moved it first; return what's stored now.
    const { data: fresh } = await db.from("sancus_ach_payments").select("*").eq("id", row.id).maybeSingle()
    return (fresh as AchPaymentRow | null) ?? row
  }
  const updated = data as AchPaymentRow
  await syncAchLedger(db, updated, poster)
  return updated
}

/** Polls the mock provider for every payment that can still change (this is what moves them). */
export async function refreshAchPayments(db: SupabaseClient, rows: AchPaymentRow[], now = new Date()): Promise<AchPaymentRow[]> {
  return Promise.all(
    rows.map(async (row) => {
      if (!simCanChange({ status: row.status, accountLast4: row.account_last4 })) return row
      let current = row
      const sim = simulateAch(
        {
          status: current.status,
          speed: current.speed,
          demoMode: current.demo_mode,
          startedAt: new Date(current.approved_at ?? current.created_at),
          accountLast4: current.account_last4,
          usdAmountMinor: BigInt(current.usd_amount_minor),
        },
        now
      )
      // Walk through intermediate states so each transition (and its timestamps) is recorded.
      const path: AchStatus[] = ["FUNDS_RECEIVED", "PAYMENT_SUBMITTED", "PAYMENT_PROCESSED"]
      if (sim.status !== current.status) {
        for (const step of path) {
          if (step === sim.status) break
          if (sim.status === "FAILED" && step === "PAYMENT_PROCESSED") break
          if (canTransition(current.status, step)) current = await applyAchStatus(db, current, step, null, { kind: "user" }, now)
        }
        current = await applyAchStatus(db, current, sim.status, sim.returnCode, { kind: "user" }, now)
      }
      return current
    })
  )
}

/**
 * Hands a payment that cleared policy (straight away or after approval) to the off-ramp.
 * TESTNET_SETTLEMENT: real USDC from the Treasury to the settlement wallet first; if that transfer
 * fails nothing left the Treasury, so the payment FAILS and the reserve is released.
 */
export async function executeAch(db: SupabaseClient, userId: string, row: AchPaymentRow): Promise<AchPaymentRow> {
  if (row.settlement_mode !== "TESTNET_SETTLEMENT") return row
  if (!row.source_address || !row.settlement_address) {
    return failBeforeFunding(db, row, "No Treasury or settlement wallet for testnet settlement")
  }
  const amount = formatMinor(BigInt(row.usdc_amount_minor), USDC_DECIMALS)
  try {
    const sent = await sendUsdcOnSameChainWithAppKit({
      sourceBlockchain: "ARC-TESTNET",
      sourceWalletAddress: row.source_address,
      recipientAddress: row.settlement_address,
      amount,
      token: "USDC",
    })
    const { data } = await db
      .from("sancus_ach_payments")
      .update({ funded_onchain: true, status: "FUNDS_RECEIVED", circle_transaction_id: sent.txId, tx_hash: sent.txHash ?? null })
      .eq("id", row.id)
      .eq("status", "CREATED")
      .select("*")
      .maybeSingle()
    const updated = (data as AchPaymentRow | null) ?? { ...row, funded_onchain: true, status: "FUNDS_RECEIVED" as const, tx_hash: sent.txHash ?? null }
    await db.from("transactions").insert({
      user_id: userId,
      amount: Number(amount),
      sender_address: row.source_address,
      recipient_address: row.settlement_address,
      tx_hash: sent.txHash ?? null,
      circle_transaction_id: sent.txId,
      blockchain: "ARC-TESTNET",
      type: "OUTBOUND",
      currency: "USDC",
      status: "PENDING",
    })
    await syncAchLedger(db, updated)
    return updated
  } catch (error) {
    const mapped = getAppKitSendError(error)
    return failBeforeFunding(db, row, `USDC settlement transfer failed: ${mapped.userMessage ?? mapped.error}`)
  }
}

async function failBeforeFunding(db: SupabaseClient, row: AchPaymentRow, reason: string): Promise<AchPaymentRow> {
  const { data } = await db
    .from("sancus_ach_payments")
    .update({ status: "FAILED", failure_reason: reason, returned_at: new Date().toISOString() })
    .eq("id", row.id)
    .select("*")
    .maybeSingle()
  const updated = (data as AchPaymentRow | null) ?? { ...row, status: "FAILED" as const, failure_reason: reason }
  await syncAchLedger(db, updated)
  return updated
}

// ---------- webhooks (Bridge-shaped) ----------

/**
 * Mock signature: `X-Webhook-Signature: t=<unix seconds>,v0=<hex HMAC-SHA256(secret, "<t>.<body>")>`.
 * (Real Bridge signs with an RSA key and publishes the public key; swap the check when going live.)
 */
export function signWebhook(body: string, secret: string, t = Math.floor(Date.now() / 1000)): string {
  return `t=${t},v0=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`
}

export function verifyWebhook(body: string, header: string | null, secret: string, nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300): boolean {
  if (!header || !secret) return false
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=") as [string, string]))
  const t = Number(parts.t)
  if (!Number.isFinite(t) || Math.abs(nowSec - t) > toleranceSec || !parts.v0) return false
  const expected = createHmac("sha256", secret).update(`${t}.${body}`).digest()
  const given = Buffer.from(parts.v0, "hex")
  return given.length === expected.length && timingSafeEqual(given, expected)
}

export function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export type EventResult =
  | { ok: true; duplicate: boolean; applied: boolean; payment: AchPaymentRow | null; note?: string }
  | { ok: false; status: number; error: string }

/** Applies one provider event exactly once (event ids are recorded; replays are no-ops). */
export async function processBridgeEvent(admin: SupabaseClient, event: BridgeEvent): Promise<EventResult> {
  if (event?.event_category !== "transfer" || !event.event_id || !event.event_object?.id) {
    return { ok: true, duplicate: false, applied: false, payment: null, note: "ignored: not a transfer event" }
  }
  const next = fromBridgeState(event.event_object.state)
  if (!next) return { ok: false, status: 400, error: `Unknown transfer state "${event.event_object.state}"` }

  const { data: found } = await admin.from("sancus_ach_payments").select("*").eq("provider_ref", event.event_object.id).maybeSingle()
  const row = found as AchPaymentRow | null
  if (!row) return { ok: false, status: 404, error: "No payment for that transfer id" }

  const { error: dupErr } = await admin.from("sancus_ach_events").insert({
    event_id: event.event_id,
    payment_id: row.id,
    user_id: row.user_id,
    event_type: event.event_type,
    state: event.event_object.state,
    payload: event,
  })
  if (dupErr?.code === "23505") return { ok: true, duplicate: true, applied: false, payment: row }
  if (dupErr) return { ok: false, status: 500, error: "Could not record the event" }

  const code = event.event_object.return_details?.code ?? (next === "FAILED" || next === "RETURNED" ? "R01" : null)
  if (!canTransition(row.status, next)) {
    return { ok: true, duplicate: false, applied: false, payment: row, note: `ignored: can't go ${row.status} → ${next}` }
  }
  const updated = await applyAchStatus(admin, row, next, code, { kind: "service", userId: row.user_id })
  return { ok: true, duplicate: false, applied: updated.status === next, payment: updated }
}

/** Approve or decline an ACH payment waiting in Approvals (guarded against double decisions). */
export async function decideAch(
  db: SupabaseClient,
  /** The admin deciding (recorded as approved_by); the requester stays row.user_id. */
  approverId: string,
  row: AchPaymentRow,
  action: "approve" | "decline",
  note?: string
): Promise<{ ok: true; row: AchPaymentRow } | { ok: false; status: number; error: string }> {
  if (row.status !== "PENDING_APPROVAL") {
    return { ok: false, status: 409, error: `This payment was already ${row.status === "REJECTED" ? "declined" : "approved"}` }
  }
  const now = new Date().toISOString()
  const n = note?.trim() || null
  const { data } = await db
    .from("sancus_ach_payments")
    .update(
      action === "approve"
        ? { status: "CREATED", approved_at: now, approved_by: approverId, decided_at: now, decided_note: n }
        : { status: "REJECTED", decided_at: now, decided_note: n, failure_reason: n ? `Declined: ${n}` : "Declined by approver" }
    )
    .eq("id", row.id)
    .eq("status", "PENDING_APPROVAL")
    .select("*")
    .maybeSingle()
  if (!data) return { ok: false, status: 409, error: "Someone already decided this payment" }
  const claimed = data as AchPaymentRow
  if (action === "decline") {
    await syncAchLedger(db, claimed) // releases the reserve
    return { ok: true, row: claimed }
  }
  return { ok: true, row: await executeAch(db, claimed.user_id, claimed) }
}
