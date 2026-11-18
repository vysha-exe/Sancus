"use client"

import Link from "next/link"
import { useState } from "react"
import { LocalCollectCard } from "@/components/sancus-ui/local-collect-card"
import { PaymentRow } from "@/components/sancus-ui/payment-row"
import { ledger } from "@/lib/sancus/demo-data"
import { useLiveTreasury } from "@/lib/sancus/use-live-treasury"
import { CollectionDemo } from "@/components/sancus/collection-demo"
import { DemoReadiness } from "@/components/sancus/demo-readiness"

type DepositSource = "ach" | "usdc"

const localRails = [
  {
    id: "pix",
    rail: "Pix",
    country: "Brazil",
    keyLabel: "Pix key",
    keyValue: "pix@cafepaulista.com.br",
    received: "R$ 0,00",
    primary: "Copy key",
  },
  {
    id: "qris",
    rail: "QRIS",
    country: "Indonesia",
    keyLabel: "Merchant ID",
    keyValue: "ID1024 3381 7720",
    received: "Rp 0",
    primary: "Download QR",
  },
  {
    id: "promptpay",
    rail: "PromptPay",
    country: "Thailand",
    keyLabel: "PromptPay ID",
    keyValue: "0105 5671 2384 9",
    received: "฿0.00",
    primary: "Download QR",
  },
] as const

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

      <DemoReadiness />

      <div className="grid">
        <section className="tile s12" aria-labelledby="local">
          <div className="tile-head">
            <h2 className="tile-title" id="local">
              Get paid locally
            </h2>
            <span className="body-s muted">Customers pay in their currency. You get dollars.</span>
          </div>
          <div className="grid" style={{ gap: 16 }}>
            {localRails.map((r) => (
              <article key={r.id} className="rail-tile s4" aria-labelledby={`r-${r.id}`}>
                <div className="tile-head">
                  <span className="rail-name">
                    <span className="sx-rail">{r.rail}</span>
                    <b id={`r-${r.id}`}>{r.country}</b>
                  </span>
                </div>
                <div className="rail-body">
                  <div className="qr" role="img" aria-label={`${r.rail} QR code`}>
                    <span className="sx-label">QR</span>
                  </div>
                  <div className="rail-kv">
                    <span className="sx-label">{r.keyLabel}</span>
                    <span className="data trunc">{r.keyValue}</span>
                    <span className="sx-label">Received</span>
                    <span className="data">{r.received}</span>
                  </div>
                </div>
                <div className="tile-foot">
                  <button
                    type="button"
                    className="sx-btn sx-btn--secondary sx-btn--sm"
                    onClick={() => copy(r.keyValue, r.id)}
                  >
                    {copied === r.id ? "Copied" : r.primary}
                  </button>
                  <button type="button" className="sx-btn sx-btn--quiet">
                    New charge
                  </button>
                </div>
              </article>
            ))}
          </div>
          <div style={{ marginTop: 16 }}>
            <LocalCollectCard />
            <CollectionDemo />
          </div>
        </section>

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
