"use client"

import Link from "next/link"
import { useRef, useState } from "react"
import { RisingColumn } from "@/components/sancus-ui/logo"
import { PaymentRow } from "@/components/sancus-ui/payment-row"
import { QrGlyph } from "@/components/sancus-ui/qr-glyph"
import { PixSpendDemo } from "@/components/sancus/pix-spend-demo"
import { XenditPayoutDemo } from "@/components/sancus/xendit-payout-demo"
import type { Payment } from "@/lib/sancus/demo-data"

type Method = {
  id: string
  kind: "card" | "qr"
  rail: string
  holder: string
  holderUpper: string
  label: string
  limit: string
  used: string
  pct: number
  last4?: string
  monthly?: string
  heldNote?: string
  idleNote?: string
  frozenNote?: string
  frozen: boolean
}

const initialMethods: Method[] = [
  {
    id: "ana-card",
    kind: "card",
    rail: "Card",
    holder: "Ana Souza",
    holderUpper: "ANA SOUZA",
    label: "Office and supplies",
    limit: "R$ 2.700,00",
    used: "R$ 541,23",
    pct: 20,
    last4: "4021",
    monthly: "R$ 2.700 / MONTH",
    heldNote: "$398.86 held",
    frozenNote: "Frozen by Maya · today",
    frozen: false,
  },
  {
    id: "rafael-card",
    kind: "card",
    rail: "Card",
    holder: "Rafael Lima",
    holderUpper: "RAFAEL LIMA",
    label: "Travel",
    limit: "R$ 10.800,00",
    used: "R$ 0,00",
    pct: 0,
    last4: "7310",
    monthly: "R$ 10.800 / MONTH",
    heldNote: "No hold",
    frozenNote: "Frozen by Maya · Nov 12",
    frozen: true,
  },
]

const baseSpending: Payment[] = [
  {
    id: "padaria",
    who: "Padaria Bela Vista · Ana",
    amount: "−$10.00",
    meta: "R$ 54,12 · Today, 10:02",
    rail: "Pix QR",
    status: "Settled",
    simulated: true,
    href: "/activity",
  },
  {
    id: "papelaria",
    who: "Papelaria Central · Ana",
    amount: "−$100.00",
    meta: "Held 9:10, settled 9:12",
    rail: "Card",
    status: "Settled",
    simulated: true,
    href: "/activity",
  },
]

type Filter = "all" | "cards" | "qr" | "frozen"

function Face({ method }: { method: Method }) {
  if (method.kind === "card") {
    return (
      <div
        className={`sx-card${method.frozen ? " sx-card--frozen" : ""}`}
        role="img"
        aria-label={`${method.holder}'s virtual card ending ${method.last4}${method.frozen ? ", frozen" : ""}`}
        style={{ width: "100%" }}
      >
        <RisingColumn className="sx-card__mark" />
        <div className="sx-card__top">
          <span className="sx-card__brand">SANCUS</span>
          <span className="sx-card__limit">{method.monthly}</span>
        </div>
        <span />
        <div className="sx-card__foot">
          <span>{method.holderUpper}</span>
          <span className="sx-card__num">•••• {method.last4}</span>
          <span>VIRTUAL</span>
        </div>
      </div>
    )
  }
  return (
    <div
      style={{
        width: "100%",
        aspectRatio: 1.586,
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--line-strong)",
        background: "var(--surface-000)",
        padding: 20,
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
        opacity: method.frozen ? 0.55 : 1,
      }}
    >
      <span style={{ display: "flex", justifyContent: "space-between" }}>
        <span className="sx-rail">{method.rail}</span>
        <span className="sx-pill sx-pill--simulated">Simulated</span>
      </span>
      <QrGlyph />
      <span className="data">{method.holderUpper}</span>
    </div>
  )
}

