"use client"

import { useEffect, useState } from "react"
import { balance as demoBalance } from "@/lib/sancus/demo-data"
import { displayMinor, USDC_DECIMALS } from "@/lib/sancus/money"
import type { TreasurySummary } from "@/lib/sancus/treasury"

export type LiveBalance = {
  source: "live" | "demo"
  availableLabel: string
  meta: string
  loading: boolean
  error: string | null
  summary: TreasurySummary | null
}

function usdLabel(minor: string): string {
  const n = BigInt(minor)
  const neg = n < 0n
  const abs = neg ? -n : n
  return `${neg ? "-" : ""}$${displayMinor(abs, USDC_DECIMALS, "", 2)}`
}

/** Pass `refreshKey` (e.g. a payout status) to re-read the treasury when it changes. */
export function useLiveTreasury(refreshKey?: string | number): LiveBalance {
  const [summary, setSummary] = useState<TreasurySummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/sancus/treasury", { cache: "no-store" })
        if (res.status === 401 || res.status === 403) {
          if (!cancelled) {
            setSummary(null)
            setError(null)
            setLoading(false)
          }
          return
        }
        const body = await res.json()
        if (!res.ok) {
          if (!cancelled) {
            setError(body.error ?? "Could not load treasury")
            setLoading(false)
          }
          return
        }
        if (!cancelled) {
          setSummary(body as TreasurySummary)
          setError(null)
          setLoading(false)
        }
      } catch {
        if (!cancelled) {
          setError(null)
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  if (!summary) {
    return {
      source: "demo",
      availableLabel: demoBalance.availableLabel,
      meta: demoBalance.meta,
      loading,
      error,
      summary: null,
    }
  }

  const reserved = usdLabel(summary.reservedMinor)
  const inFlight = usdLabel(summary.inFlightMinor)
  const metaParts = [
    Number(summary.reservedMinor) > 0 ? `${reserved} reserved for payouts` : null,
    Number(summary.inFlightMinor) > 0 ? `${inFlight} on its way` : null,
    "backed 1:1 by USDC",
  ].filter(Boolean)

  return {
    source: "live",
    availableLabel: usdLabel(summary.availableMinor),
    meta: metaParts.join(" · "),
    loading: false,
    error,
    summary,
  }
}
