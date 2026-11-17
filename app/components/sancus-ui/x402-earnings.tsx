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
const short = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a)

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
    // Earnings arrive from outside agents at any time; keep the tile fresh.
    const t = setInterval(tick, 5000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [])

  return (
    <section className="tile s5" aria-labelledby="x402">
      <div className="tile-head">
        <h2 className="tile-title" id="x402">
          Paid by other agents
        </h2>
        {data ? (
          <span className={`sx-pill ${data.configured ? "sx-pill--settled" : "sx-pill--pending"}`}>
            {data.configured ? "Live" : "Not set up"}
          </span>
        ) : (
          <button type="button" className="sx-btn sx-btn--quiet">
            Add an endpoint
          </button>
        )}
      </div>
      <div className="tbl-wrap">
        <table className="tbl" style={{ minWidth: 0 }}>
          <thead>
            <tr>
              <th>Endpoint</th>
              <th className="num">Price</th>
              <th className="num">Paid</th>
              <th className="num">Earned</th>
            </tr>
          </thead>
          <tbody>
            {data ? (
              data.endpoints.map((e) => (
                <tr key={e.path}>
                  <td className="data" title={e.description}>
                    GET {e.path.replace("/api/x402", "")}
                  </td>
                  <td className="num">${e.price}</td>
                  <td className="num">{data.calls}</td>
                  <td className="num" style={{ color: "var(--settled)" }}>
                    +{usd(data.totalMinor)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="data">GET /market-data</td>
                <td className="num">$0.05</td>
                <td className="num">24</td>
                <td className="num" style={{ color: "var(--settled)" }}>
                  {agents.earned}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && data.recent.length > 0 ? (
        <div className="sx-rows">
          {data.recent.slice(0, 3).map((r) => (
            <div key={r.id} className="sx-row">
              <span className="sx-row__who">Agent {short(r.payer)}</span>
              <span className="sx-row__amount sx-row__amount--in">+{usd(r.amountMinor, 4)}</span>
              <span className="sx-row__meta">
                <span className="sx-rail">x402</span> {new Date(r.createdAt).toLocaleTimeString()}
              </span>
              <span />
            </div>
          ))}
        </div>
      ) : null}

      <div className="tile-foot">
        <span className="body-s muted">
          {data
            ? data.configured
              ? `${data.last24hCalls} paid call${data.last24hCalls === 1 ? "" : "s"} in 24 h · ${data.payers} agent${data.payers === 1 ? "" : "s"} · lands in ${short(data.payTo ?? "")} via Circle Gateway`
              : "Create an Arc wallet (or set SANCUS_X402_PAY_TO) to start earning"
            : "$0.10 is on its way to your balance"}
        </span>
        <a href="/api/x402" target="_blank" rel="noreferrer" className="sx-btn sx-btn--quiet">
          Discovery
        </a>
      </div>
    </section>
  )
}
