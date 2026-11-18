"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { RisingColumn } from "@/components/sancus-ui/logo"
import { PaymentRow } from "@/components/sancus-ui/payment-row"
import { QrGlyph } from "@/components/sancus-ui/qr-glyph"
import { DemoReadiness } from "@/components/sancus/demo-readiness"
import type { Payment } from "@/lib/sancus/demo-data"
import type { SancusCardDto } from "@/lib/sancus/cards"
import type { SpendingMethodDto } from "@/lib/sancus/local-rails"
import { displayMinor } from "@/lib/sancus/money"

type Method = {
  id: string
  kind: "card" | "qr"
  rail: string
  holder: string
  holderUpper: string
  label: string
  currency: string
  monthlyLimitMinor: string
  usedMinor: string
  limit: string
  used: string
  pct: number
  last4?: string
  monthly?: string
  heldNote?: string
  idleNote?: string
  frozenNote?: string
  frozen: boolean
  simulated?: boolean
  source: "demo" | "local" | "marqeta"
}

const initialMethods: Method[] = [
  {
    id: "ana-card", kind: "card", rail: "Card", holder: "Ana Souza", holderUpper: "ANA SOUZA",
    label: "Office and supplies", currency: "BRL", monthlyLimitMinor: "270000", usedMinor: "54123", limit: "R$ 2.700,00", used: "R$ 541,23", pct: 20,
    last4: "4021", monthly: "R$ 2.700 / MONTH", heldNote: "$398.86 held",
    frozenNote: "Frozen by Admin · today", frozen: false, simulated: true, source: "demo",
  },
  {
    id: "rafael-card", kind: "card", rail: "Card", holder: "Rafael Lima", holderUpper: "RAFAEL LIMA",
    label: "Travel", currency: "BRL", monthlyLimitMinor: "1080000", usedMinor: "0", limit: "R$ 10.800,00", used: "R$ 0,00", pct: 0,
    last4: "7310", monthly: "R$ 10.800 / MONTH", heldNote: "No hold",
    frozenNote: "Frozen by Admin · Nov 12", frozen: true, simulated: true, source: "demo",
  },
]

const baseSpending: Payment[] = [
  { id: "padaria", who: "Padaria Bela Vista · Ana", amount: "−$10.00", meta: "R$ 54,12 · Today, 10:02", rail: "Pix QR", status: "Settled", simulated: true, href: "/activity" },
  { id: "papelaria", who: "Papelaria Central · Ana", amount: "−$100.00", meta: "Held 9:10, settled 9:12", rail: "Card", status: "Settled", simulated: true, href: "/activity" },
]

type Filter = "all" | "cards" | "qr" | "frozen"
const deletedDemoCardsKey = "sancus-deleted-demo-cards"
const demoCardLimitsKey = "sancus-demo-card-limits"

function deletedDemoCards() {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(deletedDemoCardsKey) || "[]") as string[])
  } catch {
    return new Set<string>()
  }
}

function demoCardLimits(): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(demoCardLimitsKey) || "{}") as Record<string, string>
  } catch {
    return {}
  }
}

function formatMethodMoney(currency: string, minor: string) {
  const divisor = currency === "JPY" ? 1 : 100
  return new Intl.NumberFormat(currency === "BRL" ? "pt-BR" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "JPY" ? 0 : 2,
  }).format(Number(minor) / divisor)
}

function withMonthlyLimit(method: Method, monthlyLimitMinor: string): Method {
  const limit = BigInt(monthlyLimitMinor)
  const used = BigInt(method.usedMinor)
  const pct = limit > 0n ? Math.min(100, Number((used * 100n) / limit)) : 0
  const formatted = formatMethodMoney(method.currency, monthlyLimitMinor)
  return {
    ...method,
    monthlyLimitMinor,
    limit: formatted,
    monthly: `${formatted} / MONTH`,
    pct,
  }
}

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
          <span className="sx-card__limit">{method.simulated ? "SIMULATED" : "MARQETA SANDBOX"} · {method.monthly}</span>
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
    currency: m.currency,
    monthlyLimitMinor: m.monthlyLimitMinor,
    usedMinor: m.usedMinor,
    limit: `${prefix}${fmt(limit).replace(".", ",")}`,
    used: `${prefix}${fmt(used).replace(".", ",")}`,
    pct: Math.min(100, pct),
    frozen: m.status === "PAUSED" || m.status === "REVOKED",
    frozenNote: m.status === "REVOKED" ? "Revoked" : "Paused",
    heldNote: `Live ${rail}`,
    last4: m.type === "CARD" ? "····" : undefined,
    source: "local",
  }
}

