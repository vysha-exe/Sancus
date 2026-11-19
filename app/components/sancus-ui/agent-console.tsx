"use client"

// Agents page: tell Sancus what you want; the agent works out the steps (checking balances,
// quoting, buying live route data with x402 micropayments) and prepares anything that moves
// money as a card you confirm. Backed by /api/sancus/agent and /api/sancus/agent/execute.
//
// Voice mode (button in the header): listens with the browser's speech recognition, speaks short
// progress lines while the agent works, answers aloud (ElevenLabs when configured, otherwise the
// browser voice) and listens again. Cards to confirm and live progress show in voice mode too,
// and can be confirmed by tapping or saying "confirm". The conversation is shared with the agent
// call button on every page (see agent-shared.tsx).
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import {
  askAgent,
  CANCEL_RE,
  CHANGED,
  clearAgentChat,
  CONFIRM_RE,
  confirmProposal,
  dismissProposal,
  EXIT_RE,
  openProposals,
  ProposalCard,
  recognitionCtor,
  setChat,
  StepList,
  useAgentChat,
  useSpeaker,
  useVoiceGlow,
  VOICE_GREETINGS,
  waitingProposal,
  type Phase,
  type Proposal,
  type Recognition,
} from "@/components/sancus-ui/agent-shared"

type Status = {
  aiConfigured: boolean
  wallet: { configured: boolean; address: string | null; walletUsdc: string | null; gatewayUsdc: string | null; spentTodayMinor: string; dailyCapMinor: string }
  actions: { id: string; kind: "x402" | "executed"; summary: string; cost_minor: string | number; created_at: string }[]
}

const usd6 = (m: string | number) => `$${(Number(m) / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`

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
const IconSend = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
)
const IconEnd = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)

export function useAgentStatus() {
  const [status, setStatus] = useState<Status | null>(null)
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sancus/agent", { cache: "no-store" })
      if (res.ok) setStatus(await res.json())
    } catch {
      /* keep the last status */
    }
  }, [])
  useEffect(() => {
    const t = setTimeout(load, 0)
    window.addEventListener(CHANGED, load)
    return () => {
      clearTimeout(t)
      window.removeEventListener(CHANGED, load)
    }
  }, [load])
  return status
}

type AgentConsoleProps = { paused?: boolean }

