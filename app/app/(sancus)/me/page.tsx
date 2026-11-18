"use client"

// Employee dashboard: your virtual card, your spending limits, your QR methods and your agent.
// Employees can't move company money; everything here is read-only for them.
import { useEffect, useMemo, useState } from "react"
import { VirtualCard } from "@/components/sancus-ui/virtual-card"
import { countryByCode } from "@/lib/sancus/countries"

type Method = { id: string; type: "CARD" | "PIX" | "QRIS" | "PROMPTPAY"; provider: string; label: string; currency: string; monthlyLimitMinor: string; status: string }
type Data = {
  firstName: string
  company: { id: string; name: string; country: string; role: string } | null
  limits: { perPaymentMinor: string | null; dailyMinor: string | null }
  methods: Method[]
}

const usd6 = (minor: string | null) => (minor ? `$${(Number(minor) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "No limit")
const SYMBOL: Record<string, string> = { USD: "$", THB: "฿", IDR: "Rp ", BRL: "R$ " }
const money2 = (minor: string, cur: string) => `${SYMBOL[cur] ?? ""}${(Number(minor) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}${SYMBOL[cur] ? "" : ` ${cur}`}`
const RAIL: Record<Method["type"], string> = { CARD: "Card", PIX: "Pix", QRIS: "QRIS", PROMPTPAY: "PromptPay" }
/** Stable, fake-looking last four for a sandbox card. */
const last4 = (id: string) => String(parseInt(id.replace(/-/g, "").slice(-6), 16) % 10000).padStart(4, "0")

const QUESTIONS = ["What can I spend today?", "Can I pay ฿2,000 by QR?", "Who approves bigger payments?"] as const

export default function EmployeePage() {
  const [data, setData] = useState<Data | null>(null)
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const [asked, setAsked] = useState<(typeof QUESTIONS)[number] | null>(null)

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/sancus/accounts/me/employee", { cache: "no-store" })
        if (!res.ok) throw new Error()
        setData(await res.json())
        setState("ready")
      } catch {
        setState("error")
      }
    }, 0)
    return () => clearTimeout(t)
  }, [])

  const card = data?.methods.find((m) => m.type === "CARD") ?? null
  const qr = useMemo(() => data?.methods.filter((m) => m.type !== "CARD") ?? [], [data])
  const where = data?.company ? `${countryByCode(data.company.country)?.flag ?? ""} ${data.company.name}` : ""

  const answer = useMemo(() => {
    if (!data || !asked) return null
    const daily = data.limits.dailyMinor ? Number(data.limits.dailyMinor) / 1e6 : null
    const perPay = data.limits.perPaymentMinor ? Number(data.limits.perPaymentMinor) / 1e6 : null
    if (asked === QUESTIONS[0]) {
      return daily
        ? `Up to ${usd6(data.limits.dailyMinor)} today, and no more than ${usd6(data.limits.perPaymentMinor)} in one payment. Your card and QR methods share that limit.`
        : "Your admin hasn't set a daily limit, so your card's monthly cap applies."
    }
    if (asked === QUESTIONS[1]) {
      const pp = qr.find((m) => m.type === "PROMPTPAY")
      const usdEq = 2000 / 36 // ~฿36 per USD, for the estimate
      if (!pp) return "You don't have a PromptPay QR yet. Ask your branch admin to add one for your trip."
      return perPay && usdEq > perPay
        ? `฿2,000 is about $${usdEq.toFixed(0)}, over your ${usd6(data.limits.perPaymentMinor)} per-payment limit. Split it or ask your admin.`
        : `Yes. ฿2,000 is about $${usdEq.toFixed(0)}, inside your ${usd6(data.limits.perPaymentMinor)} per-payment limit. Pay with “${pp.label}”.`
    }
    return `Anything over your limit goes to your branch admin at ${data.company?.name ?? "your branch"}. You can't send company money yourself.`
  }, [asked, data, qr])

  return (
    <div className="page">
      <header className="page-head">
        <div style={{ display: "grid", gap: 6 }}>
          <span className="sx-label">Employee</span>
          <h1 className="sx-h heading-2">{data ? `Hi, ${data.firstName}` : "Your card"}</h1>
          <p className="body-s muted" style={{ margin: 0 }}>
            {where ? `${where} · ` : ""}Your card, your limits and your agent. Payments over your limit go to your admin.
          </p>
        </div>
      </header>

      {state === "error" ? (
        <div className="tile s12">
          <div className="empty">Couldn&apos;t load your card. Refresh to try again.</div>
        </div>
      ) : (
        <div className="grid">
          <section className="tile s6" aria-labelledby="card">
            <div className="tile-head">
              <h2 className="tile-title" id="card">
                Virtual card
              </h2>
              {card ? <span className="sx-pill sx-pill--settled">{card.status === "ACTIVE" ? "Active" : card.status}</span> : null}
            </div>
            {state === "loading" ? (
              <div className="empty">Loading…</div>
            ) : card ? (
              <>
                <VirtualCard
                  limit={`${money2(card.monthlyLimitMinor, card.currency)}/MO`}
                  name={(data?.firstName ?? "").toUpperCase()}
                  num={`•••• •••• •••• ${last4(card.id)}`}
                  ariaLabel={`Virtual card ending ${last4(card.id)}`}
                />
                <span className="body-s muted">Sandbox card for the demo. Works wherever cards are taken; use QR where they aren&apos;t.</span>
              </>
            ) : (
              <div className="empty">No card yet. Your admin issues it when they set up your login.</div>
            )}
          </section>

          <section className="tile s6" aria-labelledby="limits">
            <div className="tile-head">
              <h2 className="tile-title" id="limits">
                Spending limits
              </h2>
              <span className="body-s muted">Set by your admin</span>
            </div>
            <div className="kv">
              <span>Per payment</span>
              <span className="body-strong">{usd6(data?.limits.perPaymentMinor ?? null)}</span>
            </div>
            <div className="kv">
              <span>Per day</span>
              <span className="body-strong">{usd6(data?.limits.dailyMinor ?? null)}</span>
            </div>
            {card ? (
              <div className="kv">
                <span>Card, per month</span>
                <span>{money2(card.monthlyLimitMinor, card.currency)}</span>
              </div>
            ) : null}
            <div style={{ display: "grid", gap: 8, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
              <span className="sx-label">QR payments</span>
              {qr.length ? (
                qr.map((m) => (
                  <div className="kv" key={m.id}>
                    <span>
                      <span className="sx-rail">{RAIL[m.type]}</span> {m.label}
                    </span>
                    <span>{money2(m.monthlyLimitMinor, m.currency)}/mo</span>
                  </div>
                ))
              ) : (
                <span className="body-s muted">No QR methods yet. Ask your admin before a trip to Thailand, Indonesia or Brazil.</span>
              )}
            </div>
          </section>

          <section className="tile s12" aria-labelledby="agent">
            <div className="tile-head">
              <h2 className="tile-title" id="agent">
                Your agent
              </h2>
              <span className="body-s muted">Answers from your card and limits</span>
            </div>
            <div className="filters" role="group" aria-label="Ask your agent">
              {QUESTIONS.map((q) => (
                <button key={q} type="button" className="chip" aria-pressed={asked === q} onClick={() => setAsked(q)} disabled={!data}>
                  {q}
                </button>
              ))}
            </div>
            {answer ? (
              <p className="body" role="status" style={{ margin: 0 }}>
                {answer}
              </p>
            ) : (
              <span className="body-s muted">Pick a question. Your agent can explain your limits but can&apos;t move money.</span>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