export default function SpendingPage() {
  const [methods, setMethods] = useState(initialMethods)
  const [filter, setFilter] = useState<Filter>("all")
  const [purchases, setPurchases] = useState<Payment[]>([])
  const counter = useRef(0)

  const frozenCount = methods.filter((m) => m.frozen).length
  const cardCount = methods.filter((m) => m.kind === "card").length
  const qrCount = methods.length - cardCount

  const shown = methods.filter((m) => {
    if (filter === "cards") return m.kind === "card"
    if (filter === "qr") return m.kind === "qr"
    if (filter === "frozen") return m.frozen
    return true
  })

  function toggle(id: string) {
    setMethods((prev) => prev.map((m) => (m.id === id ? { ...m, frozen: !m.frozen } : m)))
  }

  function simulatePurchase() {
    counter.current += 1
    const id = `sim-${counter.current}`
    const base: Payment = {
      id,
      who: "Livraria Cultura · Ana",
      amount: "−$25.00",
      meta: "Held now",
      rail: "Card",
      status: "Held",
      simulated: true,
      href: "/activity",
    }
    setPurchases((prev) => [base, ...prev])
    window.setTimeout(() => {
      setPurchases((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status: "Settled", meta: "Held, then settled just now" } : p)),
      )
    }, 1500)
  }

  const filterList: { id: Filter; label: string }[] = [
    { id: "all", label: `All · ${methods.length}` },
    { id: "cards", label: `Cards · ${cardCount}` },
    { id: "qr", label: `Local QR · ${qrCount}` },
    { id: "frozen", label: `Frozen · ${frozenCount}` },
  ]

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="sx-h heading-2">Spending</h1>
          <p className="body-s muted" style={{ margin: 0 }}>
            Cards and local QR for your team. Each spends from your balance, up to a monthly limit
            in that person&apos;s own currency.
          </p>
        </div>
        <Link href="/team/ana/methods/new" className="sx-btn sx-btn--primary">
          Give someone a card or QR
        </Link>
      </header>

      <div className="filters" role="group" aria-label="Filter">
        {filterList.map((f) => (
          <button
            key={f.id}
            type="button"
            className="chip"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="fill-grid">
        {shown.map((m) => {
          const verb = m.kind === "card" ? (m.frozen ? "Unfreeze" : "Freeze") : m.frozen ? "Resume" : "Pause"
          const note = m.frozen
            ? m.frozenNote
            : m.idleNote ?? `Active · ${m.heldNote}`
          return (
            <section
              key={m.id}
              className="tile"
              aria-label={`${m.holder}'s ${m.rail}${m.last4 ? ` ${m.last4}` : ""}${m.frozen ? ", frozen" : ""}`}
            >
              <Face method={m} />
              <div className="kv">
                <span>{m.label}</span>
                <span>
                  {m.used} of {m.limit}
                </span>
              </div>
              <div
                className="meter"
                role="progressbar"
                aria-valuenow={m.pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${m.pct}% used`}
              >
                <i style={{ width: `${m.pct}%` }} />
              </div>
              <div className="tile-foot">
                <span className="body-s muted">{note}</span>
                <span style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    className="sx-btn sx-btn--secondary sx-btn--sm"
                    onClick={() => toggle(m.id)}
                  >
                    {verb}
                  </button>
                  {!m.frozen ? (
                    <button type="button" className="sx-btn sx-btn--secondary sx-btn--sm">
                      Limit
                    </button>
                  ) : null}
                </span>
              </div>
            </section>
          )
        })}

        <Link
          href="/team/ana/methods/new"
          className="tile tile--dashed"
          style={{ textDecoration: "none", color: "var(--ink)", minHeight: 200 }}
        >
          <span className="body-strong">Add a card or local QR</span>
          <span className="body-s muted">
            Card for anywhere cards work. Pix access for Brazilian merchants.
          </span>
        </Link>
      </div>

      <section className="tile" aria-labelledby="recent">
        <div className="tile-head">
          <h2 className="tile-title" id="recent">
            Recent team spending
          </h2>
          <Link href="/activity" className="sx-btn sx-btn--quiet">
            See all
          </Link>
        </div>
        <div className="sx-rows">
          {[...purchases, ...baseSpending].map((p) => (
            <PaymentRow key={p.id} payment={p} />
          ))}
        </div>
        <div className="tile-foot">
          <button
            type="button"
            className="sx-btn sx-btn--secondary sx-btn--sm"
            onClick={simulatePurchase}
          >
            Simulate a purchase
          </button>
          <span className="body-s muted">
            Demo only: runs hold → settle so you can show it live.
          </span>
        </div>
      </section>

      <PixSpendDemo />
      <XenditPayoutDemo />
    </div>
  )
}
