"use client"

// Sancus: treasury summary strip (total / available / reserved / delivered + ledger check).

import * as React from "react"
import { IconAlertTriangle, IconCircleCheck, IconDownload, IconRefresh } from "@tabler/icons-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { displayMinor, USDC_DECIMALS } from "@/lib/sancus/money"
import type { TreasurySummary as Summary } from "@/lib/sancus/treasury"

const usd = (minor: string | null | undefined) =>
  minor == null ? "–" : `${BigInt(minor) < 0n ? "-" : ""}$${displayMinor(BigInt(minor) < 0n ? -BigInt(minor) : BigInt(minor), USDC_DECIMALS, "", 2)}`

async function fetchSummary(): Promise<{ ok: true; data: Summary } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/sancus/treasury", { cache: "no-store" })
    const body = await res.json()
    if (!res.ok) return { ok: false, error: body.error ?? "Could not load treasury" }
    return { ok: true, data: body as Summary }
  } catch {
    return { ok: false, error: "Could not reach the server" }
  }
}

export function TreasurySummary({ refreshKey = 0 }: { refreshKey?: number }) {
  const [summary, setSummary] = React.useState<Summary | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  const apply = React.useCallback((r: Awaited<ReturnType<typeof fetchSummary>>) => {
    setLoading(false)
    if (r.ok) {
      setSummary(r.data)
      setError(null)
    } else setError(r.error)
  }, [])

  React.useEffect(() => {
    let cancelled = false
    fetchSummary().then((r) => !cancelled && apply(r))
    return () => {
      cancelled = true
    }
  }, [refreshKey, apply])

  // Keep it live while payouts are moving.
  const moving = (summary?.payouts.inFlightCount ?? 0) > 0
  React.useEffect(() => {
    if (!moving) return
    const t = setInterval(() => fetchSummary().then(apply), 4000)
    return () => clearInterval(t)
  }, [moving, apply])

  function refresh() {
    setLoading(true)
    fetchSummary().then(apply)
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Treasury</CardTitle>
          <CardDescription>
            Live USDC across your Circle wallets and Gateway balance on Arc, minus payouts in progress.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {summary &&
            (summary.ledger.inSync ? (
              <Badge variant="secondary" className="gap-1">
                <IconCircleCheck className="size-3.5" /> Ledger in sync
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1">
                <IconAlertTriangle className="size-3.5" /> Ledger mismatch
              </Badge>
            ))}
          <Button variant="outline" size="sm" asChild>
            <a href="/api/sancus/ledger?format=csv">
              <IconDownload /> Ledger CSV
            </a>
          </Button>
          <Button variant="ghost" size="icon" onClick={refresh} aria-label="Refresh treasury" disabled={loading}>
            <IconRefresh className={loading ? "animate-spin" : ""} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <p className="text-destructive text-sm">{error}</p>}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Available to spend" value={usd(summary?.availableMinor)} emphasis />
          <Stat
            label="Total treasury"
            value={usd(summary?.totalMinor)}
            hint={summary ? `Wallets ${usd(summary.walletsMinor)} · Gateway ${usd(summary.gatewayMinor)}` : undefined}
          />
          <Stat
            label="Reserved for payouts"
            value={usd(summary?.reservedMinor)}
            hint={summary ? `${summary.payouts.inFlightCount} in progress · ${usd(summary.inFlightMinor)} sent to partner` : undefined}
          />
          <Stat
            label="Delivered"
            value={usd(summary?.payouts.deliveredMinor)}
            hint={
              summary && summary.payouts.simulatedDeliveredMinor !== "0"
                ? `${usd(summary.payouts.simulatedDeliveredMinor)} simulated`
                : undefined
            }
          />
        </div>
        {summary && summary.warnings.length > 0 && (
          <ul className="text-muted-foreground flex flex-col gap-1 text-xs">
            {summary.warnings.map((w) => (
              <li key={w} className="flex items-center gap-1">
                <IconAlertTriangle className="size-3.5 shrink-0 text-amber-600" /> {w}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function Stat({ label, value, hint, emphasis }: { label: string; value: string; hint?: string; emphasis?: boolean }) {
  return (
    <div className="bg-muted/40 rounded-lg border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={emphasis ? "text-2xl font-semibold tabular-nums" : "text-xl font-semibold tabular-nums"}>{value}</p>
      {hint && <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>}
    </div>
  )
}
