"use client"

import { useEffect, useState } from "react"
import { ledger as demoLedger, type Payment, type Status } from "@/lib/sancus/demo-data"
import { displayMinor, USDC_DECIMALS } from "@/lib/sancus/money"
import type { PayoutDto } from "@/lib/sancus/payouts"

function statusFromPayout(status: string): Status {
  switch (status) {
    case "COMPLETED":
      return "Settled"
    case "FAILED":
    case "CANCELLED":
      return "Failed"
    default:
      return "Pending"
  }
}

function mapPayout(p: PayoutDto): Payment {
  const usdc = displayMinor(BigInt(p.usdcAmountMinor), USDC_DECIMALS, "", 2)
  const sgd = displayMinor(BigInt(p.sgdAmountMinor), 2, "", 2)
  return {
    id: p.id,
    who: p.recipientName,
    amount: `−$${usdc}`,
    meta: `S$ ${sgd} · ${new Date(p.createdAt).toLocaleString()}`,
    rail: p.rail === "PAYNOW" ? "PayNow" : p.rail,
    status: statusFromPayout(p.status),
    simulated: p.simulated,
    href: "/activity",
    ledger: {
      when: new Date(p.createdAt).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" }),
      by: "You",
      theyGot: `S$ ${sgd}`,
      fee: `S$ ${displayMinor(BigInt(p.feeSgdMinor), 2, "", 2)}`,
    },
  }
}

export function useLiveActivity(): {
  source: "live" | "demo"
  payments: Payment[]
  loading: boolean
} {
  const [live, setLive] = useState<Payment[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        let res = await fetch("/api/sancus/payouts", { cache: "no-store" })
        // Right after demo auto-login the session cookie can lag the first request; retry once.
        if (res.status === 401) {
          await new Promise((r) => setTimeout(r, 1200))
          if (cancelled) return
          res = await fetch("/api/sancus/payouts", { cache: "no-store" })
        }
        if (!res.ok) {
          if (!cancelled) setLoading(false)
          return
        }
        const body = (await res.json()) as { payouts?: PayoutDto[] }
        const rows = (body.payouts ?? []).map(mapPayout)
        if (!cancelled) {
          setLive(rows)
          setLoading(false)
        }
      } catch {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!live || live.length === 0) {
    return { source: "demo", payments: demoLedger, loading }
  }

  return { source: "live", payments: live, loading: false }
}
