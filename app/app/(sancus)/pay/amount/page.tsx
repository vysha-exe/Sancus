"use client"

import Link from "next/link"
import { PayFlowHead } from "@/components/sancus-ui/pay-steps"
import { usePayFlow } from "@/lib/sancus/pay-flow"

const railOptions = [
  { id: "Pix", label: "Pix", meta: "Seconds · $0.80 fee", on: true },
  { id: "Wire", label: "Wire", meta: "1–2 days · $3.50 fee", on: true },
  { id: "USDC", label: "USDC", meta: "Not available for this recipient", on: false },
] as const

export default function PayAmountPage() {
  const { recipient, state, setUsdAmount, setLocalAmount, setRail, setMemo, quote } = usePayFlow()

  return (
    <div className="page">
      <PayFlowHead title="How much?" step={2} backHref="/pay" />

      <div className="grid">
        <section className="tile s7" aria-label="Amount and route">
          <div className="grid" style={{ gap: 16 }}>
            <label className="sx-field s6" style={{ gridColumn: "span 6" }}>
              <span className="sx-label">You send (USD)</span>
              <input
                className="sx-field__input sx-field__amount"
                value={state.usdAmount}
                onChange={(e) => setUsdAmount(e.target.value)}
                inputMode="decimal"
              />
            </label>
            <label className="sx-field s6" style={{ gridColumn: "span 6" }}>
              <span className="sx-label">They get (BRL)</span>
              <input
                className="sx-field__input sx-field__amount"
                value={state.localAmount}
                onChange={(e) => setLocalAmount(e.target.value)}
                inputMode="decimal"
              />
              <span className="sx-field__help">{quote.rateLabel}</span>
            </label>
          </div>

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
            <Link href="/pay/review" className="sx-btn sx-btn--primary">
              Review
            </Link>
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
            <span>Amount</span>
            <span>{quote.usdLabel}</span>
          </div>
          <div className="kv">
            <span>They get</span>
            <span>{quote.brlLabel}</span>
          </div>
          <div className="kv">
            <span>Rail</span>
            <span>
              <span className="sx-rail">{state.rail}</span>
            </span>
          </div>
          <div className="tile-foot">
            <span className="body-s muted">Rate locks on the next step</span>
          </div>
        </aside>
      </div>
    </div>
  )
}
