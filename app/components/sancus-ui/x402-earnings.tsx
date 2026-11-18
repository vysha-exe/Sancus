"use client"

// Agents › Paid by other agents: live x402 earnings (GET /api/sancus/x402/earnings).
import { useEffect, useState } from "react"
import { displayMinor, USDC_DECIMALS } from "@/lib/sancus/money"
import { agents } from "@/lib/sancus/demo-data"

type Earnings = {
  totalMinor: string
  calls: number
  last24hMinor: string
  last24hCalls: number
  payers: number
  configured: boolean
  payTo: string | null
  endpoints: { path: string; price: string; description: string }[]
  recent: { id: string; endpoint: string; payer: string; amountMinor: string; createdAt: string }[]
}

const usd = (minor: string, digits = 2) => `$${displayMinor(BigInt(minor), USDC_DECIMALS, "", digits)}`

async function load(): Promise<Earnings | null> {
  try {
    let res = await fetch("/api/sancus/x402/earnings", { cache: "no-store" })
    if (res.status === 401) {
      await new Promise((r) => setTimeout(r, 1200))
      res = await fetch("/api/sancus/x402/earnings", { cache: "no-store" })
    }
    return res.ok ? ((await res.json()) as Earnings) : null
  } catch {
    return null
  }
}

export function X402Earnings() {
  const [data, setData] = useState<Earnings | null>(null)

  useEffect(() => {
    let cancelled = false
    const tick = () => load().then((d) => !cancelled && d && setData(d))
    tick()
    const t = setInterval(tick, 5000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [])

  const endpoint = data?.endpoints[0]
  const pathLabel = endpoint ? `GET ${endpoint.path.replace("/api/x402", "")}` : "GET /market-data"
  const priceLabel = endpoint ? `$${endpoint.price} / call` : "$0.05 / call"
  const earnedLabel = data ? `+${usd(data.totalMinor)}` : agents.earned
  const callsLabel = data ? `${data.calls} call${data.calls === 1 ? "" : "s"} paid` : "24 calls paid"
  const footLabel = data
    ? data.configured
      ? `${data.last24hCalls} paid in 24 h`
      : "Not set up yet"
    : "$0.10 on its way"

  return (
    <section className="tile s6" aria-labelledby="x402">
      <div className="tile-head">
        <h2 className="tile-title" id="x402">
          Paid by other agents
        </h2>
        <span className="body-s muted">{data?.endpoints.length ?? 1} endpoint{(data?.endpoints.length ?? 1) === 1 ? "" : "s"}</span>
      </div>
      <div className="ag-mini">
        <div className="kv">
          <span className="data">{pathLabel}</span>
          <span>{priceLabel}</span>
        </div>
        <div className="kv">
          <span>Earned this month</span>
          <span style={{ color: "var(--settled)" }}>{earnedLabel}</span>
        </div>
        <span className="body-s muted">{callsLabel}</span>
      </div>
      <div className="tile-foot">
        <span className="body-s muted">{footLabel}</span>
        <a href="/api/x402" target="_blank" rel="noreferrer" className="sx-btn sx-btn--secondary sx-btn--sm">
          Add endpoint
        </a>
      </div>
    </section>
  )
}
