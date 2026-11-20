"use client"

// Live approval queue from GET /api/sancus/approvals.
// Every hook instance listens for a window event so approving on one screen
// updates the sidebar badge, Home tile and Activity tab straight away.

import { useCallback, useEffect, useState } from "react"
import { displayMinor, SGD_DECIMALS, USDC_DECIMALS } from "@/lib/sancus/money"
import type { AchPaymentDto } from "@/lib/sancus/ach"
import type { PayoutDto } from "@/lib/sancus/payouts"
import type { InternalTransferDto } from "@/lib/sancus/internal-transfers"
import { fixedUsdRateLabel } from "@/lib/sancus/fixed-rates"

const CHANGED = "sancus:approvals-changed"

export type ApprovalItem = {
  id: string
  /** "Ana → Gráfica Aurora" style label */
  who: string
  asker: string
  initials: string
  to: string
  rail: string
  amountLabel: string
  amountUsd: number
  reason: string
  localAmount: string
  rate: string
  fee: string
  arrival: string
  when: string
  decision?: "approved" | "declined"
  live: boolean
  /** Whether the signed-in person may approve/decline it (never their own company payment). */
  canDecide: boolean
  /** Why not, in plain words, when canDecide is false. */
  cantDecideReason: string | null
  /** True when the signed-in person asked for it. */
  mine: boolean
}

/** Extra fields GET /api/sancus/approvals adds to each payout / ACH payment. */
type Decorated = {
  requester?: { name: string; isYou: boolean }
  canDecide?: boolean
  cantDecideReason?: string | null
}

