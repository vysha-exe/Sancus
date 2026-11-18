"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { RisingColumn } from "@/components/sancus-ui/logo"
import { PaymentRow } from "@/components/sancus-ui/payment-row"
import { QrGlyph } from "@/components/sancus-ui/qr-glyph"
import { PixSpendDemo } from "@/components/sancus/pix-spend-demo"
import { XenditPayoutDemo } from "@/components/sancus/xendit-payout-demo"
import type { Payment } from "@/lib/sancus/demo-data"
import type { SpendingMethodDto } from "@/lib/sancus/local-rails"
import { displayMinor } from "@/lib/sancus/money"

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
      </span>
      <QrGlyph />
      <span className="data">{method.holderUpper}</span>
    </div>
  )
}

function liveToMethod(m: SpendingMethodDto): Method {
  const limit = BigInt(m.monthlyLimitMinor)
  const used = BigInt(m.usedMinor)
  const pct = limit > 0n ? Number((used * 100n) / limit) : 0
  const dec = 2
  const fmt = (n: bigint) => displayMinor(n, dec, "", 2)
  const prefix = m.currency === "BRL" ? "R$ " : m.currency === "IDR" ? "Rp " : m.currency === "THB" ? "฿" : "$"
  const rail = m.type === "CARD" ? "Card" : m.type === "QRIS" ? "QRIS" : m.type === "PROMPTPAY" ? "PromptPay" : "Pix"
  return {
    id: m.id,
    kind: m.type === "CARD" ? "card" : "qr",
    rail,
    holder: m.employeeName,
    holderUpper: m.employeeName.toUpperCase(),
    label: m.label,
    limit: `${prefix}${fmt(limit).replace(".", ",")}`,
    used: `${prefix}${fmt(used).replace(".", ",")}`,
    pct: Math.min(100, pct),
    frozen: m.status === "PAUSED" || m.status === "REVOKED",
    frozenNote: m.status === "REVOKED" ? "Revoked" : "Paused",
    heldNote: `Live ${rail}`,
    last4: m.type === "CARD" ? "····" : undefined,
  }
}

type HoldRow = {
  id: string
  merchant: string
  amount: string
  status: "Held" | "Settled" | "Released"
  when: string
}

export default function SpendingPage() {
  const [methods, setMethods] = useState(initialMethods)
  const [liveIds, setLiveIds] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<Filter>("all")
  const [purchases, setPurchases] = useState<Payment[]>([])
  const [liveNote, setLiveNote] = useState<string | null>(null)
  const [holds, setHolds] = useState<HoldRow[]>([
    { id: "h1", merchant: "Papelaria Central", amount: "$100.00", status: "Settled", when: "Today, 9:12" },
    { id: "h2", merchant: "Padaria Bela Vista", amount: "$48.50", status: "Held", when: "Today, 8:40" },
    { id: "h3", merchant: "Uber Trip", amount: "$12.20", status: "Released", when: "Yesterday" },
  ])
  const [selectedCard, setSelectedCard] = useState("ana-card")
  const counter = useRef(0)

  const loadLive = useCallback(async () => {
    try {
      const res = await fetch("/api/sancus/spending-methods", { cache: "no-store" })
      if (!res.ok) return
      const body = await res.json()
      const live = ((body.methods ?? []) as SpendingMethodDto[]).map(liveToMethod)
      if (live.length === 0) return
      setLiveIds(new Set(live.map((m) => m.id)))
      setMethods((prev) => {
        const demoCards = prev.filter((m) => m.kind === "card" && !live.some((l) => l.id === m.id))
        return [...demoCards, ...live]
      })
      setLiveNote(`${live.length} live ${live.length === 1 ? "method" : "methods"}`)
    } catch {
      /* keep demo cards */
    }
  }, [])

  useEffect(() => {
    void loadLive()
  }, [loadLive])

  const frozenCount = methods.filter((m) => m.frozen).length
  const cardCount = methods.filter((m) => m.kind === "card").length
  const qrCount = methods.length - cardCount

  const shown = methods.filter((m) => {
    if (filter === "cards") return m.kind === "card"
    if (filter === "qr") return m.kind === "qr"
    if (filter === "frozen") return m.frozen
    return true
  })

  async function toggle(id: string) {
    if (liveIds.has(id)) {
      const current = methods.find((m) => m.id === id)
      const action = current?.frozen ? "resume" : "pause"
      const res = await fetch(`/api/sancus/spending-methods/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      if (res.ok) void loadLive()
      return
    }
    setMethods((prev) => prev.map((m) => (m.id === id ? { ...m, frozen: !m.frozen } : m)))
  }

  function simulatePurchase() {
    counter.current += 1
    const id = `sim-${counter.current}`
    const holdId = `hold-${counter.current}`
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
    setHolds((prev) => [
      { id: holdId, merchant: "Livraria Cultura", amount: "$25.00", status: "Held", when: "Just now" },
      ...prev,
    ])
    setSelectedCard("ana-card")
    window.setTimeout(() => {
      setPurchases((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status: "Settled", meta: "Held, then settled just now" } : p)),
      )
      setHolds((prev) => prev.map((h) => (h.id === holdId ? { ...h, status: "Settled", when: "Just now" } : h)))
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
            {liveNote ? ` · ${liveNote}` : ""}
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

      <div className="grid">
        <section className="tile s7" aria-labelledby="recent">
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
            <button type="button" className="sx-btn sx-btn--secondary sx-btn--sm" onClick={simulatePurchase}>
              Simulate a purchase
            </button>
            <span className="body-s muted">Runs hold → settle so you can see the card lifecycle.</span>
          </div>
        </section>

        <section className="tile s5" aria-labelledby="holds">
          <div className="tile-head">
            <h2 className="tile-title" id="holds">
              Holds on card {methods.find((m) => m.id === selectedCard)?.last4 ?? "4021"}
            </h2>
            <span className="sx-pill sx-pill--settled">Marqeta</span>
          </div>
          <div className="filters" role="group" aria-label="Card" style={{ marginBottom: 8 }}>
            {methods
              .filter((m) => m.kind === "card")
              .map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="chip"
                  aria-pressed={selectedCard === m.id}
                  onClick={() => setSelectedCard(m.id)}
                >
                  {m.holder.split(" ")[0]} · {m.last4}
                </button>
              ))}
          </div>
          <div className="holds">
            {holds.map((h) => (
              <div key={h.id} className="hold">
                <div>
                  <span className="body-strong">{h.merchant}</span>
                  <span className="body-s muted" style={{ display: "block" }}>
                    {h.when}
                  </span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span className="amt">{h.amount}</span>
                  <span style={{ display: "block" }}>
                    <span
                      className={`sx-pill ${
                        h.status === "Held"
                          ? "sx-pill--pending"
                          : h.status === "Settled"
                            ? "sx-pill--settled"
                            : "sx-pill--failed"
                      }`}
                    >
                      {h.status}
                    </span>
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="tile-foot">
            <span className="body-s muted">
              Held amounts sit in your balance until the merchant settles or the hold drops.
            </span>
          </div>
        </section>
      </div>

      <PixSpendDemo />
      <XenditPayoutDemo />
    </div>
  )
}
