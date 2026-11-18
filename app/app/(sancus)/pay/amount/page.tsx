"use client"

import Link from "next/link"
import { PayFlowHead } from "@/components/sancus-ui/pay-steps"
import { usePayFlow } from "@/lib/sancus/pay-flow"
import { formatUsdc, isPayRail, RAILS } from "@/lib/sancus/pay-quote"
import { displayMinor, USDC_DECIMALS } from "@/lib/sancus/money"
import { countryByCode } from "@/lib/sancus/countries"

export default function PayAmountPage() {
  const {
    recipient,
    state,
    setUsdAmount,
    setLocalAmount,
    setRail,
    setMemo,
    view,
    liveQuote,
    quoteLoading,
    quoteError,
    sourceAccounts,
    sourceAccount,
    setSourceCompanyId,
  } = usePayFlow()

  // Live Singapore recipients use PayNow; USDC is shown only when available.
  const railOptions = view.live
    ? [
        {
          id: "PayNow",
          label: "PayNow",
          meta: liveQuote ? `${view.arrival} · ${view.feeLabel} fee` : "Seconds",
          on: true,
        },
        { id: "USDC", label: "USDC", meta: "Not available for this recipient", on: false },
      ]
    : // Other recipients: the rails they actually have, with each rail's speed and fee.
      recipient.methods.map((m) => ({
        id: m.rail,
        label: m.rail,
        meta: isPayRail(m.rail) ? `${RAILS[m.rail].eta} · ${formatUsdc(RAILS[m.rail].feeUsdcMinor)} fee` : m.detail,
        on: isPayRail(m.rail),
      }))

  // Review needs a current quote, live or not.
  const canReview = view.live ? Boolean(liveQuote) && !quoteError : view.localLabel !== "–" && !quoteError && !quoteLoading

  return (
    <div className="page">
      <PayFlowHead title="How much?" step={2} backHref="/pay" />

      <div className="grid">
        <section className="tile s7" aria-label="Amount and route">
          <label className="sx-field">
            <span className="sx-label">Paying from</span>
            <select
              className="sx-field__input"
              value={sourceAccount?.id ?? ""}
              onChange={(event) => setSourceCompanyId(event.target.value)}
              disabled={!sourceAccounts.length}
            >
              {!sourceAccounts.length ? <option value="">***</option> : null}
              {sourceAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.parentId === null ? `Parent treasury · ${account.name}` : `↳ ${account.name}`}
                  {` · $${displayMinor(BigInt(account.ownMinor || "0"), USDC_DECIMALS, "", 2)}`}
                </option>
              ))}
            </select>
            <span className="sx-field__help">
              {sourceAccount
                ? sourceAccount.parentId === null
                  ? "Global USDC treasury · available to fund any branch payment"
                  : `${countryByCode(sourceAccount.country)?.name ?? sourceAccount.country} operating account · settled from its USDC treasury`
                : "Loading payment accounts…"}
            </span>
          </label>

          <div className="grid" style={{ gap: 16 }}>
            <label className="sx-field s6" style={{ gridColumn: "span 6" }}>
              <span className="sx-label">You send (USDC)</span>
              <input
                className="sx-field__input sx-field__amount"
                value={state.usdAmount}
                onChange={(e) => setUsdAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
              />
              <span className="sx-field__help">
                From your USDC balance{view.feeLabel !== "–" ? ` · includes the ${view.feeLabel} fee` : ""}
              </span>
            </label>
            <label className="sx-field s6" style={{ gridColumn: "span 6" }}>
              <span className="sx-label">They get ({view.currency})</span>
              <input
                className="sx-field__input sx-field__amount"
                value={state.localAmount}
                onChange={(e) => setLocalAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
              />
              <span className="sx-field__help">{view.rateLabel}</span>
            </label>
          </div>

          {quoteError ? (
            <p className="body-s" role="alert" style={{ color: "var(--danger, #c0392b)", margin: 0 }}>
              {quoteError}
            </p>
          ) : null}

          <span className="sx-label">Route</span>
          <div className="opt-grid" role="radiogroup" aria-label="Payment rail">
            {railOptions.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`opt${state.rail === r.id ? " opt--on" : ""}${r.on ? "" : " pick--off"}`}
                role="radio"
                aria-checked={state.rail === r.id}
                disabled={!r.on}
                onClick={() => r.on && setRail(r.id)}
              >
                <span className="body-strong">
                  <span className="sx-rail">{r.label}</span>
                </span>
                <span className="body-s muted">{r.meta}</span>
              </button>
            ))}
          </div>
          {view.railReason ? <span className="body-s muted">{view.railReason}</span> : null}

          <label className="sx-field">
            <span className="sx-label">Memo (optional)</span>
            <input
              className="sx-field__input"
              value={state.memo}
              onChange={(e) => setMemo(e.target.value)}
            />
          </label>

          <div className="tile-foot">
            <Link href="/pay" className="sx-btn sx-btn--quiet">
              Back
            </Link>
            {canReview ? (
              <Link href="/pay/review" className="sx-btn sx-btn--primary">
                Review
              </Link>
            ) : (
              <button type="button" className="sx-btn sx-btn--primary" disabled>
                {quoteLoading ? "Getting rate…" : "Review"}
              </button>
            )}
          </div>
        </section>

        <aside className="tile s5" aria-labelledby="so-far">
          <span className="sx-label" id="so-far">
            Payment so far
          </span>
          <div className="kv">
            <span>To</span>
            <span>{recipient.name}</span>
          </div>
          <div className="kv">
            <span>Paying from</span>
            <span>{sourceAccount?.parentId === null ? "Parent treasury" : sourceAccount?.name ?? "***"}</span>
          </div>
          <div className="kv">
            <span>Amount</span>
            <span>{view.usdLabel}</span>
          </div>
          <div className="kv">
            <span>Fee</span>
            <span>{view.feeLabel}</span>
          </div>
          <div className="kv">
            <span>They get</span>
            <span>{view.localLabel}</span>
          </div>
          <div className="kv">
            <span>Rail</span>
            <span>
              <span className="sx-rail">{state.rail}</span>
            </span>
          </div>
          <div className="tile-foot">
            <span className="body-s muted">
              {view.live ? "Fixed hackathon demo rate" : "Fixed demo rate"}
            </span>
          </div>
        </aside>
      </div>
    </div>
  )
}
