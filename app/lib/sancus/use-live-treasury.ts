"use client"

import { useEffect, useState } from "react"
import { displayMinor, USDC_DECIMALS } from "@/lib/sancus/money"
import type { TreasurySummary } from "@/lib/sancus/treasury"

const treasuryCache = new Map<string, TreasurySummary>()

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

/**
 * Pass `refreshKey` (e.g. a payout status) to re-read the treasury when it changes.
 * `scope`: a company node id → that company plus its branches; null → personal; undefined → wait.
 */
export function useLiveTreasury(refreshKey?: string | number, scope: string | null | undefined = null): LiveBalance {
  const cacheKey = scope === undefined ? null : scope ? `company:${scope}` : "personal"
  const [snapshot, setSnapshot] = useState<{ key: string | null; summary: TreasurySummary | null }>(() => ({
    key: cacheKey,
    summary: cacheKey ? treasuryCache.get(cacheKey) ?? null : null,
  }))
  const [error, setError] = useState<string | null>(null)
  const visibleSummary = snapshot.key === cacheKey ? snapshot.summary : cacheKey ? treasuryCache.get(cacheKey) ?? null : null
  const [loading, setLoading] = useState(!visibleSummary)

  useEffect(() => {
    if (scope === undefined) return // workspace not known yet
    let cancelled = false
    const key = scope ? `company:${scope}` : "personal"
    const cached = treasuryCache.get(key) ?? null
    // Adopt the last confirmed value for this workspace before the silent refresh.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSnapshot({ key, summary: cached })
    setLoading(!cached)
    ;(async () => {
      try {
        const url = scope ? `/api/sancus/treasury?companyId=${encodeURIComponent(scope)}` : "/api/sancus/treasury"
        const res = await fetch(url, { cache: "no-store" })
        if (res.status === 401 || res.status === 403) {
          if (!cancelled) {
            treasuryCache.delete(key)
            setSnapshot({ key, summary: null })
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
          const next = body as TreasurySummary
          treasuryCache.set(key, next)
          setSnapshot((current) => {
            if (current.key !== key) return current
            return JSON.stringify(current.summary) === JSON.stringify(next) ? current : { key, summary: next }
          })
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
  }, [refreshKey, scope])

  if (!visibleSummary) {
    return {
      source: loading ? "demo" : "live",
      availableLabel: loading ? "***" : "$0.00",
      meta: loading ? "***" : "",
      loading,
      error,
      summary: null,
    }
  }

  const reserved = usdLabel(visibleSummary.reservedMinor)
  const inFlight = usdLabel(visibleSummary.inFlightMinor)
  const metaParts = [
    Number(visibleSummary.reservedMinor) > 0 ? `${reserved} reserved for payouts` : null,
    Number(visibleSummary.inFlightMinor) > 0 ? `${inFlight} on its way` : null,
  ].filter(Boolean)

  return {
    source: "live",
    availableLabel: usdLabel(visibleSummary.availableMinor),
    meta: metaParts.join(" · "),
    loading: false,
    error,
    summary: visibleSummary,
  }
}
