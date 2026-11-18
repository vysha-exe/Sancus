"use client"

import Link from "next/link"
import { useEffect, useState, type FormEvent } from "react"
import { agents } from "@/lib/sancus/demo-data"
import { X402Earnings } from "@/components/sancus-ui/x402-earnings"

type Mode = "chat" | "voice"

type Message =
  | { id: number; from: "me"; text: string }
  | { id: number; from: "us"; text?: string; link?: { href: string; label: string }; flow?: boolean }

const IconChat = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
  </svg>
)

const IconMic = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
)

const IconStar = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
  </svg>
)

const IconCheck = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12l4 4 10-10" />
  </svg>
)

const IconSend = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
)

const IconMicLg = () => (
  <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
)

const IconMute = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3M3 3l18 18" />
  </svg>
)

const IconEnd = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)

const SUGGESTIONS = ["What's due this week?", "Spending by branch", "Make this a weekly report"] as const

const initialMessages: Message[] = [
  { id: 1, from: "me", text: "Which payments need approval?" },
  {
    id: 2,
    from: "us",
    text: "Three are waiting, $2,620.05 together. The oldest is Ana's R$ 3.200,00 to Gráfica Aurora. It's over her $500 limit.",
    link: { href: "/activity/approvals", label: "Open Approvals" },
  },
  { id: 3, from: "me", text: "Get both bills ready for next week" },
  { id: 4, from: "us", flow: true },
]

