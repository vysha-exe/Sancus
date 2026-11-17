"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { PayFlowHead } from "@/components/sancus-ui/pay-steps"
import { StatusPill } from "@/components/sancus-ui/status-pill"
import { usePayFlow } from "@/lib/sancus/pay-flow"

export default function PayReviewPage() {
  const { recipient, state, quote } = usePayFlow()
  const [seconds, setSeconds] = useState(42)

  useEffect(() => {
    if (seconds <= 0) return
    const t = window.setTimeout(() => setSeconds((s) => s - 1), 1000)
    return () => window.clearTimeout(t)
  }, [seconds])

  const lockLabel =
    seconds > 0
      ? `Rate locked · 0:${String(seconds).padStart(2, "0")}`
      : "Rate expired"

  return (
    <div className="page">
      <PayFlowHead title="Review payment" step={3} backHref="/pay/amount" />

      <div className="grid">
        <section className="tile s7" aria-label="Payment path">
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <span className="av av--lg">{recipient.initials}</span>
            <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
              <h2 className="sx-h heading-3 trunc">{recipient.name}</h2>
              <span className="body-s muted">
                {recipient.kind} · {recipient.country}
              </span>
            </div>
          </div>

          <div style={{ display: "grid", gap: 0, marginTop: 8 }}>
            <div className="hop">
              <i />
              <span className="body-strong">Fund from your balance</span>
              <StatusPill status="Pending" />
              <span className="data">{quote.totalLabel} including fee</span>
            </div>
            <div className="hop">
              <i className="todo" />
              <span className="body-strong">Convert at locked rate</span>
              <span className="body-s muted">{quote.rateLabel}</span>
              <span className="data">Locks when you confirm</span>
            </div>
            <div className="hop">
              <i className="todo" />
              <span className="body-strong">Pay out via {state.rail}</span>
              <StatusPill status="Simulated" />
              <span className="data">{quote.brlLabel} · {quote.arrival}</span>
            </div>
          </div>

          {state.memo ? (
            <div className="kv">
              <span>Memo</span>
              <span>{state.memo}</span>
            </div>
          ) : null}

          <div className="tile-foot">
            <span className="body-s muted">
              If the rate moves more than 1% before they receive it, we stop and ask you.
            </span>
          </div>
        </section>

        <aside className="tile s5">
          <div className="sx-quote">
            <dl>
              <dt>You send</dt>
              <dd>{quote.usdLabel}</dd>
              <dt>Fee</dt>
              <dd>{quote.feeLabel}</dd>
              <dt>Total from balance</dt>
              <dd>{quote.totalLabel}</dd>
              <dt>Rate</dt>
              <dd>{quote.rateLabel}</dd>
              <dt>Rail</dt>
              <dd>
                <span className="sx-rail">{state.rail}</span>
              </dd>
              <dt>Arrival</dt>
              <dd>{quote.arrival}</dd>
            </dl>
            <div className="sx-quote__receive">
              <span className="sx-label">They receive</span>
              <b>{quote.brlLabel}</b>
            </div>
            <span className="sx-quote__lock">{lockLabel}</span>
          </div>
          <div className="tile-foot" style={{ borderTop: 0, paddingTop: 0 }}>
            {seconds > 0 ? (
              <Link href="/pay/done" className="sx-btn sx-btn--primary" style={{ width: "100%" }}>
                Pay {quote.brlLabel}
              </Link>
            ) : (
              <button
                type="button"
                className="sx-btn sx-btn--primary"
                style={{ width: "100%" }}
                onClick={() => setSeconds(60)}
              >
                Refresh rate
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
