"use client"

import { useState } from "react"
import { FIXED_USD_RATES } from "@/lib/sancus/fixed-rates"

type Dest = {
  value: string
  label: string
  rail: string
  cur: string
  rate: number
  fee: number
  speed: string
  simulated: boolean
}

/** Sandbox rates from the Rails and fees wireframe. Not live market prices. */
const DESTS: Dest[] = [
  { value: "pix", label: "Brazil · Pix · BRL", rail: "Pix", cur: "BRL", rate: FIXED_USD_RATES.BRL, fee: 0.8, speed: "Seconds", simulated: true },
  { value: "spei", label: "Mexico · SPEI · MXN", rail: "SPEI", cur: "MXN", rate: FIXED_USD_RATES.MXN, fee: 0.8, speed: "Minutes", simulated: true },
  { value: "sepa", label: "Euro area · SEPA · EUR", rail: "SEPA", cur: "EUR", rate: FIXED_USD_RATES.EUR, fee: 0.8, speed: "Same day", simulated: true },
  { value: "qris", label: "Indonesia · QRIS · IDR", rail: "QRIS", cur: "IDR", rate: FIXED_USD_RATES.IDR, fee: 0.5, speed: "Seconds", simulated: true },
  { value: "promptpay", label: "Thailand · PromptPay · THB", rail: "PromptPay", cur: "THB", rate: FIXED_USD_RATES.THB, fee: 0.5, speed: "Seconds", simulated: true },
  { value: "ach", label: "United States · ACH · USD", rail: "ACH", cur: "USD", rate: FIXED_USD_RATES.USD, fee: 0, speed: "1–2 days", simulated: true },
  { value: "wire", label: "Anywhere · Wire · USD", rail: "Wire", cur: "USD", rate: FIXED_USD_RATES.USD, fee: 3.5, speed: "Same or next day", simulated: true },
  { value: "usdc", label: "A USDC account · USDC", rail: "USDC", cur: "USDC", rate: FIXED_USD_RATES.USDC, fee: 0, speed: "Seconds", simulated: false },
]

const n = (x: number, loc: string, dp: number) =>
  x.toLocaleString(loc, { minimumFractionDigits: dp, maximumFractionDigits: dp })

function fmt(cur: string, x: number): string {
  switch (cur) {
    case "BRL":
      return "R$ " + n(x, "pt-BR", 2)
    case "MXN":
      return "MX$ " + n(x, "en-US", 2)
    case "EUR":
      return "€ " + n(x, "de-DE", 2)
    case "IDR":
      return "Rp " + n(Math.round(x), "id-ID", 0)
    case "THB":
      return "฿" + n(x, "en-US", 2)
    case "USDC":
      return n(x, "en-US", 2) + " USDC"
    default:
      return "$" + n(x, "en-US", 2)
  }
}

/** Quote calculator for the Pricing page header. Everything is computed client-side from sandbox rates. */
export function QuoteCalculator() {
  const [amt, setAmt] = useState("100")
  const [dest, setDest] = useState("pix")

  const d = DESTS.find((x) => x.value === dest) ?? DESTS[0]
  const amount = Math.max(0, parseFloat(amt.replace(/,/g, "")) || 0)
  const noConversion = d.cur === "USD" || d.cur === "USDC"

  return (
    <div className="calc calc--stack">
      <div className="calc-in">
        <label className="sx-field">
          <span className="sx-label">You send</span>
          <span className="money-in">
            <span aria-hidden="true">$</span>
            <input
              className="sx-field__input"
              inputMode="decimal"
              value={amt}
              onChange={(e) => setAmt(e.target.value)}
              aria-label="Amount in US dollars"
            />
          </span>
        </label>
        <label className="sx-field">
          <span className="sx-label">Pay to</span>
          <select className="sx-field__input" value={dest} onChange={(e) => setDest(e.target.value)}>
            {DESTS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="calc-out" aria-live="polite">
        <div className="calc-get">
          <span className="calc-get-head">
            <span className="sx-label muted">They get</span>
          </span>
          <span className="amount-xl">{fmt(d.cur, amount * d.rate)}</span>
        </div>
        <div className="sx-quote">
          <dl>
            <dt>Rate</dt>
            <dd>
              {noConversion
                ? "No conversion"
                : `1 USD = ${d.rate.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${d.cur}`}
            </dd>
            <dt>Fee</dt>
            <dd>{"$" + n(d.fee, "en-US", 2)}</dd>
            <dt>You pay</dt>
            <dd>{"$" + n(amount + d.fee, "en-US", 2)}</dd>
            <dt>Rail</dt>
            <dd>
              <span className="sx-rail">{d.rail}</span>{" "}
            </dd>
            <dt>Arrives</dt>
            <dd>{d.speed}</dd>
          </dl>
        </div>
      </div>
    </div>
  )
}