export default function AgentsPage() {
  const [mode, setMode] = useState<Mode>("chat")
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [draft, setDraft] = useState("")
  const [paused, setPaused] = useState(false)
  const [flowStopped, setFlowStopped] = useState(false)
  const [muted, setMuted] = useState(false)
  const [voiceSecs, setVoiceSecs] = useState(14)

  const pct = Math.round((agents.budgetUsed / agents.budgetMax) * 100)

  useEffect(() => {
    if (mode !== "voice" || muted) return
    const t = setInterval(() => setVoiceSecs((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [mode, muted])

  function fmtVoice(secs: number) {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${s.toString().padStart(2, "0")}`
  }

  function sendText(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    setMessages((prev) => {
      const id = prev.length + 1
      return [
        ...prev,
        { id, from: "me", text: trimmed },
        {
          id: id + 1,
          from: "us",
          text: "I can get that ready for you. A person always confirms it before anything moves.",
        },
      ]
    })
    setDraft("")
  }

  function send(e: FormEvent) {
    e.preventDefault()
    sendText(draft)
  }

  function startVoice() {
    setMode("voice")
    setMuted(false)
    setVoiceSecs(0)
  }

  function endVoice() {
    setMode("chat")
    setMuted(false)
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="sx-h heading-2">Agents</h1>
          <p className="body-s muted" style={{ margin: 0 }}>
            Ask about your money or let an agent handle small payments inside a budget.
          </p>
        </div>
        <Link href="/activity" className="sx-btn sx-btn--secondary sx-btn--sm">
          Agent activity
        </Link>
      </header>

      <section className="ag" aria-label="Ask Sancus">
        <div className="ag-top">
          <div className="ag-seg" role="group" aria-label="Mode">
            <button type="button" aria-pressed={mode === "chat"} onClick={() => setMode("chat")}>
              <IconChat />
              Chat
            </button>
            <button type="button" aria-pressed={mode === "voice"} onClick={startVoice}>
              <IconMic />
              Voice
            </button>
          </div>
          <button type="button" className="sx-btn sx-btn--quiet" onClick={() => { setMessages([]); setFlowStopped(false) }}>
            New chat
          </button>
        </div>

        <div className={`ag-pane pane-chat${mode === "chat" ? " is-on" : ""}`}>
          <div className="ag-thread" role="log" aria-live="polite">
            {messages.length === 0 ? <div className="empty">Ask about payments, spending or bills.</div> : null}
            {messages.map((m) =>
              m.from === "me" ? (
                <div key={m.id} className="ag-me">
                  {m.text}
                </div>
              ) : (
                <div key={m.id} className="ag-us">
                  <span className="ag-av">
                    <IconStar />
                  </span>
                  <div className="ag-body">
                    {m.flow && !flowStopped ? (
                      <div className="ag-flow" role="status" aria-label="Agent progress">
                        <div className="ag-flow-h">
                          <b>Getting 2 bills ready</b>
                          <span className="ag-live">
                            <i aria-hidden="true" />
                            Working
                          </span>
                        </div>
                        <ol className="ag-flow-steps">
                          <li className="ok">
                            <span className="ag-dot">
                              <IconCheck />
                            </span>
                            <span className="ag-st">
                              Found the bills
                              <small>Torrefação Lisboa TL-118 · Café Oaxaca CO-2291</small>
                            </span>
                            <span className="ag-tm">0.8s</span>
                          </li>
                          <li className="ok">
                            <span className="ag-dot">
                              <IconCheck />
                            </span>
                            <span className="ag-st">
                              Read amounts and bank details
                              <small>€ 1.840,00 · MX$ 18,500.00 · 2 fields to check</small>
                            </span>
                            <span className="ag-tm">2.1s</span>
                          </li>
                          <li className="ok">
                            <span className="ag-dot">
                              <IconCheck />
                            </span>
                            <span className="ag-st">
                              Checked your balance
                              <small>$3,003.68 due · $6,390.34 available</small>
                            </span>
                            <span className="ag-tm">0.5s</span>
                          </li>
                          <li className="run">
                            <span className="ag-dot" />
                            <span className="ag-st">
                              Drafting payments
                              <small>Torrefação Lisboa · € 1.840,00 by SEPA</small>
                            </span>
                            <span className="ag-tm">…</span>
                          </li>
                          <li className="todo">
                            <span className="ag-dot" />
                            <span className="ag-st">Ready for your review</span>
                            <span className="ag-tm" />
                          </li>
                        </ol>
                        <div className="ag-flow-f">
                          <span className="body-s muted">Nothing is sent until you confirm</span>
                          <button type="button" className="sx-btn sx-btn--quiet" onClick={() => setFlowStopped(true)}>
                            Stop
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {m.flow && flowStopped ? (
                      <span>Stopped. Nothing was sent. You can ask again anytime.</span>
                    ) : null}
                    {m.text ? <span>{m.text}</span> : null}
                    {m.link ? (
                      <div className="ag-acts">
                        <Link href={m.link.href} className="sx-btn sx-btn--secondary sx-btn--sm">
                          {m.link.label}
                        </Link>
                      </div>
                    ) : null}
                  </div>
                </div>
              ),
            )}
          </div>

          <div className="ag-sugg">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="chip" onClick={() => sendText(s)}>
                {s}
              </button>
            ))}
          </div>

          <form className="ag-comp" onSubmit={send}>
            <label style={{ flex: 1, display: "flex" }}>
              <span className="vh">Message</span>
              <input
                placeholder="Ask about payments, spending or bills"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
            </label>
            <button type="button" className="ag-rb" aria-label="Switch to voice" onClick={startVoice}>
              <IconMic />
            </button>
            <button type="submit" className="ag-rb ag-rb--go" aria-label="Send">
              <IconSend />
            </button>
          </form>
        </div>

        <div className={`ag-pane pane-voice${mode === "voice" ? " is-on" : ""}`}>
          <div className="ag-vc">
            <span className="ag-live">
              <i aria-hidden="true" />
              {muted ? "Muted" : "Listening"} · {fmtVoice(voiceSecs)}
            </span>
            <div className="ag-orb">
              <b>
                <IconMicLg />
              </b>
            </div>
            <div className="ag-vctl">
              <button type="button" className="ag-cb" aria-label={muted ? "Unmute" : "Mute"} onClick={() => setMuted((m) => !m)}>
                <IconMute />
              </button>
              <button type="button" className="ag-cb ag-cb--end" onClick={endVoice}>
                <IconEnd />
                End
              </button>
              <button type="button" className="ag-cb" aria-label="Switch to chat" onClick={() => setMode("chat")}>
                <IconChat />
              </button>
            </div>
          </div>
          <div className="ag-vnote">
            <span className="body-s muted">Payments still need a tap to confirm</span>
          </div>
        </div>
      </section>

      <div className="grid">
        <section className="tile s6" aria-labelledby="pa">
          <div className="tile-head">
            <h2 className="tile-title" id="pa">
              Payments agent
            </h2>
            <span className={`sx-pill ${paused ? "sx-pill--pending" : "sx-pill--settled"}`}>{paused ? "Paused" : "On"}</span>
          </div>
          <div className="ag-mini">
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
              Wants $40.00 for crop imagery, over its weekly limit.{" "}
              <Link href="/activity/approvals">Review</Link>
            </span>
          </div>
          <div className="tile-foot">
            <span className="body-s muted">Resets Mondays</span>
            <span style={{ display: "flex", gap: 6 }}>
              <button type="button" className="sx-btn sx-btn--secondary sx-btn--sm">
                Budget
              </button>
              <button type="button" className="sx-btn sx-btn--secondary sx-btn--sm" onClick={() => setPaused((p) => !p)}>
                {paused ? "Resume" : "Pause"}
              </button>
            </span>
          </div>
        </section>

        <X402Earnings />
      </div>
    </div>
  )
}
