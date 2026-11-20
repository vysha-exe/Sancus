"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { PayFlowHead } from "@/components/sancus-ui/pay-steps"
import { StatusPill } from "@/components/sancus-ui/status-pill"
import { PAYMENT_LINK_PAYEE_PREFIX, usePayFlow } from "@/lib/sancus/pay-flow"
import { can, useAccount } from "@/lib/sancus/use-account"

export default function PayReviewPage() {
  const router = useRouter()
  const { recipient, state, view, quoteLoading, quoteError, submit, submitting, providerBacked, sourceAccount } = usePayFlow()
  const [error, setError] = useState<string | null>(null)
  const { account } = useAccount()
  // Employees can only ask: every payment they start waits for an admin.
  const requestOnly = !can(account, "money.send") && can(account, "money.request")
  const quoteReady = view.localLabel !== "–"

  useEffect(() => {
    if (!recipient) router.replace("/pay")
  }, [recipient, router])

  async function pay() {
    setError(null)
    const result = await submit()
    if (result.ok) router.push("/pay/done")
    else setError(result.error)
  }

  if (!recipient) return null

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
              <span className="body-strong">
                Fund from {sourceAccount?.parentId === null ? "parent treasury" : sourceAccount?.name ?? "selected account"}
              </span>
              <StatusPill status="Pending" />
              <span className="data">{view.totalLabel} including fee</span>
            </div>
            <div className="hop">
              <i className="todo" />
              <span className="body-strong">Convert at the live rate</span>
              <span className="body-s muted">{view.rateLabel}</span>
              <span className="data">Re-quoted when you pay</span>
            </div>
            <div className="hop">
              <i className="todo" />
              <span className="body-strong">Pay out via {state.rail}</span>
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
              Converted from USDC at the live rate: {view.rateLabel}.
            </span>
          </div>
        </section>

        <aside className="tile s5">
          <div className="sx-quote">
            <dl>
              <dt>Paying from</dt>
              <dd>{sourceAccount?.parentId === null ? "Parent treasury" : sourceAccount?.name ?? "***"}</dd>
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
            <span className="sx-quote__lock">Live rate</span>
          </div>

          {error || quoteError ? (
            <p className="body-s" role="alert" style={{ color: "var(--danger, #c0392b)", margin: 0 }}>
              {error ?? quoteError}
            </p>
          ) : null}

          {recipient.id.startsWith(PAYMENT_LINK_PAYEE_PREFIX) ? (
            <p className="body-s muted" style={{ margin: 0 }}>
              <span className="sx-pill sx-pill--simulated">Simulated</span> Sending to a USDC address is a demo here. No money moves.
            </p>
          ) : null}

          {requestOnly ? (
            <p className="body-s muted" style={{ margin: 0 }}>
              An admin approves this before any money moves. You&apos;ll get a notification when they decide.
            </p>
          ) : null}

          <div className="tile-foot" style={{ borderTop: 0, paddingTop: 0 }}>
            {quoteReady && !quoteLoading && !quoteError ? (
              providerBacked ? (
                <button
                  type="button"
                  className="sx-btn sx-btn--primary"
                  style={{ width: "100%" }}
                  onClick={pay}
                  disabled={submitting}
                >
                  {submitting ? "Sending…" : requestOnly ? `Request ${view.localLabel}` : `Pay ${view.localLabel}`}
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
                disabled
              >
                {quoteLoading ? "Calculating…" : "Rate unavailable"}
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
