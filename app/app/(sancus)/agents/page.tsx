"use client"

import Link from "next/link"
import { useState, type FormEvent } from "react"
import { agents } from "@/lib/sancus/demo-data"
import { X402Earnings } from "@/components/sancus-ui/x402-earnings"

type Message = {
  id: number
  from: "me" | "us"
  text: string
  link?: { href: string; label: string }
}

const initialMessages: Message[] = [
  { id: 1, from: "me", text: "Which payments need approval?" },
  {
    id: 2,
    from: "us",
    text: "Three are waiting, $2,620.05 together. The oldest is Ana's R$ 3.200,00 to Gráfica Aurora. It's over her $500 limit.",
    link: { href: "/activity/approvals", label: "Open Approvals" },
  },
  {
    id: 3,
    from: "me",
    text: "What did we spend in Brazil this month, and what's due next week?",
  },
  {
    id: 4,
    from: "us",
    text: "$210.80 in Brazil: $100.80 to Juliana by Pix, $100.00 on Ana's card and $10.00 on her Pix QR. Next week Torrefação Lisboa (€ 1.840,00) and Café Oaxaca (MX$ 18,500.00) come due, about $3,003.68. You have $6,390.34 available, so you're covered.",
    link: { href: "/invoices", label: "Get both bills ready" },
  },
]

const agentPayments = [
  {
    id: "crop",
    who: "Crop imagery API · waiting for you",
    amount: "$40.00",
    meta: "Today",
    status: "Pending",
    href: "/activity/approvals",
    incoming: false,
  },
  {
    id: "coffee",
    who: "Coffee price feed",
    amount: "−$4.20",
    meta: "420 requests · Today",
    status: "Settled",
    href: "/activity",
    incoming: false,
  },
  {
    id: "shipping",
    who: "Shipping rates API",
    amount: "−$8.20",
    meta: "82 quotes · Yesterday",
    status: "Settled",
    href: "/activity",
    incoming: false,
  },
  {
    id: "market",
    who: "Market data · 24 agents paid you",
    amount: "+$1.20",
    meta: "This month",
    status: "Settled",
    href: "/activity",
    incoming: true,
  },
] as const

export default function AgentsPage() {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [draft, setDraft] = useState("")
  const [paused, setPaused] = useState(false)

  const pct = Math.round((agents.budgetUsed / agents.budgetMax) * 100)

  function send(e: FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    setMessages((prev) => {
      const id = prev.length + 1
      return [
        ...prev,
        { id, from: "me", text },
        {
          id: id + 1,
          from: "us",
          text: "I can get that ready for you. A person always confirms it before anything moves.",
        },
      ]
    })
    setDraft("")
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="sx-h heading-2">Agents</h1>
          <p className="body-s muted" style={{ margin: 0 }}>
            Ask about your money, let an agent pay for small things inside a budget, and charge
            other agents for your data. Every agent payment shows up in Activity.
          </p>
        </div>
      </header>

      <div className="grid">
        <section className="tile s7 r2" aria-labelledby="ask">
          <div className="tile-head">
            <h2 className="tile-title" id="ask">
              Ask Sancus
            </h2>
            <button
              type="button"
              className="sx-btn sx-btn--quiet"
              onClick={() => setMessages([])}
            >
              New chat
            </button>
          </div>
          <div
            style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}
            role="log"
            aria-live="polite"
          >
            {messages.length === 0 ? (
              <div className="empty">Ask about payments, spending or bills.</div>
            ) : null}
            {messages.map((m) =>
              m.from === "me" ? (
                <span key={m.id} className="bubble bubble--me">
                  {m.text}
                </span>
              ) : (
                <div key={m.id} className="bubble bubble--us" style={{ display: "grid", gap: 8 }}>
                  <span>{m.text}</span>
                  {m.link ? (
                    <Link
                      href={m.link.href}
                      className="sx-btn sx-btn--secondary sx-btn--sm"
                      style={{ justifySelf: "start" }}
                    >
                      {m.link.label}
                    </Link>
                  ) : null}
                </div>
              ),
            )}
          </div>
          <form className="tile-foot" style={{ flexWrap: "nowrap" }} onSubmit={send}>
            <label style={{ flex: 1 }}>
              <span className="vh">Message</span>
              <input
                className="sx-field__input"
                placeholder="Ask about payments, spending or bills"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
            </label>
            <button type="submit" className="sx-btn sx-btn--primary">
              Ask
            </button>
          </form>
          <span className="body-s muted">
            The assistant can get payments ready. A person always confirms them.
          </span>
        </section>

        <section className="tile s5" aria-labelledby="pa">
          <div className="tile-head">
            <h2 className="tile-title" id="pa">
              Payments agent
            </h2>
            <span className="body-s muted">{paused ? "Paused" : "On"}</span>
          </div>
          <div className="kv">
            <span>Spent this week</span>
            <span>{agents.budgetLabel}</span>
          </div>
          <div
            className="meter meter--held"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${pct}% of weekly budget used`}
          >
            <i style={{ width: `${pct}%` }} />
          </div>
          <span className="body-s">
            Your payments agent wants to spend $40.00 on crop imagery. That&apos;s over its $50
            limit for the week. <Link href="/activity/approvals">Want to approve this one?</Link>
          </span>
          <div className="tile-foot">
            <span className="body-s muted">{agents.resets}</span>
            <span style={{ display: "flex", gap: 6 }}>
              <button type="button" className="sx-btn sx-btn--secondary sx-btn--sm">
                Budget
              </button>
              <button
                type="button"
                className="sx-btn sx-btn--secondary sx-btn--sm"
                onClick={() => setPaused((p) => !p)}
              >
                {paused ? "Resume" : "Pause"}
              </button>
            </span>
          </div>
        </section>

        <X402Earnings />

        <section className="tile s12" aria-labelledby="ap">
          <div className="tile-head">
            <h2 className="tile-title" id="ap">
              Agent payments
            </h2>
            <Link href="/activity" className="sx-btn sx-btn--quiet">
              See all
            </Link>
          </div>
          <div className="sx-rows">
            {agentPayments.map((p) => (
              <Link key={p.id} href={p.href} className="sx-row">
                <span className="sx-row__who">{p.who}</span>
                <span className={`sx-row__amount${p.incoming ? " sx-row__amount--in" : ""}`}>
                  {p.amount}
                </span>
                <span className="sx-row__meta">
                  <span className="sx-rail">Agent</span>
                  {p.meta}
                </span>
                <span className="sx-row__status">
                  <span
                    className={`sx-pill ${p.status === "Pending" ? "sx-pill--pending" : "sx-pill--settled"}`}
                  >
                    {p.status}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
