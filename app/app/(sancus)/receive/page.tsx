"use client"

import Link from "next/link"
import { useState } from "react"
import { PaymentRow } from "@/components/sancus-ui/payment-row"
import { ledger } from "@/lib/sancus/demo-data"
import { useLiveTreasury } from "@/lib/sancus/use-live-treasury"

type DepositSource = "ach" | "usdc"

const deposits: {
  id: DepositSource
  rail: string
  title: string
  detail: string
  simulated: boolean
  arrival: string
}[] = [
  {
    id: "ach",
    rail: "ACH",
    title: "From your US bank",
    detail: "USD · 1–2 business days · no fee",
    simulated: true,
    arrival: "Wednesday",
  },
  {
    id: "usdc",
    rail: "USDC",
    title: "From another USDC account",
    detail: "USDC · seconds",
    simulated: false,
    arrival: "in seconds",
  },
]

function parseAmount(raw: string): number {
  const n = Number.parseFloat(raw.replace(/[^0-9.]/g, ""))
  return Number.isFinite(n) ? n : 0
}

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

export default function ReceivePage() {
  const [source, setSource] = useState<DepositSource>("ach")
  const [amount, setAmount] = useState("1,000.00")
  const [added, setAdded] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const current = deposits.find((s) => s.id === source) ?? deposits[0]
  const value = parseAmount(amount)
  const label = money.format(value)
  const treasury = useLiveTreasury()
  const arcWallet = treasury.summary?.wallets.find((w) => w.blockchain === "ARC-TESTNET")
  const usdcAddress = treasury.loading ? "***" : arcWallet?.address ?? "0x4F2a9b1e…77d0c81E"
  const mercado = ledger.find((p) => p.id === "mercado")

  function copy(text: string, id: string) {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(id)
      setTimeout(() => setCopied(null), 1500)
    })
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <Link href="/home" className="sx-btn sx-btn--quiet" style={{ justifySelf: "start" }}>
            ← Home
          </Link>
          <h1 className="sx-h heading-2">Add money</h1>
          <p className="body-s muted" style={{ margin: 0 }}>
            Everything lands as US dollars in one balance.
          </p>
        </div>
      </header>

      <div className="grid">
        <section className="tile s7" aria-labelledby="in">
          <h2 className="tile-title" id="in">
            Move money in
          </h2>
          <div role="radiogroup" aria-label="From" style={{ display: "grid", gap: 8 }}>
            {deposits.map((s) => {
              const on = s.id === source
              return (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={`pick${on ? " pick--on" : ""}`}
                  onClick={() => {
                    setSource(s.id)
                    setAdded(null)
                  }}
                  style={{ width: "100%", textAlign: "left" }}
                >
                  <span className="radio" />
                  <span style={{ flex: 1, minWidth: 0, display: "grid" }}>
                    <span className="body-strong">
                      <span className="sx-rail">{s.rail}</span> {s.title}
                    </span>
                    <span className="body-s">{s.detail}</span>
                  </span>
                </button>
              )
            })}
          </div>
          <div className="grid" style={{ gap: 12 }}>
            <label className="sx-field s7">
              <span className="sx-label">Amount</span>
              <input
                className="sx-field__input sx-field__amount"
                value={amount}
                inputMode="decimal"
                onChange={(e) => {
                  setAmount(e.target.value)
                  setAdded(null)
                }}
              />
            </label>
            <label className="sx-field s5">
              <span className="sx-label">From account</span>
              <select className="sx-field__input" defaultValue="checking" disabled={source === "usdc"}>
                <option value="checking">Checking ••• 4417</option>
                <option value="link">Link another account</option>
              </select>
            </label>
          </div>
          <div className="tile-foot">
            <span className="body-s" role="status">
              {added ? (
                added
              ) : (
                <>
                  Lands by <b>{current.arrival}</b>
                </>
              )}
            </span>
            <button
              type="button"
              className="sx-btn sx-btn--primary"
              disabled={value <= 0}
              onClick={() =>
                setAdded(`${label} is on its way by ${current.rail}.`)
              }
            >
              Add {label}
            </button>
          </div>
        </section>

        <aside className="tile s5" aria-labelledby="usdc">
          <div className="tile-head">
            <h2 className="tile-title" id="usdc">
              Your USDC address
            </h2>
            <span className="sx-rail">USDC</span>
          </div>
          <div className="rail-body">
            <div className="qr" role="img" aria-label="USDC address QR code placeholder">
              <span className="sx-label">QR</span>
            </div>
            <div className="rail-kv">
              <span className="sx-label">Network</span>
              <span className="data">Arc</span>
              <span className="sx-label">Address</span>
              <span className="data" style={{ wordBreak: "break-all" }}>
                {usdcAddress}
              </span>
            </div>
          </div>
          <div className="tile-foot" style={{ justifyContent: "flex-start" }}>
            <button
              type="button"
              className="sx-btn sx-btn--secondary sx-btn--sm"
              onClick={() => copy(usdcAddress, "usdc")}
            >
              {copied === "usdc" ? "Copied" : "Copy address"}
            </button>
            <button type="button" className="sx-btn sx-btn--quiet" onClick={() => setSource("ach")}>
              US bank details
            </button>
          </div>
        </aside>

        <section className="tile s12" aria-labelledby="recent">
          <div className="tile-head">
            <h2 className="tile-title" id="recent">
              Recent money in
            </h2>
            <Link href="/activity" className="sx-btn sx-btn--quiet">
              See all
            </Link>
          </div>
          <div className="sx-rows">
            {mercado ? (
              <PaymentRow
                payment={{
                  ...mercado,
                  who: "Mercado Azul (customer)",
                  meta: "Friday · ref 19ad…04be",
                  href: "/activity",
                }}
              />
            ) : (
              <div className="empty">Nothing here yet. Money you add will show up here.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
