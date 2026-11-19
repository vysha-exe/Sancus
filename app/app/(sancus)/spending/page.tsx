"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { RisingColumn } from "@/components/sancus-ui/logo"
import { PaymentRow } from "@/components/sancus-ui/payment-row"
import { QrGlyph } from "@/components/sancus-ui/qr-glyph"
import { DemoReadiness } from "@/components/sancus/demo-readiness"
import type { Payment } from "@/lib/sancus/demo-data"
import type { SancusCardDto } from "@/lib/sancus/cards"
import type { EmployeeCardPurchaseDto } from "@/lib/sancus/employee-spending"
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
  source: "local" | "marqeta"
}

type Filter = "all" | "cards" | "qr" | "frozen"

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

function withUsed(method: Method, usedMinor: bigint): Method {
  const limit = BigInt(method.monthlyLimitMinor)
  return {
    ...method,
    usedMinor: String(usedMinor),
    used: formatMethodMoney(method.currency, String(usedMinor)),
    pct: limit > 0n ? Math.min(100, Number((usedMinor * 100n) / limit)) : 0,
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
  const limit = formatMethodMoney(card.currency, card.monthlyLimitMinor)
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
    used: formatMethodMoney(card.currency, "0"),
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
  cardId: string | null
  merchant: string
  amount: string
  status: "Held" | "Settled" | "Released"
  when: string
}

function whenLabel(iso: string) {
  const date = new Date(iso)
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  const now = new Date()
  if (date.toDateString() === now.toDateString()) return `Today, ${time}`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`
  return `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${time}`
}

function purchaseToPayment(p: EmployeeCardPurchaseDto, simulated: boolean): Payment {
  const status = p.status === "SETTLED" ? "Settled" : p.status === "HELD" ? "Held" : "Failed"
  return {
    id: p.id,
    who: `${p.merchantName} · ${p.employeeName.split(" ")[0]}`,
    amount: `−${formatMethodMoney(p.currency, p.amountMinor)}`,
    meta: p.settledAt ? `Held, settled ${whenLabel(p.settledAt)}` : `Held ${whenLabel(p.authorizedAt)}`,
    rail: "Card",
    status,
    simulated,
    href: "/activity",
  }
}

function purchaseToHold(p: EmployeeCardPurchaseDto): HoldRow {
  return {
    id: p.id,
    cardId: p.cardId,
    merchant: p.merchantName,
    amount: formatMethodMoney(p.currency, p.amountMinor),
    status: p.status === "SETTLED" ? "Settled" : p.status === "HELD" ? "Held" : "Released",
    when: whenLabel(p.settledAt ?? p.authorizedAt),
  }
}

async function readError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}))
  return (body as { error?: string }).error || fallback
}

export default function SpendingPage() {
  const [methods, setMethods] = useState<Method[]>([])
  const [filter, setFilter] = useState<Filter>("all")
  const [rawPurchases, setRawPurchases] = useState<EmployeeCardPurchaseDto[]>([])
  const [liveNote, setLiveNote] = useState<string | null>(null)
  const [selectedCard, setSelectedCard] = useState("")
  const [methodToDelete, setMethodToDelete] = useState<Method | null>(null)
  const [deletingMethodId, setDeletingMethodId] = useState<string | null>(null)
  const [methodError, setMethodError] = useState<string | null>(null)
  const [limitCard, setLimitCard] = useState<Method | null>(null)
  const [limitAmount, setLimitAmount] = useState("")
  const [savingLimit, setSavingLimit] = useState(false)
  const [limitError, setLimitError] = useState<string | null>(null)
  const [freezingId, setFreezingId] = useState<string | null>(null)
  const [simulating, setSimulating] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const loadCards = useCallback(async () => {
    try {
      const response = await fetch("/api/sancus/cards", { cache: "no-store" })
      if (!response.ok) return
      const body = (await response.json()) as { cards?: SancusCardDto[] }
      const cards = (body.cards ?? []).map(cardToMethod)
      setMethods((prev) => [...prev.filter((method) => method.source !== "marqeta"), ...cards])
    } catch {
      /* leave cards as they are */
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
      /* leave methods as they are */
    }
  }, [])

  const loadPurchases = useCallback(async () => {
    try {
      const res = await fetch("/api/sancus/card-purchases", { cache: "no-store" })
      if (!res.ok) return
      const body = (await res.json()) as { purchases?: EmployeeCardPurchaseDto[] }
      setRawPurchases(body.purchases ?? [])
    } catch {
      /* leave purchases as they are */
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadLive()
      void loadCards()
      void loadPurchases()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadCards, loadLive, loadPurchases])

  useEffect(() => {
    if (!methodToDelete) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !deletingMethodId) setMethodToDelete(null)
    }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [methodToDelete, deletingMethodId])

  useEffect(() => {
    if (!limitCard) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !savingLimit) setLimitCard(null)
    }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [limitCard, savingLimit])

  const cardMethods = useMemo(() => methods.filter((m) => m.kind === "card"), [methods])
  const activeCardId = cardMethods.some((m) => m.id === selectedCard) ? selectedCard : cardMethods[0]?.id ?? ""
  const selected = cardMethods.find((m) => m.id === activeCardId)

  const displayMethods = useMemo(() => {
    const used = new Map<string, bigint>()
    for (const p of rawPurchases) {
      if (!p.cardId || (p.status !== "HELD" && p.status !== "SETTLED")) continue
      used.set(p.cardId, (used.get(p.cardId) ?? 0n) + BigInt(p.amountMinor))
    }
    return methods.map((m) => m.source === "marqeta" && used.has(m.id) ? withUsed(m, used.get(m.id)!) : m)
  }, [methods, rawPurchases])

  const simulatedCardIds = useMemo(() => new Set(methods.filter((m) => m.simulated).map((m) => m.id)), [methods])
  const payments = useMemo(
    () => rawPurchases.map((p) => purchaseToPayment(p, Boolean(p.cardId && simulatedCardIds.has(p.cardId)))),
    [rawPurchases, simulatedCardIds],
  )
  const holds = useMemo(
    () => rawPurchases.filter((p) => p.cardId === activeCardId).map(purchaseToHold),
    [rawPurchases, activeCardId],
  )

  const frozenCount = displayMethods.filter((m) => m.frozen).length
  const cardCount = displayMethods.filter((m) => m.kind === "card").length
  const qrCount = displayMethods.length - cardCount

  const shown = displayMethods.filter((m) => {
    if (filter === "cards") return m.kind === "card"
    if (filter === "qr") return m.kind === "qr"
    if (filter === "frozen") return m.frozen
    return true
  })

  async function deleteMethod(method: Method) {
    setDeletingMethodId(method.id)
    setMethodError(null)
    const methodLabel = method.kind === "card" ? "card" : `${method.rail} access`
    try {
      if (method.source === "marqeta") {
        const response = await fetch(`/api/sancus/cards?id=${encodeURIComponent(method.id)}`, { method: "DELETE" })
        if (!response.ok) throw new Error(await readError(response, `Could not delete ${methodLabel}`))
      } else if (method.source === "local") {
        const response = await fetch(`/api/sancus/spending-methods/${method.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "revoke" }),
        })
        if (!response.ok) throw new Error(await readError(response, `Could not delete ${methodLabel}`))
      }

      setMethods((current) => current.filter((item) => item.id !== method.id))
      setSelectedCard((current) => current === method.id ? "" : current)
      setMethodToDelete(null)
    } catch (caught) {
      setMethodError(caught instanceof Error ? caught.message : `Could not delete ${methodLabel}`)
    } finally {
      setDeletingMethodId(null)
    }
  }

  async function toggleFreeze(method: Method) {
    setFreezingId(method.id)
    setActionError(null)
    try {
      const response = method.source === "marqeta"
        ? await fetch("/api/sancus/cards", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: method.id, status: method.frozen ? "ACTIVE" : "SUSPENDED" }),
          })
        : await fetch(`/api/sancus/spending-methods/${method.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: method.frozen ? "resume" : "pause" }),
          })
      if (!response.ok) throw new Error(await readError(response, method.frozen ? "Could not unfreeze" : "Could not freeze"))
      setMethods((current) => current.map((item) => item.id === method.id ? { ...item, frozen: !method.frozen } : item))
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Could not update status")
    } finally {
      setFreezingId(null)
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
        if (!response.ok) throw new Error(await readError(response, "Could not save card limit"))
      } else {
        const response = await fetch(`/api/sancus/spending-methods/${limitCard.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update_limit", monthlyLimit: amount }),
        })
        if (!response.ok) throw new Error(await readError(response, "Could not save card limit"))
      }

      const scale = limitCard.currency === "JPY" ? 1 : 100
      const nextMinor = String(Math.round(amount * scale))
      setMethods((current) => current.map((method) => method.id === limitCard.id ? withMonthlyLimit(method, nextMinor) : method))
      setLimitCard(null)
    } catch (caught) {
      setLimitError(caught instanceof Error ? caught.message : "Could not save card limit")
    } finally {
      setSavingLimit(false)
    }
  }

  async function simulatePurchase() {
    if (!selected) {
      setActionError("Add a card first, then simulate a purchase on it.")
      return
    }
    if (selected.source !== "marqeta") {
      setActionError("Purchases can only be simulated on issued cards.")
      return
    }
    setSimulating(true)
    setActionError(null)
    try {
      const created = await fetch("/api/sancus/card-purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: selected.id, merchantName: "Livraria Cultura", amount: 25 }),
      })
      if (!created.ok) throw new Error(await readError(created, "Could not create the purchase"))
      const { purchase } = (await created.json()) as { purchase: EmployeeCardPurchaseDto }
      await loadPurchases()
      await new Promise((resolve) => window.setTimeout(resolve, 1500))
      const settled = await fetch(`/api/sancus/card-purchases/${purchase.id}/settle`, { method: "POST" })
      if (!settled.ok) throw new Error(await readError(settled, "Could not settle the purchase"))
      await loadPurchases()
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Could not simulate the purchase")
      await loadPurchases()
    } finally {
      setSimulating(false)
    }
  }

  const filterList: { id: Filter; label: string }[] = [
    { id: "all", label: `All · ${displayMethods.length}` },
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
        <Link href="/team" className="sx-btn sx-btn--primary">
          Give someone a card or Pix access
        </Link>
      </header>

      <DemoReadiness />

      {actionError ? <p className="body-s card-delete-error" role="alert">{actionError}</p> : null}

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
              <button
                type="button"
                className="card-delete"
                aria-label={m.kind === "card" ? `Delete ${m.holder}'s card ending ${m.last4}` : `Delete ${m.holder}'s ${m.rail} access`}
                title={m.kind === "card" ? "Delete card" : `Delete ${m.rail} access`}
                disabled={deletingMethodId === m.id}
                onClick={() => {
                  setMethodError(null)
                  setMethodToDelete(m)
                }}
              >
                <span aria-hidden="true">×</span>
              </button>
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
                <span style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="sx-btn sx-btn--secondary sx-btn--sm"
                    disabled={freezingId === m.id}
                    onClick={() => void toggleFreeze(m)}
                  >
                    {freezingId === m.id ? "Saving…" : m.frozen ? "Unfreeze" : "Freeze"}
                  </button>
                  <button
                    type="button"
                    className="sx-btn sx-btn--secondary sx-btn--sm"
                    onClick={() => openLimit(m)}
                  >
                    Limit
                  </button>
                </span>
              </div>
            </section>
          )
        })}

        <Link
          href="/team"
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
            {payments.length ? (
              payments.map((p) => <PaymentRow key={p.id} payment={p} />)
            ) : (
              <p className="body-s muted" style={{ margin: 0 }}>No card purchases yet.</p>
            )}
          </div>
          <div className="tile-foot">
            <button
              type="button"
              className="sx-btn sx-btn--secondary sx-btn--sm"
              disabled={simulating || !selected}
              onClick={() => void simulatePurchase()}
            >
              {simulating ? "Simulating…" : "Simulate a purchase"}
            </button>
            <span className="body-s muted">Runs hold → settle so you can see the card lifecycle.</span>
          </div>
        </section>

        <section className="tile s5" aria-labelledby="holds">
          <div className="tile-head">
            <h2 className="tile-title" id="holds">
              {selected?.last4 ? `Holds on card ${selected.last4}` : "Holds"}
            </h2>
            <span className="sx-pill sx-pill--settled">Marqeta</span>
          </div>
          <div className="filters" role="group" aria-label="Card" style={{ marginBottom: 8 }}>
            {cardMethods.map((m) => (
              <button
                key={m.id}
                type="button"
                className="chip"
                aria-pressed={activeCardId === m.id}
                onClick={() => setSelectedCard(m.id)}
              >
                {m.holder.split(" ")[0]} · {m.last4}
              </button>
            ))}
          </div>
          <div className="holds">
            {holds.length ? holds.map((h) => (
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
            )) : (
              <p className="body-s muted" style={{ margin: 0 }}>No holds on this card.</p>
            )}
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

      {methodToDelete ? (
        <div
          className="card-delete-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deletingMethodId) setMethodToDelete(null)
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
                <span className="sx-label">{methodToDelete.kind === "card" ? "Corporate card" : "Local payment access"}</span>
                <h2 className="sx-h heading-3" id="delete-card-title">
                  Delete this {methodToDelete.kind === "card" ? "card" : `${methodToDelete.rail} access`}?
                </h2>
              </div>
              <button
                type="button"
                className="card-delete-dialog__close"
                aria-label="Close delete confirmation"
                disabled={Boolean(deletingMethodId)}
                onClick={() => setMethodToDelete(null)}
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>

            <div className="card-delete-dialog__summary" id="delete-card-description">
              <span className="body-strong">{methodToDelete.holder}</span>
              <span className="data">{methodToDelete.kind === "card" ? `•••• ${methodToDelete.last4}` : methodToDelete.rail}</span>
              <span className="body-s muted">{methodToDelete.label} · {methodToDelete.limit} monthly limit</span>
            </div>

            <p className="body-s muted card-delete-dialog__copy">
              This {methodToDelete.kind === "card" ? "card" : `${methodToDelete.rail} access`} will disappear from Spending and can no longer be used or managed in Sancus.
            </p>

            {methodError ? <p className="body-s card-delete-error" role="alert">{methodError}</p> : null}

            <div className="card-delete-dialog__actions">
              <button
                type="button"
                className="sx-btn sx-btn--secondary"
                autoFocus
                disabled={Boolean(deletingMethodId)}
                onClick={() => setMethodToDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="sx-btn card-delete-dialog__confirm"
                disabled={Boolean(deletingMethodId)}
                onClick={() => void deleteMethod(methodToDelete)}
              >
                {deletingMethodId ? "Deleting…" : `Delete ${methodToDelete.kind === "card" ? "card" : `${methodToDelete.rail} access`}`}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