export function AgentConsole({ paused = false }: AgentConsoleProps) {
  const router = useRouter()
  const status = useAgentStatus()
  const { turns, outcomes, busy, liveSteps } = useAgentChat()
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  // Voice mode
  const [phase, setPhase] = useState<Phase>("off")
  const [interim, setInterim] = useState("")
  const [voiceNote, setVoiceNote] = useState<string | null>(null)
  const phaseRef = useRef<Phase>("off")
  const recRef = useRef<Recognition | null>(null)
  const listenRef = useRef<() => void>(() => {})
  const { orbRef, tapOutput } = useVoiceGlow(phase)
  const isActive = useCallback(() => phaseRef.current !== "off", [])
  const { eleven, say, stopSpeaking, prefetchPhrases } = useSpeaker(isActive, { onAudio: tapOutput })

  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p
    setPhase(p)
  }
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" })
  }, [turns, busy, liveSteps])

  // ---------- the agent ----------

  const ask = useCallback(
    async (text: string, spoken = false) => {
      const content = text.trim()
      if (!content || paused) return
      setDraft("")
      setError(null)
      const voice = phaseRef.current !== "off"
      if (voice) setPhaseBoth("thinking")
      const spokenProgress = new Set<string>()
      try {
        const done = await askAgent(content, {
          spoken,
          voice,
          onEvent: (e) => {
            // Fill the silence with what it's doing (at most two short lines a turn).
            if (e.type === "start" && voice && spokenProgress.size < 2 && !spokenProgress.has(e.progress)) {
              spokenProgress.add(e.progress)
              void say(`${e.progress}.`)
            }
          },
        })
        if (voice) {
          setPhaseBoth("speaking")
          await say(done.reply, { interrupt: true }) // the answer cuts off any progress line
        }
        // "Open the scan page": go there (after it's said so, in voice mode).
        const nav = done.actions?.find((a) => a.type === "navigate")
        if (nav) router.push(nav.path)
        else if (voice && phaseRef.current === "speaking") listenRef.current()
      } catch (e) {
        const msg = (e as Error).message
        setError(msg)
        if (!spoken) setDraft(content)
        if (voice) {
          setPhaseBoth("speaking")
          await say(`Sorry, ${msg}`, { interrupt: true })
          if (phaseRef.current === "speaking") listenRef.current()
        }
      }
    },
    [paused, say, router]
  )

  // ---------- listening ----------

  const exitVoice = useCallback(() => {
    setPhaseBoth("off")
    recRef.current?.abort()
    recRef.current = null
    stopSpeaking()
    setInterim("")
  }, [stopSpeaking])

  const handleUtterance = useCallback(
    async (text: string) => {
      setInterim("")
      if (paused) return
      if (EXIT_RE.test(text)) return exitVoice()
      const waiting = waitingProposal()
      if (waiting && CONFIRM_RE.test(text.trim())) {
        setChat((s) => ({ turns: [...s.turns, { role: "user", content: text, spoken: true }] }))
        setPhaseBoth("thinking")
        void say("Sending it now.", { interrupt: true })
        const outcome = await confirmProposal(waiting)
        setPhaseBoth("speaking")
        await say(outcome, { interrupt: true })
        if (phaseRef.current === "speaking") listenRef.current()
        return
      }
      if (waiting && CANCEL_RE.test(text.trim())) {
        setChat((s) => ({ turns: [...s.turns, { role: "user", content: text, spoken: true }] }))
        dismissProposal(waiting)
        setPhaseBoth("speaking")
        await say("Okay, I won't do that.", { interrupt: true })
        if (phaseRef.current === "speaking") listenRef.current()
        return
      }
      await ask(text, true)
    },
    [ask, exitVoice, paused, say]
  )

  /** Tapping Confirm (chat or voice): in voice mode, say how it went and keep listening. */
  const onConfirm = useCallback(
    async (p: Proposal) => {
      const voice = phaseRef.current !== "off"
      if (voice) {
        recRef.current?.abort()
        recRef.current = null
        setPhaseBoth("thinking")
        void say("Sending it now.", { interrupt: true })
      }
      const outcome = await confirmProposal(p)
      if (voice && phaseRef.current !== "off") {
        setPhaseBoth("speaking")
        await say(outcome, { interrupt: true })
        if (phaseRef.current === "speaking") listenRef.current()
      }
    },
    [say]
  )

  const listen = useCallback(() => {
    const Ctor = recognitionCtor()
    if (!Ctor || phaseRef.current === "off") return
    recRef.current?.abort()
    const rec = new Ctor()
    rec.lang = "en-US"
    rec.interimResults = true
    rec.continuous = false
    let finalText = ""
    rec.onresult = (e) => {
      let interimText = ""
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!
        if (r.isFinal) finalText += r[0].transcript
        else interimText += r[0].transcript
      }
      setInterim(finalText || interimText)
    }
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setVoiceNote("Microphone access is blocked. Allow it in the address bar, then tap the mic.")
        setPhaseBoth("paused")
      }
    }
    rec.onend = () => {
      if (recRef.current !== rec) return
      recRef.current = null
      const text = finalText.trim()
      if (text) void handleUtterance(text)
      else if (phaseRef.current === "listening") listenRef.current() // nothing heard: keep listening
    }
    recRef.current = rec
    setPhaseBoth("listening")
    try {
      rec.start()
    } catch {
      /* already started */
    }
  }, [handleUtterance])

  useEffect(() => {
    listenRef.current = listen
  }, [listen])

  useEffect(() => () => exitVoice(), [exitVoice])
  useEffect(() => {
    if (!paused) return
    const timer = window.setTimeout(() => exitVoice(), 0)
    return () => window.clearTimeout(timer)
  }, [paused, exitVoice])

  async function enterVoice() {
    if (paused) return
    setVoiceNote(recognitionCtor() ? null : "This browser can't listen (use Chrome or Edge). You can still type, and replies will be spoken.")
    setPhaseBoth("speaking")
    void prefetchPhrases() // record progress lines now so they play instantly later
    await say(turns.length ? VOICE_GREETINGS[1]! : VOICE_GREETINGS[0]!)
    if (phaseRef.current !== "off") {
      if (recognitionCtor()) listenRef.current()
      else setPhaseBoth("paused")
    }
  }

  /** The big mic button: interrupt speech, pause listening, or resume. */
  function onOrb() {
    if (phase === "speaking") {
      stopSpeaking()
      listen()
    } else if (phase === "listening") {
      recRef.current?.abort()
      recRef.current = null
      setPhaseBoth("paused")
      setInterim("")
    } else if (phase === "paused") {
      listen()
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (phase !== "off" && waitingProposal() && (CONFIRM_RE.test(draft.trim()) || CANCEL_RE.test(draft.trim()))) {
      const t = draft
      setDraft("")
      void handleUtterance(t)
      return
    }
    void ask(draft)
  }

  const voiceOn = phase !== "off"
  const phaseLabel = { off: "", listening: "Listening", thinking: "Working", speaking: "Speaking", paused: "Paused" }[phase]
  const recentVoice = turns.slice(-4)
  const voiceCards = openProposals({ turns, outcomes })

  function clearChat() {
    clearAgentChat()
    setError(null)
  }

  function switchToChat() {
    if (voiceOn) exitVoice()
  }

  function switchToVoice() {
    if (!voiceOn) void enterVoice()
  }

  return (
    <section className="ag" aria-label="Ask Sancus">
      <div className="ag-top">
        <div className="ag-seg" role="group" aria-label="Mode">
          <button type="button" aria-pressed={!voiceOn} onClick={switchToChat}>
            <IconChat />
            Chat
          </button>
          <button type="button" aria-pressed={voiceOn} onClick={switchToVoice} disabled={status?.aiConfigured === false || paused}>
            <IconMic />
            Voice
          </button>
        </div>
        <button type="button" className="sx-btn sx-btn--quiet" onClick={clearChat} disabled={busy}>
          New chat
        </button>
      </div>

      <div className={`ag-pane pane-chat${!voiceOn ? " is-on" : ""}`}>
        <div ref={logRef} className="ag-thread" role="log" aria-live="polite">
          {turns.length === 0 ? <div className="empty">Ask about payments, spending or bills.</div> : null}

          {turns.map((t, i) =>
            t.role === "user" ? (
              <div key={i} className="ag-me">
                {t.content}
              </div>
            ) : (
              <div key={i} className="ag-us">
                <span className="ag-av">
                  <IconStar />
                </span>
                <div className="ag-body">
                  {t.steps.length ? <StepList steps={t.steps} title="What it did" /> : null}
                  <span style={{ whiteSpace: "pre-wrap" }}>{t.content}</span>
                  {t.proposals.map((p) => (
                    <ProposalCard key={p.id} p={p} outcome={outcomes[p.id]} disabled={paused} onConfirm={(x) => void onConfirm(x)} />
                  ))}
                </div>
              </div>
            ),
          )}

          {busy ? (
            <div className="ag-us">
              <span className="ag-av">
                <IconStar />
              </span>
              <div className="ag-body">
                <StepList steps={liveSteps} title="Working on it" running />
              </div>
            </div>
          ) : null}
        </div>

        {paused || status?.aiConfigured === false || error ? (
          <div className="ag-status">
            {paused ? (
              <span className="body-s" role="status">
                Agent is paused. Resume from the Payments agent card below to send messages or use voice.
              </span>
            ) : null}
            {status?.aiConfigured === false ? (
              <span className="body-s" role="alert">
                The agent needs an OpenAI API key: add <code>OPENAI_API_KEY</code> to <code>.env.local</code> and restart the app.
              </span>
            ) : null}
            {error ? (
              <span className="body-s" role="alert" style={{ color: "var(--failed)" }}>
                {error}
              </span>
            ) : null}
          </div>
        ) : null}

        <form className="ag-comp" onSubmit={submit}>
          <label style={{ flex: 1, display: "flex" }}>
            <span className="vh">Message</span>
            <input
              id="agent-input"
              placeholder="Ask about payments, spending or bills"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={busy || paused}
            />
          </label>
          <button type="button" className="ag-rb" aria-label="Switch to voice" onClick={switchToVoice} disabled={status?.aiConfigured === false || paused}>
            <IconMic />
          </button>
          <button type="submit" className="ag-rb ag-rb--go" aria-label="Send" disabled={busy || paused || !draft.trim()}>
            <IconSend />
          </button>
        </form>
      </div>

      <div className={`ag-pane pane-voice${voiceOn ? " is-on" : ""}`}>
        <div className="ag-vc">
          <span className="ag-live">
            <i aria-hidden="true" />
            {phaseLabel}
            {eleven ? " · ElevenLabs" : ""}
          </span>
          <div ref={orbRef} className="ag-orb" data-phase={phase} style={{ ["--ag-level" as string]: 0 }}>
            <span className="ag-blob" aria-hidden="true" />
            <button
              type="button"
              className="ag-orb-hit"
              onClick={onOrb}
              disabled={phase === "thinking"}
              aria-label={phase === "paused" ? "Resume listening" : phase === "speaking" ? "Interrupt" : "Pause listening"}
            />
          </div>
          {interim ? (
            <span className="body-s" style={{ fontStyle: "italic" }}>
              “{interim}”
            </span>
          ) : null}
          {voiceNote ? (
            <span className="body-s" role="alert">
              {voiceNote}
            </span>
          ) : null}
          <div className="ag-vctl">
            <button type="button" className="ag-cb" aria-label={phase === "paused" ? "Resume" : "Pause"} onClick={onOrb} disabled={phase === "thinking"}>
              <IconMic />
            </button>
            <button type="button" className="ag-cb ag-cb--end" onClick={exitVoice}>
              <IconEnd />
              End
            </button>
            <button type="button" className="ag-cb" aria-label="Switch to chat" onClick={switchToChat}>
              <IconChat />
            </button>
          </div>
        </div>
        {busy ? (
          <div style={{ padding: "0 16px" }}>
            <StepList steps={liveSteps} title="Working on it" running />
          </div>
        ) : null}
        {voiceCards.length ? (
          <div style={{ display: "grid", gap: 10, padding: "0 16px" }} aria-label="Waiting for you">
            {voiceCards.map((p) => (
              <ProposalCard
                key={p.id}
                p={p}
                outcome={outcomes[p.id]}
                disabled={paused}
                onConfirm={(x) => void onConfirm(x)}
                onCancel={(x) => dismissProposal(x)}
              />
            ))}
          </div>
        ) : null}
        {recentVoice.length ? (
          <ol className="ag-vturns" aria-label="Voice transcript">
            {recentVoice.map((t, i) => (
              <li key={i} className={i === recentVoice.length - 1 && t.role === "user" ? "now" : undefined}>
                <span className="sx-label">{t.role === "user" ? "You" : "Sancus"}</span>
                <span>{t.content}</span>
              </li>
            ))}
          </ol>
        ) : null}
        <div className="ag-vnote">
          <span className="body-s muted">Tap Confirm or say “confirm” to send · “cancel” to drop it · “exit voice” to stop</span>
        </div>
      </div>
    </section>
  )
}

