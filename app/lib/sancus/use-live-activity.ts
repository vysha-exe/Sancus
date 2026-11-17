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
    rail: p.rail,
    status: statusFromPayout(p.status),
    simulated: p.simulated,
    href: "/activity",
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
        const res = await fetch("/api/sancus/payouts", { cache: "no-store" })
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
