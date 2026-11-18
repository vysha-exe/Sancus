"use client"

import Link from "next/link"
import { useLiveTreasury } from "@/lib/sancus/use-live-treasury"

export function HomeBalance() {
  const live = useLiveTreasury()

  return (
    <section className="tile s8" aria-labelledby="bal">
      <div className="tile-head">
        <span className="sx-label" id="bal">
          Available balance
        </span>
        <div className="filters" role="group" aria-label="Chart range">
          {live.source === "live" ? <span className="sx-pill sx-pill--settled">Live</span> : null}
          <button type="button" className="chip" aria-pressed="true">
            This month
          </button>
          <button type="button" className="chip" aria-pressed="false">
            6 months
          </button>
          <button type="button" className="chip" aria-pressed="false">
            Year
          </button>
        </div>
      </div>
      <div className="sx-balance">
        <span className="sx-balance__amount">
          {live.loading ? "…" : live.availableLabel} <small>USD</small>
        </span>
        <span className="sx-balance__meta">{live.meta}</span>
      </div>
      <svg
        viewBox="0 0 600 120"
        preserveAspectRatio="none"
        role="img"
        aria-label="Balance this month"
        style={{ width: "100%", height: 110, color: "var(--accent)" }}
      >
        <line x1="0" y1="119" x2="600" y2="119" stroke="var(--line)" strokeWidth="1" />
        <path
          d="M0 110 H480 V10 H500 V20 H520 V25 H580 V46 H600"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="kv" style={{ marginTop: -6 }}>
        <span className="data">Nov 1</span>
        <span className="data muted">Nov 16</span>
      </div>
      {live.error ? (
        <span className="body-s" style={{ color: "var(--failed)" }}>
          {live.error}
        </span>
      ) : null}
      <div className="tile-foot">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/pay" className="sx-btn sx-btn--primary">
            Pay someone
          </Link>
          <Link href="/receive" className="sx-btn sx-btn--secondary">
            Add money
          </Link>
          <Link href="/team/ana/methods/new" className="sx-btn sx-btn--secondary">
            Give someone a card
          </Link>
        </div>
      </div>
    </section>
  )
}
