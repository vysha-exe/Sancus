"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { PayFlowHead } from "@/components/sancus-ui/pay-steps"
import { StatusPill } from "@/components/sancus-ui/status-pill"
import { balance } from "@/lib/sancus/demo-data"
import { usePayFlow } from "@/lib/sancus/pay-flow"
import { useLiveTreasury } from "@/lib/sancus/use-live-treasury"
import { isTerminal, type PayoutStatus } from "@/lib/sancus/payout-provider"
import { displayMinor, SGD_DECIMALS, USDC_DECIMALS } from "@/lib/sancus/money"
import type { PayoutDto } from "@/lib/sancus/payouts"
import type { PixPaymentDto } from "@/lib/sancus/local-rails"

const ORDER: PayoutStatus[] = ["CREATED", "FUNDS_SENT", "CONVERTING", "PAYING_OUT", "COMPLETED"]
const reached = (s: PayoutStatus, step: PayoutStatus) => ORDER.indexOf(s) >= ORDER.indexOf(step)

/** Polls one payout until it finishes. */
function usePayoutStatus(initial: PayoutDto | null) {
  const [latest, setLatest] = useState<PayoutDto | null>(initial)
  const current = latest ?? initial
  const done = !current || isTerminal(current.status)
  const id = initial?.id

  useEffect(() => {
    if (!id || done) return
    const t = window.setInterval(async () => {
      try {
        const res = await fetch("/api/sancus/payouts", { cache: "no-store" })
        if (!res.ok) return
        const body = (await res.json()) as { payouts?: PayoutDto[] }
        const found = body.payouts?.find((p) => p.id === id)
        if (found) setLatest(found)
      } catch {
        /* keep polling */
      }
    }, 2000)
    return () => window.clearInterval(t)
  }, [id, done])

  return current
}