function cardToMethod(card: SancusCardDto): Method {
  const divisor = card.currency === "JPY" ? 1 : 100
  const limitValue = Number(card.monthlyLimitMinor) / divisor
  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: card.currency,
    maximumFractionDigits: card.currency === "JPY" ? 0 : 2,
  })
  const limit = money.format(limitValue)
  return {
    id: card.id,
    kind: "card",
    rail: "Card",
    holder: card.employeeName,
    holderUpper: card.employeeName.toUpperCase(),
    label: card.label,
    currency: card.currency,
    monthlyLimitMinor: card.monthlyLimitMinor,
    usedMinor: "0",
    limit,
    used: money.format(0),
    pct: 0,
    last4: card.lastFour,
    monthly: `${limit} / MONTH`,
    heldNote: card.simulated ? "Marqeta simulation" : "Marqeta sandbox",
    frozenNote: "Card suspended",
    frozen: card.status !== "ACTIVE",
    simulated: card.simulated,
    source: "marqeta",
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
  const [filter, setFilter] = useState<Filter>("all")
  const [purchases, setPurchases] = useState<Payment[]>([])
  const [liveNote, setLiveNote] = useState<string | null>(null)
  const [holds, setHolds] = useState<HoldRow[]>([
    { id: "h1", merchant: "Papelaria Central", amount: "$100.00", status: "Settled", when: "Today, 9:12" },
    { id: "h2", merchant: "Padaria Bela Vista", amount: "$48.50", status: "Held", when: "Today, 8:40" },
    { id: "h3", merchant: "Uber Trip", amount: "$12.20", status: "Released", when: "Yesterday" },
  ])
  const [selectedCard, setSelectedCard] = useState("ana-card")
  const [cardToDelete, setCardToDelete] = useState<Method | null>(null)
  const [deletingCardId, setDeletingCardId] = useState<string | null>(null)
  const [cardError, setCardError] = useState<string | null>(null)
  const [limitCard, setLimitCard] = useState<Method | null>(null)
  const [limitAmount, setLimitAmount] = useState("")
  const [savingLimit, setSavingLimit] = useState(false)
  const [limitError, setLimitError] = useState<string | null>(null)
  const counter = useRef(0)

  const loadCards = useCallback(async () => {
    try {
      const response = await fetch("/api/sancus/cards", { cache: "no-store" })
      if (!response.ok) return
      const body = (await response.json()) as { cards?: SancusCardDto[] }
      const cards = (body.cards ?? []).map(cardToMethod)
      setMethods((prev) => [...prev.filter((method) => method.source !== "marqeta"), ...cards])
    } catch {
      /* keep demo cards */
    }
  }, [])

  const loadLive = useCallback(async () => {
    try {
      const res = await fetch("/api/sancus/spending-methods", { cache: "no-store" })
      if (!res.ok) return
      const body = await res.json()
      const live = ((body.methods ?? []) as SpendingMethodDto[]).map(liveToMethod)
      setMethods((prev) => [...prev.filter((method) => method.source !== "local"), ...live])
      setLiveNote(`${live.length} live ${live.length === 1 ? "method" : "methods"}`)
    } catch {
      /* keep demo cards */
    }
  }, [])

  useEffect(() => {
    const deleted = deletedDemoCards()
    const limits = demoCardLimits()
    const timer = window.setTimeout(() => {
      setMethods((current) => current
        .filter((method) => method.source !== "demo" || !deleted.has(method.id))
        .map((method) => limits[method.id] ? withMonthlyLimit(method, limits[method.id]!) : method))
      void loadLive()
      void loadCards()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadCards, loadLive])

  useEffect(() => {
    if (!cardToDelete) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !deletingCardId) setCardToDelete(null)
    }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [cardToDelete, deletingCardId])

  useEffect(() => {
    if (!limitCard) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !savingLimit) setLimitCard(null)
    }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [limitCard, savingLimit])

  const frozenCount = methods.filter((m) => m.frozen).length
  const cardCount = methods.filter((m) => m.kind === "card").length
  const qrCount = methods.length - cardCount

  const shown = methods.filter((m) => {
    if (filter === "cards") return m.kind === "card"
    if (filter === "qr") return m.kind === "qr"
    if (filter === "frozen") return m.frozen
    return true
  })

  async function deleteCard(method: Method) {
    setDeletingCardId(method.id)
    setCardError(null)
    try {
      if (method.source === "demo") {
        const deleted = deletedDemoCards()
        deleted.add(method.id)
        window.localStorage.setItem(deletedDemoCardsKey, JSON.stringify([...deleted]))
      } else if (method.source === "marqeta") {
        const response = await fetch(`/api/sancus/cards?id=${encodeURIComponent(method.id)}`, { method: "DELETE" })
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.error || "Could not delete card")
      } else if (method.source === "local") {
        const response = await fetch(`/api/sancus/spending-methods/${method.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "revoke" }),
        })
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.error || "Could not delete card")
      }

      setMethods((current) => current.filter((item) => item.id !== method.id))
      setSelectedCard((current) => current === method.id ? "" : current)
      setCardToDelete(null)
    } catch (caught) {
      setCardError(caught instanceof Error ? caught.message : "Could not delete card")
    } finally {
      setDeletingCardId(null)
    }
  }

  function openLimit(method: Method) {
    const divisor = method.currency === "JPY" ? 1 : 100
    setLimitAmount(String(Number(method.monthlyLimitMinor) / divisor))
    setLimitError(null)
    setLimitCard(method)
  }

  async function saveLimit() {
    if (!limitCard) return
    const amount = Number(limitAmount.replace(/,/g, ""))
    if (!Number.isFinite(amount) || amount <= 0) {
      setLimitError("Enter a monthly limit greater than zero.")
      return
    }
    setSavingLimit(true)
    setLimitError(null)
    try {
      if (limitCard.source === "marqeta") {
        const response = await fetch("/api/sancus/cards", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: limitCard.id, monthlyLimit: amount }),
        })
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.error || "Could not save card limit")
      } else if (limitCard.source === "local") {
        const response = await fetch(`/api/sancus/spending-methods/${limitCard.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update_limit", monthlyLimit: amount }),
        })
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.error || "Could not save card limit")
      }

      const scale = limitCard.currency === "JPY" ? 1 : 100
      const nextMinor = String(Math.round(amount * scale))
      if (limitCard.source === "demo") {
        const limits = demoCardLimits()
        limits[limitCard.id] = nextMinor
        window.localStorage.setItem(demoCardLimitsKey, JSON.stringify(limits))
      }
      setMethods((current) => current.map((method) => method.id === limitCard.id ? withMonthlyLimit(method, nextMinor) : method))
      setLimitCard(null)
    } catch (caught) {
      setLimitError(caught instanceof Error ? caught.message : "Could not save card limit")
    } finally {
      setSavingLimit(false)
    }
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
    { id: "qr", label: `Pix access · ${qrCount}` },
    { id: "frozen", label: `Frozen · ${frozenCount}` },
  ]

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="sx-h heading-2">Spending</h1>
          <p className="body-s muted" style={{ margin: 0 }}>
            Cards and Pix access for your team. Each spends from your balance, up to a monthly limit
            in that person&apos;s own currency.
            {liveNote ? ` · ${liveNote}` : ""}
          </p>
        </div>
        <Link href="/team/ana/methods/new" className="sx-btn sx-btn--primary">
          Give someone a card or Pix access
        </Link>
      </header>

      <DemoReadiness />

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
          const note = m.frozen
            ? m.frozenNote
            : m.idleNote ?? `Active · ${m.heldNote}`
          return (
            <section
              key={m.id}
              className="tile spending-method-tile"
              aria-label={`${m.holder}'s ${m.rail}${m.last4 ? ` ${m.last4}` : ""}${m.frozen ? ", frozen" : ""}`}
            >
              {m.kind === "card" ? (
                <button
                  type="button"
                  className="card-delete"
                  aria-label={`Delete ${m.holder}'s card ending ${m.last4}`}
                  title="Delete card"
                  disabled={deletingCardId === m.id}
                  onClick={() => {
                    setCardError(null)
                    setCardToDelete(m)
                  }}
                >
                  <span aria-hidden="true">×</span>
                </button>
              ) : null}
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
                <button
                  type="button"
                  className="sx-btn sx-btn--secondary sx-btn--sm"
                  onClick={() => openLimit(m)}
                >
                  Limit
                </button>
              </div>
            </section>
          )
        })}

        <Link
          href="/team/ana/methods/new"
          className="tile tile--dashed"
          style={{ textDecoration: "none", color: "var(--ink)", minHeight: 200 }}
        >
          <span className="body-strong">Add a card or Pix access</span>
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
      {limitCard ? (
        <div
          className="card-delete-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !savingLimit) setLimitCard(null)
          }}
        >
          <section
            className="card-delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="card-limit-title"
            aria-describedby="card-limit-description"
          >
            <div className="card-delete-dialog__head">
              <div>
                <span className="sx-label">Monthly spending</span>
                <h2 className="sx-h heading-3" id="card-limit-title">Edit card limit</h2>
              </div>
              <button
                type="button"
                className="card-delete-dialog__close"
                aria-label="Close limit editor"
                disabled={savingLimit}
                onClick={() => setLimitCard(null)}
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>

            <div className="card-delete-dialog__summary" id="card-limit-description">
              <span className="body-strong">{limitCard.holder}</span>
              <span className="data">{limitCard.last4 ? `•••• ${limitCard.last4}` : limitCard.rail}</span>
              <span className="body-s muted">Current limit · {limitCard.limit} per month</span>
            </div>

            <label className="sx-field">
              <span className="sx-label">New monthly limit · {limitCard.currency}</span>
              <input
                className="sx-field__input"
                inputMode="decimal"
                autoFocus
                value={limitAmount}
                disabled={savingLimit}
                onChange={(event) => setLimitAmount(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void saveLimit()
                }}
              />
            </label>

            {limitError ? <p className="body-s card-delete-error" role="alert">{limitError}</p> : null}

            <div className="card-delete-dialog__actions">
              <button
                type="button"
                className="sx-btn sx-btn--secondary"
                disabled={savingLimit}
                onClick={() => setLimitCard(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="sx-btn sx-btn--primary"
                disabled={savingLimit}
                onClick={() => void saveLimit()}
              >
                {savingLimit ? "Saving…" : "Save limit"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {cardToDelete ? (
        <div
          className="card-delete-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deletingCardId) setCardToDelete(null)
          }}
        >
          <section
            className="card-delete-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-card-title"
            aria-describedby="delete-card-description"
          >
            <div className="card-delete-dialog__head">
              <div>
                <span className="sx-label">Corporate card</span>
                <h2 className="sx-h heading-3" id="delete-card-title">Delete this card?</h2>
              </div>
              <button
                type="button"
                className="card-delete-dialog__close"
                aria-label="Close delete confirmation"
                disabled={Boolean(deletingCardId)}
                onClick={() => setCardToDelete(null)}
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>

            <div className="card-delete-dialog__summary" id="delete-card-description">
              <span className="body-strong">{cardToDelete.holder}</span>
              <span className="data">•••• {cardToDelete.last4}</span>
              <span className="body-s muted">{cardToDelete.label} · {cardToDelete.limit} monthly limit</span>
            </div>

            <p className="body-s muted card-delete-dialog__copy">
              This card will disappear from Spending and can no longer be assigned or managed in Sancus.
            </p>

            {cardError ? <p className="body-s card-delete-error" role="alert">{cardError}</p> : null}

            <div className="card-delete-dialog__actions">
              <button
                type="button"
                className="sx-btn sx-btn--secondary"
                autoFocus
                disabled={Boolean(deletingCardId)}
                onClick={() => setCardToDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="sx-btn card-delete-dialog__confirm"
                disabled={Boolean(deletingCardId)}
                onClick={() => void deleteCard(cardToDelete)}
              >
                {deletingCardId ? "Deleting…" : "Delete card"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