function askedBy(d: Decorated) {
  const asker = d.requester?.name ?? "You"
  return {
    asker,
    mine: d.requester?.isYou ?? true,
    canDecide: d.canDecide ?? true,
    cantDecideReason: d.cantDecideReason ?? null,
  }
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("")

export function fromPayout(p: PayoutDto & Decorated): ApprovalItem {
  const usdc = BigInt(p.usdcAmountMinor)
  const by = askedBy(p)
  return {
    ...by,
    id: p.id,
    who: `${by.asker} → ${p.recipientName}`,
    initials: initials(p.recipientName),
    to: p.recipientName,
    rail: p.rail === "PAYNOW" ? "PayNow" : "FAST",
    amountLabel: `$${displayMinor(usdc, USDC_DECIMALS, "", 2)}`,
    amountUsd: Number(usdc) / 1_000_000,
    reason: p.approvalReason ?? "Needs an approver",
    localAmount: `S$ ${displayMinor(BigInt(p.sgdAmountMinor), SGD_DECIMALS, "", 2)}`,
    rate: fixedUsdRateLabel("SGD"),
    fee: `S$ ${displayMinor(BigInt(p.feeSgdMinor), SGD_DECIMALS, "", 2)}`,
    arrival: "within seconds",
    when: `${new Date(p.createdAt).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}${p.reference ? ` · "${p.reference}"` : ""}`,
    decision: p.status === "PENDING_APPROVAL" ? undefined : p.status === "REJECTED" ? "declined" : "approved",
    live: true,
  }
}

export function fromAch(p: AchPaymentDto & Decorated): ApprovalItem {
  const usdc = BigInt(p.usdcAmountMinor)
  const name = p.recipient.name
  const by = askedBy(p)
  return {
    ...by,
    id: p.id,
    who: `${by.asker} → ${name}`,
    initials: initials(name),
    to: name,
    rail: p.speed === "SAME_DAY" ? "Same-day ACH" : "ACH",
    amountLabel: `$${displayMinor(usdc, USDC_DECIMALS, "", 2)}`,
    amountUsd: Number(usdc) / 1_000_000,
    reason: p.approvalReason ?? "Needs an approver",
    localAmount: `US$ ${displayMinor(BigInt(p.usdAmountMinor), 2, "", 2)} to ${p.recipient.bankName} ${p.recipient.accountMasked}`,
    rate: "1 USDC = 1 USD",
    fee: `US$ ${displayMinor(BigInt(p.feeUsdMinor), 2, "", 2)}`,
    arrival: p.timeline.eta,
    when: `${new Date(p.createdAt).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}${p.reference ? ` · "${p.reference}"` : ""}`,
    decision: p.status === "PENDING_APPROVAL" ? undefined : p.status === "REJECTED" ? "declined" : "approved",
    live: true,
  }
}

export function fromInternalTransfer(p: InternalTransferDto): ApprovalItem {
  const usdc = BigInt(p.usdcAmountMinor)
  return {
    id: p.id,
    who: `${p.sourceName} → ${p.destinationName}`,
    asker: p.sourceName,
    initials: initials(p.destinationName),
    to: p.destinationName,
    rail: "Internal",
    amountLabel: `$${displayMinor(usdc, USDC_DECIMALS, "", 2)}`,
    amountUsd: Number(usdc) / 1_000_000,
    reason: p.approvalReason ?? "Internal treasury transfer needs approval",
    localAmount: `${p.sourceCurrency} → ${p.destinationCurrency}`,
    rate: "Fixed demo rates",
    fee: "$0.00",
    arrival: "within seconds",
    when: new Date(p.createdAt).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" }),
    decision: p.status === "PENDING_APPROVAL" ? undefined : p.status === "DECLINED" ? "declined" : "approved",
    live: true,
    canDecide: true,
    cantDecideReason: null,
    mine: false,
  }
}

type Result =
  | { ok: true; waiting: ApprovalItem[]; decided: ApprovalItem[] }
  | { ok: false; unauthorized: boolean; error?: string }

async function fetchApprovals(): Promise<Result> {
  try {
    let res = await fetch("/api/sancus/approvals", { cache: "no-store" })
    if (res.status === 401) {
      // Right after demo auto-login the session cookie can lag; retry once.
      await new Promise((r) => setTimeout(r, 400))
      res = await fetch("/api/sancus/approvals", { cache: "no-store" })
    }
    if (res.status === 401) return { ok: false, unauthorized: true }
    const body = await res.json()
    if (!res.ok) return { ok: false, unauthorized: false, error: body.error }
    return {
      ok: true,
      waiting: [
        ...(body.waiting as PayoutDto[]).map(fromPayout),
        ...((body.achWaiting ?? []) as AchPaymentDto[]).map(fromAch),
        ...((body.internalWaiting ?? []) as InternalTransferDto[]).map(fromInternalTransfer),
      ],
      decided: [
        ...(body.decided as PayoutDto[]).map(fromPayout),
        ...((body.achDecided ?? []) as AchPaymentDto[]).map(fromAch),
        ...((body.internalDecided ?? []) as InternalTransferDto[]).map(fromInternalTransfer),
      ],
    }
  } catch {
    return { ok: false, unauthorized: false, error: "Could not reach the server" }
  }
}

export function useLiveApprovals() {
  const [state, setState] = useState<{ source: "live" | "demo"; waiting: ApprovalItem[]; decided: ApprovalItem[] }>({
    source: "demo",
    waiting: [],
    decided: [],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const apply = useCallback((r: Result) => {
    if (r.ok) {
      setState({ source: "live", waiting: r.waiting, decided: r.decided })
      setError(null)
    } else if (r.unauthorized) {
      // Guest / signed-out: no seeded demo queue — product entry is real auth.
      setState({ source: "live", waiting: [], decided: [] })
    } else if (!r.unauthorized && r.error) {
      setState({ source: "live", waiting: [], decided: [] })
      setError(r.error)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = () => fetchApprovals().then((r) => !cancelled && apply(r))
    load()
    window.addEventListener(CHANGED, load)
    return () => {
      cancelled = true
      window.removeEventListener(CHANGED, load)
    }
  }, [apply])

  /** Approve or decline a live request. Returns an error message, or null on success. */
  const decide = useCallback(
    async (id: string, action: "approve" | "decline", note?: string): Promise<string | null> => {
      try {
        const res = await fetch(`/api/sancus/approvals/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, note: note || undefined }),
        })
        const body = await res.json()
        window.dispatchEvent(new Event(CHANGED))
        return res.ok ? null : body.error ?? "Could not save the decision"
      } catch {
        return "Could not reach the server"
      }
    },
    []
  )

  const waitingTotal = state.waiting.reduce((s, a) => s + a.amountUsd, 0)
  return { ...state, waitingTotal, loading, error, decide }
}

/** Tell every approvals hook on the page to refetch (e.g. after a payout was sent for approval). */
export function notifyApprovalsChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGED))
}
