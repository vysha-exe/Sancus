"use client"

import Link from "next/link"
import { useState } from "react"
import { LocalCollectCard } from "@/components/sancus-ui/local-collect-card"
import { PaymentRow } from "@/components/sancus-ui/payment-row"
import { ledger } from "@/lib/sancus/demo-data"
import { useLiveTreasury } from "@/lib/sancus/use-live-treasury"
import { CollectionDemo } from "@/components/sancus/collection-demo"

type Source = "ach" | "pix" | "usdc"
type ShareTab = "bank" | "pix" | "usdc"

const sources: {
  id: Source
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
    detail: "USD · arrives in 1–2 business days · no fee",
    simulated: true,
    arrival: "Wednesday",
  },
  {
    id: "pix",
    rail: "Pix",
    title: "From your Brazilian bank",
    detail: "BRL · arrives in seconds · we show the rate first",
    simulated: true,
    arrival: "in seconds",
  },
  {
    id: "usdc",
    rail: "USDC",
    title: "From another USDC account",
    detail: "USDC · arrives in seconds · testnet",
    simulated: false,
    arrival: "in seconds",
  },
]

const shareTabs: { id: ShareTab; label: string }[] = [
  { id: "bank", label: "US bank" },
  { id: "pix", label: "Pix" },
  { id: "usdc", label: "USDC" },
]

const shareDetails: Record<
  ShareTab,
  { label: string; value: string; simulated: boolean; note: string; copy: string; extra: string }
> = {
  bank: {
    label: "Account details",
    value: "Routing 0000 0000 · Account 0000 0000 00",
    simulated: true,
    note: "Dollars arrive in 1–2 business days and land in your balance as they are.",
    copy: "Copy details",
    extra: "Create an invoice link",
  },
  pix: {
    label: "Pix key",
    value: "pix@cafepaulista.com.br",
    simulated: true,
    note: "Reais arrive in seconds and become dollars at the rate on the receipt.",
    copy: "Copy key",
    extra: "Create a Pix charge",
  },
  usdc: {
    label: "USDC address",
    value: "0x4F2a…c81E",
    simulated: false,
    note: "Testnet USDC only. Check you are sending USDC on testnet, so nothing goes astray.",
    copy: "Copy address",
    extra: "Show full address",
  },
}

function parseAmount(raw: string): number {
  const n = Number.parseFloat(raw.replace(/[^0-9.]/g, ""))
  return Number.isFinite(n) ? n : 0
}

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

export default function ReceivePage() {
  const [source, setSource] = useState<Source>("ach")
  const [amount, setAmount] = useState("1,000.00")
  const [shareTab, setShareTab] = useState<ShareTab>("pix")
  const [added, setAdded] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const current = sources.find((s) => s.id === source) ?? sources[0]
  const value = parseAmount(amount)
  const label = money.format(value)
  // Live: show the real Arc treasury wallet address for USDC deposits.
  const treasury = useLiveTreasury()
  const arcWallet = treasury.summary?.wallets.find((w) => w.blockchain === "ARC-TESTNET")
  const share =
    shareTab === "usdc" && arcWallet
      ? {
          ...shareDetails.usdc,
          value: arcWallet.address,
          note: "Your Arc testnet treasury wallet. Send testnet USDC only (free from faucet.circle.com).",
        }
      : shareDetails[shareTab]

  const mercado = ledger.find((p) => p.id === "mercado")

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <Link href="/home" className="sx-btn sx-btn--quiet" style={{ justifySelf: "start" }}>
            ← Home
          </Link>
          <h1 className="sx-h heading-2">Add money</h1>
          <p className="body-s muted" style={{ margin: 0 }}>
            Move money in yourself, or share details with whoever&apos;s paying you. Everything
            lands as US dollars in one balance.
          </p>
        </div>
      </header>

      <div className="grid">
        <section className="tile s7" aria-labelledby="in">
          <h2 className="tile-title" id="in">
            Move money in
          </h2>
          <div role="radiogroup" aria-label="From" style={{ display: "grid", gap: 8 }}>
            {sources.map((s) => {
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
                  {s.simulated ? <span className="sx-pill sx-pill--simulated">Simulated</span> : null}
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
              <select className="sx-field__input" defaultValue="checking">
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
                  {label} lands in your balance <b>{current.arrival}</b>.
                </>
              )}
            </span>
            <button
              type="button"
              className="sx-btn sx-btn--primary"
              disabled={value <= 0}
              onClick={() =>
                setAdded(`${label} is on its way by ${current.rail}${current.simulated ? " (simulated)" : ""}.`)
              }
            >
              Add {label}
            </button>
          </div>
        </section>

        <aside className="tile s5" aria-labelledby="share">
          <h2 className="tile-title" id="share">
            Get paid by someone else
          </h2>
          <div className="filters" role="group" aria-label="Payment details">
            {shareTabs.map((t) => (
              <button
                key={t.id}
                type="button"
                className="chip"
                aria-pressed={shareTab === t.id}
                onClick={() => {
                  setShareTab(t.id)
                  setCopied(false)
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <div
              role="img"
              aria-label={`${share.label} QR code placeholder`}
              style={{
                width: 112,
                height: 112,
                flex: "none",
                border: "1px dashed var(--line-strong)",
                borderRadius: "var(--radius-sm)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <span className="sx-label">QR code</span>
            </div>
            <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
              <span className="sx-label">{share.label}</span>
              <span className="data" style={{ wordBreak: "break-all" }}>
                {share.value}
              </span>
              {share.simulated ? (
                <span className="sx-pill sx-pill--simulated" style={{ justifySelf: "start" }}>
                  Simulated
                </span>
              ) : null}
            </div>
          </div>
          <span className="body-s muted">{share.note}</span>
          <div className="tile-foot" style={{ justifyContent: "flex-start" }}>
            <button
              type="button"
              className="sx-btn sx-btn--secondary sx-btn--sm"
              onClick={() => setCopied(true)}
            >
              {copied ? "Copied" : share.copy}
            </button>
            <button type="button" className="sx-btn sx-btn--secondary sx-btn--sm">
              {share.extra}
            </button>
          </div>
        </aside>

        <LocalCollectCard />

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
        <CollectionDemo />
      </div>
    </div>
  )
}
