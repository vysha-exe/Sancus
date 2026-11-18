"use client"

import Link from "next/link"
import { useCallback, useState } from "react"
import { AgentConsole, useAgentStatus } from "@/components/sancus-ui/agent-console"
import { X402Earnings } from "@/components/sancus-ui/x402-earnings"

const PAUSE_KEY = "sancus-agent-paused"
const usd6 = (m: string | number) => `$${(Number(m) / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`

export default function AgentsPage() {
  const status = useAgentStatus()
  const w = status?.wallet
  const spent = Number(w?.spentTodayMinor ?? 0)
  const cap = Number(w?.dailyCapMinor ?? 1)
  const pct = Math.min(100, Math.round((spent / cap) * 100))
  const atCap = w?.configured && spent >= cap

  const [paused, setPaused] = useState(() => {
    try {
      return localStorage.getItem(PAUSE_KEY) === "1"
    } catch {
      return false
    }
  })

  const togglePause = useCallback(() => {
    setPaused((p) => {
      const next = !p
      try {
        localStorage.setItem(PAUSE_KEY, next ? "1" : "0")
      } catch {
        /* private mode */
      }
      return next
    })
  }, [])

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="sx-h heading-2">Agents</h1>
          <p className="body-s muted" style={{ margin: 0 }}>
            Ask about your money or let an agent handle small payments inside a budget.
          </p>
        </div>
        <Link href="/activity" className="sx-btn sx-btn--secondary sx-btn--sm">
          Agent activity
        </Link>
      </header>

      <div className="grid">
        <AgentConsole paused={paused} />
      </div>

      <div className="grid">
        <section className="tile s6" aria-labelledby="pa">
          <div className="tile-head">
            <h2 className="tile-title" id="pa">
              Payments agent
            </h2>
            <span className={`sx-pill ${paused ? "sx-pill--pending" : "sx-pill--settled"}`}>{paused ? "Paused" : "On"}</span>
          </div>
          <div className="ag-mini">
            {!w ? (
              <div className="empty">Loading budget…</div>
            ) : !w.configured ? (
              <span className="body-s">
                No agent wallet yet — data purchases are disabled until you generate and fund the x402 buyer wallet.
              </span>
            ) : (
              <>
                <div className="kv">
                  <span>Spent on data today</span>
                  <span>
                    {usd6(spent)} of {usd6(cap)}
                  </span>
                </div>
                <div
                  className="meter meter--held"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${pct}% of daily data budget used`}
                >
                  <i style={{ width: `${pct}%` }} />
                </div>
                {atCap ? (
                  <span className="body-s" role="status">
                    Daily cap reached. The agent won&apos;t buy more route data until the cap resets.
                  </span>
                ) : (
                  <span className="body-s muted">Micropayments for live quotes count against this daily cap.</span>
                )}
              </>
            )}
          </div>
          <div className="tile-foot">
            <span className="body-s muted">Daily data cap from agent policy</span>
            <span style={{ display: "flex", gap: 6 }}>
              <button type="button" className="sx-btn sx-btn--secondary sx-btn--sm" onClick={togglePause}>
                {paused ? "Resume" : "Pause"}
              </button>
            </span>
          </div>
        </section>

        <X402Earnings />
      </div>
    </div>
  )
}