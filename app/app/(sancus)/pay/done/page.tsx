"use client"

import Link from "next/link"
import { PayFlowHead } from "@/components/sancus-ui/pay-steps"
import { StatusPill } from "@/components/sancus-ui/status-pill"
import { balance } from "@/lib/sancus/demo-data"
import { usePayFlow } from "@/lib/sancus/pay-flow"

export default function PayDonePage() {
  const { recipient, quote, state } = usePayFlow()

  return (
    <div className="page">
      <PayFlowHead title="Payment sent" step={4} />

      <div className="grid">
        <section className="tile s7" aria-label="Confirmation">
          <div style={{ display: "grid", gap: 12, justifyItems: "start" }}>
            <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
              <circle
                cx="32"
                cy="32"
                r="28"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="3"
              />
              <path
                d="M20 33l8 8 16-18"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <h2 className="sx-h heading-2" style={{ margin: 0 }}>
              Done. {recipient.name.split(" ")[0]} has her {quote.brlLabel}.
            </h2>
            <p className="body muted" style={{ margin: 0, maxWidth: "62ch" }}>
              {quote.totalLabel} left your balance · {state.rail} · ref pay_7f2a…c91
            </p>
          </div>

          <div style={{ display: "grid", gap: 0, marginTop: 8 }}>
            <div className="hop">
              <i />
              <span className="body-strong">Funded from balance</span>
              <StatusPill status="Settled" />
              <span className="data">{quote.totalLabel}</span>
            </div>
            <div className="hop">
              <i />
              <span className="body-strong">Converted</span>
              <StatusPill status="Settled" />
              <span className="data">{quote.rateLabel}</span>
            </div>
            <div className="hop">
              <i />
              <span className="body-strong">Paid out via {state.rail}</span>
              <StatusPill status="Settled" />
              <span className="data">
                {quote.brlLabel} · <StatusPill status="Simulated" />
              </span>
            </div>
          </div>
        </section>

        <aside className="tile s5" aria-labelledby="next">
          <h2 className="tile-title" id="next">
            What next
          </h2>
          <div className="kv">
            <span>Payment ID</span>
            <span>pay_7f2a…c91</span>
          </div>
          <div className="kv">
            <span>Available now</span>
            <span>{balance.availableLabel}</span>
          </div>
          <div className="tile-foot" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <button type="button" className="sx-btn sx-btn--secondary">
              Download receipt
            </button>
            <button type="button" className="sx-btn sx-btn--secondary">
              Send receipt
            </button>
            <Link href="/pay" className="sx-btn sx-btn--primary">
              Pay someone else
            </Link>
            <Link href="/home" className="sx-btn sx-btn--quiet">
              Back to Home
            </Link>
          </div>
        </aside>
      </div>
    </div>
  )
}
