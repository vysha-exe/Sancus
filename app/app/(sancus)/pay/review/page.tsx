"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { PayFlowHead } from "@/components/sancus-ui/pay-steps"
import { StatusPill } from "@/components/sancus-ui/status-pill"
import { usePayFlow } from "@/lib/sancus/pay-flow"

export default function PayReviewPage() {
  const router = useRouter()
  const { recipient, state, view, refreshQuote, quoteLoading, quoteError, submit, submitting } = usePayFlow()
  const [demoSeconds, setDemoSeconds] = useState(42)
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)

  // Demo recipients: the wireframe countdown. Live: tick a clock against the quote's expiry.
  useEffect(() => {
    const t = window.setInterval(() => {
      setNow(Date.now())
      setDemoSeconds((s) => (s > 0 ? s - 1 : 0))
    }, 1000)
    return () => window.clearInterval(t)
  }, [])

  const seconds = view.live
    ? view.expiresAt
      ? Math.max(0, Math.floor((new Date(view.expiresAt).getTime() - now) / 1000))
      : 0
    : demoSeconds

  const lockLabel = quoteLoading
    ? "Refreshing rate…"
    : seconds > 0
      ? `Rate locked · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
      : "Rate expired"

  async function pay() {
    setError(null)
    const result = await submit()
    if (result.ok) router.push("/pay/done")
    else setError(result.error)
  }

  function refresh() {
    if (view.live) refreshQuote()
    else setDemoSeconds(60)
  }

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
              <span className="data">{view.totalLabel} including fee</span>
            </div>
            <div className="hop">
              <i className="todo" />
              <span className="body-strong">Convert at locked rate</span>
              <span className="body-s muted">{view.rateLabel}</span>
              <span className="data">Locks when you confirm</span>
            </div>
            <div className="hop">
              <i className="todo" />
              <span className="body-strong">Pay out via {state.rail}</span>
              {view.simulated ? <StatusPill status="Simulated" /> : null}
              <span className="data">
                {view.localLabel} · {view.arrival}
              </span>
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
              <dd>{view.usdLabel}</dd>
              <dt>Fee</dt>
              <dd>{view.feeLabel}</dd>
              <dt>Total from balance</dt>
              <dd>{view.totalLabel}</dd>
              <dt>Rate</dt>
              <dd>{view.rateLabel}</dd>
              <dt>Rail</dt>
              <dd>
                <span className="sx-rail">{state.rail}</span>
              </dd>
              <dt>Arrival</dt>
              <dd>{view.arrival}</dd>
            </dl>
            <div className="sx-quote__receive">
              <span className="sx-label">They receive</span>
              <b>{view.localLabel}</b>
            </div>
            <span className="sx-quote__lock">{lockLabel}</span>
          </div>

          {error || quoteError ? (
            <p className="body-s" role="alert" style={{ color: "var(--danger, #c0392b)", margin: 0 }}>
              {error ?? quoteError}
            </p>
          ) : null}

          <div className="tile-foot" style={{ borderTop: 0, paddingTop: 0 }}>
            {seconds > 0 && !quoteLoading ? (
              view.live ? (
                <button
                  type="button"
                  className="sx-btn sx-btn--primary"
                  style={{ width: "100%" }}
                  onClick={pay}
                  disabled={submitting}
                >
                  {submitting ? "Sending…" : `Pay ${view.localLabel}`}
                </button>
              ) : (
                <Link href="/pay/done" className="sx-btn sx-btn--primary" style={{ width: "100%" }}>
                  Pay {view.localLabel}
                </Link>
              )
            ) : (
              <button
                type="button"
                className="sx-btn sx-btn--primary"
                style={{ width: "100%" }}
                onClick={refresh}
                disabled={quoteLoading}
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