function usePixPaymentStatus(initial: PixPaymentDto | null) {
  const [latest, setLatest] = useState(initial)
  const current = latest ?? initial
  const id = initial?.id
  useEffect(() => {
    if (!id || !current || current.status !== "PENDING") return
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/sancus/pix/payments/${id}/refresh`, { method: "POST" })
      if (!response.ok) return
      const body = (await response.json()) as { payment?: PixPaymentDto }
      if (body.payment) setLatest(body.payment)
    }, 2500)
    return () => window.clearInterval(timer)
  }, [id, current])
  return current
}

export default function PayDonePage() {
  const { recipient, quote, state, view, payout, pixPayment } = usePayFlow()
  const live = usePayoutStatus(payout)
  const pix = usePixPaymentStatus(pixPayment)
  // Re-read the balance whenever the payout moves (reserved → released / delivered).
  const treasury = useLiveTreasury(live?.status)

  if (pix) {
    const settled = pix.status === "SETTLED"
    const failed = ["FAILED", "CANCELLED", "EXPIRED"].includes(pix.status)
    const amount = `R$ ${(Number(pix.amountBrlMinor) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
    return <div className="page">
      <PayFlowHead title={settled ? "Pix payment sent" : failed ? "Pix payment failed" : "Sending Pix payment"} step={4} />
      <div className="grid">
        <section className="tile s7">
          <h2 className="sx-h heading-2">{settled ? `Done. ${pix.recipientName} has ${amount}.` : failed ? `Payment to ${pix.recipientName} failed.` : `Pix payment to ${pix.recipientName} is pending.`}</h2>
          <div className="hop"><i /><span className="body-strong">Submitted to PayZu</span><StatusPill status={failed ? "Failed" : settled ? "Settled" : "Pending"} /><span className="data">{amount}</span></div>
          <p className="body-s muted">Provider-backed Pix sandbox · Arc USDC conversion is simulated.</p>
          {pix.failureReason ? <p className="body-s" style={{ color: "var(--danger, #c0392b)" }}>{pix.failureReason}</p> : null}
        </section>
        <aside className="tile s5"><div className="kv"><span>Provider reference</span><span>{pix.providerTransactionId.slice(0, 12)}…</span></div><div className="kv"><span>Status</span><span>{pix.status.toLowerCase()}</span></div><div className="tile-foot"><Link href="/activity" className="sx-btn sx-btn--primary">See it in Activity</Link></div></aside>
      </div>
    </div>
  }

  // Live payment created in this session.
  if (live) {
    const status = live.status
    const declined = status === "REJECTED"
    const failed = status === "FAILED" || declined
    const completed = status === "COMPLETED"
    const awaiting = status === "PENDING_APPROVAL"
    const local = `S$ ${displayMinor(BigInt(live.sgdAmountMinor), SGD_DECIMALS, "", 2)}`
    const total = `$${displayMinor(BigInt(live.usdcAmountMinor), USDC_DECIMALS, "", 2)}`
    const step = (s: PayoutStatus) =>
      failed && s !== "CREATED" && s !== "FUNDS_SENT" ? "Failed" : reached(status, s) ? "Settled" : "Pending"
    const title = declined
      ? `Payment to ${live.recipientName} was declined`
      : failed
        ? `Payment to ${live.recipientName} failed`
        : completed
          ? `Done. ${live.recipientName} has ${local}.`
          : awaiting
            ? `Waiting for approval: ${total} to ${live.recipientName}`
            : `On its way to ${live.recipientName}`
    const headTitle = completed
      ? "Payment sent"
      : declined
        ? "Payment declined"
        : failed
          ? "Payment failed"
          : awaiting
            ? "Sent for approval"
            : "Sending payment"

    return (
      <div className="page">
        <PayFlowHead title={headTitle} step={4} />

        {awaiting ? (
          <div className="tile s12" role="status" style={{ marginBottom: 16 }}>
            <span className="body-s">
              <b>Needs an approver.</b> {live.approvalReason ? `${live.approvalReason}.` : "This payment is over your approval rule."} The money is
              reserved and nothing leaves your balance until it&apos;s approved.{" "}
              <Link href="/activity/approvals">Open Approvals →</Link>
            </span>
          </div>
        ) : null}

        <div className="grid">
          <section className="tile s7" aria-label="Confirmation">
            <div style={{ display: "grid", gap: 12, justifyItems: "start" }}>
              <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
                <circle cx="32" cy="32" r="28" fill="none" stroke={failed ? "var(--danger, #c0392b)" : "var(--accent)"} strokeWidth="3" />
                {failed ? (
                  <path d="M22 22l20 20M42 22L22 42" fill="none" stroke="var(--danger, #c0392b)" strokeWidth="3" strokeLinecap="round" />
                ) : (
                  <path
                    d="M20 33l8 8 16-18"
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={completed ? 1 : 0.35}
                  />
                )}
              </svg>
              <h2 className="sx-h heading-2" style={{ margin: 0 }}>
                {title}
              </h2>
              <p className="body muted" style={{ margin: 0, maxWidth: "62ch" }}>
                {total} from your balance · {live.rail === "PAYNOW" ? "PayNow" : "FAST"} · ref {live.providerRef ?? live.id.slice(0, 8)}
              </p>
              {failed && live.failureReason ? (
                <p className="body-s" style={{ margin: 0, color: "var(--danger, #c0392b)" }}>
                  {live.failureReason}
                </p>
              ) : null}
            </div>

            <div style={{ display: "grid", gap: 0, marginTop: 8 }}>
              <div className="hop">
                <i className={reached(status, "FUNDS_SENT") ? "" : "todo"} />
                <span className="body-strong">Funded from balance</span>
                <StatusPill status={step("FUNDS_SENT")} />
                <span className="data">
                  {total}
                  {live.txHash ? (
                    <>
                      {" · "}
                      <a href={`https://explorer.testnet.arc.io/tx/${live.txHash}`} target="_blank" rel="noreferrer">
                        Arc tx {live.txHash.slice(0, 10)}…
                      </a>
                    </>
                  ) : null}
                </span>
              </div>
              <div className="hop">
                <i className={reached(status, "PAYING_OUT") ? "" : "todo"} />
                <span className="body-strong">Converted</span>
                <StatusPill status={step("PAYING_OUT")} />
                <span className="data">1 USD = {live.clientRate} SGD</span>
              </div>
              <div className="hop">
                <i className={completed ? "" : "todo"} />
                <span className="body-strong">Paid out via {live.rail === "PAYNOW" ? "PayNow" : "FAST"}</span>
                <StatusPill status={failed ? "Failed" : completed ? "Settled" : "Pending"} />
                <span className="data">
                  {local} {live.simulated ? <StatusPill status="Simulated" /> : null}
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
              <span>{live.id.slice(0, 8)}…</span>
            </div>
            <div className="kv">
              <span>Status</span>
              <span>{status.replace("_", " ").toLowerCase()}</span>
            </div>
            <div className="kv">
              <span>Available now</span>
              <span>{treasury.availableLabel}</span>
            </div>
            <div className="tile-foot" style={{ flexDirection: "column", alignItems: "stretch" }}>
              <a href="/api/sancus/ledger?format=csv" className="sx-btn sx-btn--secondary">
                Download ledger (CSV)
              </a>
              <Link href="/pay" className="sx-btn sx-btn--primary">
                Pay someone else
              </Link>
              <Link href="/activity" className="sx-btn sx-btn--quiet">
                See it in Activity
              </Link>
            </div>
          </aside>
        </div>
      </div>
    )
  }

  // Demo recipients (wireframe flow).
  return (
    <div className="page">
      <PayFlowHead title="Payment sent" step={4} />

      <div className="grid">
        <section className="tile s7" aria-label="Confirmation">
          <div style={{ display: "grid", gap: 12, justifyItems: "start" }}>
            <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
              <circle cx="32" cy="32" r="28" fill="none" stroke="var(--accent)" strokeWidth="3" />
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
              Done. {recipient.name.split(" ")[0]} has her {view.live ? view.localLabel : quote.brlLabel}.
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
            <span>{treasury.source === "live" ? treasury.availableLabel : balance.availableLabel}</span>
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
