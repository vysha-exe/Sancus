"use client"

// Live approval queue from GET /api/sancus/approvals, with demo data when signed out.
// Every hook instance listens for a window event so approving on one screen
// updates the sidebar badge, Home tile and Activity tab straight away.

import { useCallback, useEffect, useState } from "react"
import { approvals as demoApprovals } from "@/lib/sancus/demo-data"
import { displayMinor, SGD_DECIMALS, USDC_DECIMALS } from "@/lib/sancus/money"
import type { PayoutDto } from "@/lib/sancus/payouts"

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
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("")

export function fromPayout(p: PayoutDto): ApprovalItem {
  const usdc = BigInt(p.usdcAmountMinor)
  return {
    id: p.id,
    who: `You → ${p.recipientName}`,
    asker: "You",
    initials: initials(p.recipientName),
    to: p.recipientName,
    rail: p.rail === "PAYNOW" ? "PayNow" : "FAST",
    amountLabel: `$${displayMinor(usdc, USDC_DECIMALS, "", 2)}`,
    amountUsd: Number(usdc) / 1_000_000,
    reason: p.approvalReason ?? "Needs an approver",
    localAmount: `S$ ${displayMinor(BigInt(p.sgdAmountMinor), SGD_DECIMALS, "", 2)}`,
    rate: `1 USD = ${p.clientRate} SGD`,
    fee: `S$ ${displayMinor(BigInt(p.feeSgdMinor), SGD_DECIMALS, "", 2)}`,
    arrival: "within seconds",
    when: `${new Date(p.createdAt).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}${p.reference ? ` · "${p.reference}"` : ""}`,
    decision: p.status === "PENDING_APPROVAL" ? undefined : p.status === "REJECTED" ? "declined" : "approved",
    live: true,
  }
}

const demoItems: ApprovalItem[] = demoApprovals.map((a) => ({
  id: a.id,
  who: a.who,
  asker: a.who.split(" → ")[0]!,
  initials: initials(a.who.split(" → ")[0]!),
  to: a.who.split(" → ")[1] ?? "",
  rail: "",
  amountLabel: a.amount,
  amountUsd: a.amountUsd,
  reason: a.reason,
  localAmount: a.amount,
  rate: "",
  fee: "",
  arrival: "",
  when: a.detail,
  live: false,
}))

type Result =
  | { ok: true; waiting: ApprovalItem[]; decided: ApprovalItem[] }
  | { ok: false; unauthorized: boolean; error?: string }

async function fetchApprovals(): Promise<Result> {
  try {
    let res = await fetch("/api/sancus/approvals", { cache: "no-store" })
    if (res.status === 401) {
      // Right after demo auto-login the session cookie can lag; retry once.
      await new Promise((r) => setTimeout(r, 1200))
      res = await fetch("/api/sancus/approvals", { cache: "no-store" })
    }
    if (res.status === 401) return { ok: false, unauthorized: true }
    const body = await res.json()
    if (!res.ok) return { ok: false, unauthorized: false, error: body.error }
    return {
      ok: true,
      waiting: (body.waiting as PayoutDto[]).map(fromPayout),
      decided: (body.decided as PayoutDto[]).map(fromPayout),
    }
  } catch {
    return { ok: false, unauthorized: false, error: "Could not reach the server" }
  }
}

export function useLiveApprovals() {
  const [state, setState] = useState<{ source: "live" | "demo"; waiting: ApprovalItem[]; decided: ApprovalItem[] }>({
    source: "demo",
    waiting: demoItems,
    decided: [],
  })
  const [error, setError] = useState<string | null>(null)

  const apply = useCallback((r: Result) => {
    if (r.ok) {
      setState({ source: "live", waiting: r.waiting, decided: r.decided })
      setError(null)
    } else if (!r.unauthorized && r.error) {
      setError(r.error)
    }
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
  return { ...state, waitingTotal, error, decide }
}

/** Tell every approvals hook on the page to refetch (e.g. after a payout was sent for approval). */
export function notifyApprovalsChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGED))
}
