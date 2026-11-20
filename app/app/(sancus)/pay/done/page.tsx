"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { PayFlowHead } from "@/components/sancus-ui/pay-steps"
import { StatusPill } from "@/components/sancus-ui/status-pill"
import { balance } from "@/lib/sancus/demo-data"
import { PAYMENT_LINK_PAYEE_PREFIX, usePayFlow } from "@/lib/sancus/pay-flow"

import { useLiveTreasury } from "@/lib/sancus/use-live-treasury"
import type { PixPaymentDto } from "@/lib/sancus/local-rails"
import type { XenditPayoutDto } from "@/lib/sancus/xendit-payouts"
import { displayMinor, USDC_DECIMALS } from "@/lib/sancus/money"

/** Polls a PromptPay / BI-FAST payout until Xendit settles or fails it. */
function useXenditStatus(initial: XenditPayoutDto | null) {
  const [latest, setLatest] = useState(initial)
  const current = latest ?? initial
  const id = initial?.id
  useEffect(() => {
    if (!id || !current || !["PENDING", "COMPLIANCE_REVIEW"].includes(current.status)) return
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/sancus/xendit/payouts/${id}/refresh`, { method: "POST" })
      if (!response.ok) return
      const body = (await response.json()) as { payout?: XenditPayoutDto }
      if (body.payout) setLatest(body.payout)
    }, 2500)
    return () => window.clearInterval(timer)
  }, [id, current])
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
  const router = useRouter()
  const { recipient, quote, state, view, xenditPayout, pixPayment, internalTransfer, sourceAccount } = usePayFlow()
  const fundingSource = sourceAccount?.parentId === null ? "parent treasury" : sourceAccount?.name ?? "selected account"
  const xendit = useXenditStatus(xenditPayout)
  const pix = usePixPaymentStatus(pixPayment)
  // Re-read the balance whenever the payout moves.
  const treasury = useLiveTreasury(xendit?.status ?? pix?.status ?? internalTransfer?.status)
  const hasReceipt = Boolean(pix || xendit || internalTransfer || recipient)

  useEffect(() => {
    if (!hasReceipt) router.replace("/pay")
  }, [hasReceipt, router])

  if (!hasReceipt) return null

  if (pix) {
    const settled = pix.status === "SETTLED"
    const failed = ["FAILED", "CANCELLED", "EXPIRED"].includes(pix.status)
    const amount = `R$ ${(Number(pix.amountBrlMinor) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
    return <div className="page">
      <PayFlowHead title={settled ? "Pix payment sent" : failed ? "Pix payment failed" : "Sending Pix payment"} step={4} />
      <div className="grid">
        <section className="tile s7">
          <h2 className="sx-h heading-2">{settled ? `Done. ${pix.recipientName} has ${amount}.` : failed ? `Payment to ${pix.recipientName} failed.` : `Pix payment to ${pix.recipientName} is pending.`}</h2>
          <div className="hop"><i /><span className="body-strong">{pix.providerTransactionId.startsWith("sim_") ? "Pix payout (simulated)" : "Submitted to PayZu"}</span><StatusPill status={failed ? "Failed" : settled ? "Settled" : "Pending"} /><span className="data">{amount}</span></div>
          <p className="body-s muted">{pix.providerTransactionId.startsWith("sim_") ? "No PayZu sandbox key is set, so the Pix leg was simulated." : "Pix payout via PayZu sandbox."}</p>
          {pix.failureReason ? <p className="body-s" style={{ color: "var(--danger, #c0392b)" }}>{pix.failureReason}</p> : null}
        </section>
        <aside className="tile s5"><div className="kv"><span>Paying from</span><span>{fundingSource}</span></div><div className="kv"><span>Provider reference</span><span>{pix.providerTransactionId.slice(0, 12)}…</span></div><div className="kv"><span>Status</span><span>{pix.status.toLowerCase()}</span></div><div className="tile-foot"><Link href="/activity" className="sx-btn sx-btn--primary">See it in Activity</Link></div></aside>
      </div>
    </div>
  }

  if (internalTransfer) {
    const amount = `$${displayMinor(BigInt(internalTransfer.usdcAmountMinor), USDC_DECIMALS, "", 2)}`
    const settled = internalTransfer.status === "COMPLETED"
    const pending = ["QUEUED", "BURNING", "BRIDGING", "MINTING", "PENDING_APPROVAL"].includes(internalTransfer.status)
    const failed = ["FAILED", "DECLINED", "EXPIRED", "REVERSED"].includes(internalTransfer.status)
    const explorer = internalTransfer.usdcTxHash
      ? `https://explorer.testnet.arc.io/tx/${internalTransfer.usdcTxHash}`
      : internalTransfer.burnTxHash
        ? `https://explorer.testnet.arc.io/tx/${internalTransfer.burnTxHash}`
        : null
    return (
      <div className="page">
        <PayFlowHead
          title={settled ? "Transfer sent" : failed ? "Transfer failed" : pending ? "Transfer in progress" : "Transfer submitted"}
          step={4}
        />
        <div className="grid">
          <section className="tile s7">
            <h2 className="sx-h heading-2">
              {settled
                ? `Done. ${internalTransfer.destinationName} received ${amount}.`
                : failed
                  ? `Transfer to ${internalTransfer.destinationName} failed.`
                  : `Moving ${amount} to ${internalTransfer.destinationName}.`}
            </h2>
            <div className="hop">
              <i />
              <span className="body-strong">From {internalTransfer.sourceName}</span>
              <StatusPill status={failed ? "Failed" : settled ? "Settled" : "Pending"} />
              <span className="data">{amount}</span>
            </div>
            <div className="hop">
              <i className={settled ? "" : "todo"} />
              <span className="body-strong">Internal Arc transfer</span>
              <StatusPill status={failed ? "Failed" : settled ? "Settled" : "Pending"} />
              <span className="data">{internalTransfer.status.replace(/_/g, " ").toLowerCase()}</span>
            </div>
            <p className="body-s muted">USDC moved between companies in your org — no external bank rail.</p>
          </section>
          <aside className="tile s5">
            <div className="kv">
              <span>Paying from</span>
              <span>{fundingSource}</span>
            </div>
            <div className="kv">
              <span>To</span>
              <span>{internalTransfer.destinationName}</span>
            </div>
            <div className="tile-foot" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
              {explorer ? (
                <a className="sx-btn sx-btn--secondary" href={explorer} target="_blank" rel="noreferrer">
                  View on Arc testnet
                </a>
              ) : null}
              <Link href="/activity" className="sx-btn sx-btn--primary">
                See it in Activity
              </Link>
              <Link href="/pay" className="sx-btn sx-btn--quiet">
                Make another payment
              </Link>
            </div>
          </aside>
        </div>
      </div>
    )
  }

  // PromptPay (Thailand) / BI-FAST (Indonesia) payout through Xendit, created in this session.
  if (xendit) {
    const settled = xendit.status === "SETTLED"
    const failed = ["FAILED", "REVERSED", "CANCELLED"].includes(xendit.status)
    const decimals = xendit.currency === "IDR" ? 0 : 2
    const amount = `${xendit.currency === "IDR" ? "Rp " : "฿ "}${(Number(xendit.amountMinor) / 10 ** decimals).toLocaleString(xendit.currency === "IDR" ? "id-ID" : "th-TH", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
    const railLabel = xendit.rail === "PROMPTPAY" ? "PromptPay" : "BI-FAST"
    return (
      <div className="page">
        <PayFlowHead title={settled ? "Payment sent" : failed ? "Payment failed" : "Sending payment"} step={4} />
        <div className="grid">
          <section className="tile s7">
            <h2 className="sx-h heading-2">
              {settled ? `Done. ${xendit.recipientName} has ${amount}.` : failed ? `Payment to ${xendit.recipientName} failed.` : `On its way to ${xendit.recipientName}`}
            </h2>
            <div className="hop">
              <i />
              <span className="body-strong">Funded from {fundingSource}</span>
              <StatusPill status="Settled" />
              <span className="data">{view.totalLabel !== "–" ? view.totalLabel : ""}</span>
            </div>
            <div className="hop">
              <i />
              <span className="body-strong">Converted</span>
              <StatusPill status="Settled" />
              <span className="data">{view.rateLabel}</span>
            </div>
            <div className="hop">
              <i className={settled ? "" : "todo"} />
              <span className="body-strong">Paid out via {railLabel}</span>
              <StatusPill status={failed ? "Failed" : settled ? "Settled" : "Pending"} />
              <span className="data">{amount} · {xendit.accountNumberMasked}</span>
            </div>
            <p className="body-s muted">
              {xendit.simulated ? `Xendit ${railLabel} payout (sandbox, simulated).` : `Submitted to Xendit ${railLabel}.`}
            </p>
            {xendit.failureReason ? <p className="body-s" style={{ color: "var(--danger, #c0392b)" }}>{xendit.failureReason}</p> : null}
          </section>
          <aside className="tile s5">
            <div className="kv"><span>Paying from</span><span>{fundingSource}</span></div>
            <div className="kv"><span>Provider reference</span><span>{xendit.providerTransactionId.slice(0, 14)}…</span></div>
            <div className="kv"><span>Status</span><span>{xendit.status.replace(/_/g, " ").toLowerCase()}</span></div>
            <div className="tile-foot"><Link href="/activity" className="sx-btn sx-btn--primary">See it in Activity</Link></div>
          </aside>
        </div>
      </div>
    )
  }

  // Demo recipients (wireframe flow). A payment-link payee shows its own numbers, not the sample quote.
  if (!recipient) return null
  const fromLink = recipient.id.startsWith(PAYMENT_LINK_PAYEE_PREFIX)
  const shown = fromLink
    ? { total: view.totalLabel, rate: view.rateLabel, paidOut: view.localLabel }
    : { total: quote.totalLabel, rate: quote.rateLabel, paidOut: quote.brlLabel }
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
              Done. {recipient.name.split(" ")[0]} received {view.localLabel}.
            </h2>
            <p className="body muted" style={{ margin: 0, maxWidth: "62ch" }}>
              {shown.total} {fromLink ? "sent (simulated)" : "left your balance"} · {state.rail} · ref pay_7f2a…c91
            </p>
            {fromLink ? (
              <p className="body-s muted" style={{ margin: 0 }}>
                <span className="sx-pill sx-pill--simulated">Simulated</span> Demo payment to a USDC address. No money moved.
              </p>
            ) : null}
          </div>

          <div style={{ display: "grid", gap: 0, marginTop: 8 }}>
            <div className="hop">
              <i />
              <span className="body-strong">Funded from {fundingSource}</span>
              <StatusPill status="Settled" />
              <span className="data">{shown.total}</span>
            </div>
            <div className="hop">
              <i />
              <span className="body-strong">Converted</span>
              <StatusPill status="Settled" />
              <span className="data">{shown.rate}</span>
            </div>
            <div className="hop">
              <i />
              <span className="body-strong">Paid out via {state.rail}</span>
              <StatusPill status="Settled" />
              <span className="data">
                {shown.paidOut}
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
            <span>{treasury.loading ? "***" : treasury.source === "live" ? treasury.availableLabel : balance.availableLabel}</span>
          </div>
          <div className="tile-foot" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <button type="button" className="sx-btn sx-btn--secondary">
              Download receipt
            </button>
            <button type="button" className="sx-btn sx-btn--secondary">
              Send receipt
            </button>
            <Link href="/pay" className="sx-btn sx-btn--primary">
              Make another payment
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