/** The agent's own x402 wallet: balance, today's data spend against its cap. */
export function AgentWalletTile() {
  const status = useAgentStatus()
  const w = status?.wallet
  const spent = Number(w?.spentTodayMinor ?? 0)
  const cap = Number(w?.dailyCapMinor ?? 1)
  const pct = Math.min(100, Math.round((spent / cap) * 100))
  return (
    <section className="tile s5" aria-labelledby="pa">
      <div className="tile-head">
        <h2 className="tile-title" id="pa">
          Agent wallet
        </h2>
        <span className="body-s muted">x402 · Arc</span>
      </div>
      {!w ? (
        <div className="empty">Loading…</div>
      ) : !w.configured ? (
        <span className="body-s">
          The agent has no wallet yet, so it can&apos;t buy data. Run <code>node scripts/x402-buyer.mjs --generate</code> and fund the
          address with testnet USDC.
        </span>
      ) : (
        <>
          <div className="kv">
            <span>Spent on data today</span>
            <span>
              {usd6(spent)} of {usd6(cap)}
            </span>
          </div>
          <div className="meter meter--held" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pct}% of the daily budget used`}>
            <i style={{ width: `${pct}%` }} />
          </div>
          <div className="kv">
            <span>Gateway balance</span>
            <span>{w.gatewayUsdc ?? "–"} USDC</span>
          </div>
          <div className="kv">
            <span>Wallet</span>
            <span className="data">{w.address ? `${w.address.slice(0, 6)}…${w.address.slice(-4)}` : "–"}</span>
          </div>
          <span className="body-s muted">The agent pays per call (about $0.01) for live route quotes, gasless through Circle Gateway, and stops at its daily cap.</span>
        </>
      )}
    </section>
  )
}

/** What the agent did: micropayments it made and actions people confirmed. */
export function AgentActivity() {
  const status = useAgentStatus()
  const actions = status?.actions ?? []
  return (
    <section className="tile s12" aria-labelledby="ap">
      <div className="tile-head">
        <h2 className="tile-title" id="ap">
          Agent payments
        </h2>
        <Link href="/activity" className="sx-btn sx-btn--quiet">
          See all
        </Link>
      </div>
      {actions.length ? (
        <div className="sx-rows">
          {actions.map((a) => (
            <div key={a.id} className="sx-row">
              <span className="sx-row__who">{a.summary}</span>
              <span className="sx-row__amount">{a.kind === "x402" ? `−${usd6(a.cost_minor)}` : ""}</span>
              <span className="sx-row__meta">
                <span className="sx-rail">{a.kind === "x402" ? "x402" : "Agent"}</span> {new Date(a.created_at).toLocaleString()}
              </span>
              <span className="sx-row__status">
                <span className="sx-pill sx-pill--settled">{a.kind === "x402" ? "Paid" : "Confirmed"}</span>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">Nothing yet. Ask the agent to do something above.</div>
      )}
    </section>
  )
}
