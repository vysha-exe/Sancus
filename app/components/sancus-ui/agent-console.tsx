"use client"

// Agents page: tell Sancus what you want; the agent works out the steps (checking balances,
// quoting, buying live route data with x402 micropayments) and prepares anything that moves
// money as a card you confirm. Backed by /api/sancus/agent and /api/sancus/agent/execute.
//
// Voice mode (button in the header): listens with the browser's speech recognition, speaks short
// progress lines while the agent works, answers aloud (ElevenLabs when configured, otherwise the
// browser voice) and listens again. A waiting card can be confirmed or cancelled by voice.
import Link from "next/link"
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { PROGRESS, VOICE_GREETINGS } from "@/lib/sancus/agent/progress"

type Step = { tool: string; label: string; ok: boolean; costLabel?: string }
type Proposal = {
  id: string
  kind: string
  title: string
  lines: { label: string; value: string }[]
  note?: string
  [key: string]: unknown
}
type Turn =
  | { role: "user"; content: string; spoken?: boolean }
  | { role: "assistant"; content: string; steps: Step[]; proposals: Proposal[] }
type Outcome = { state: "running" | "done" | "error" | "dismissed"; text: string }
type Phase = "off" | "listening" | "thinking" | "speaking" | "paused"
type DoneEvent = { type: "done"; reply: string; steps: Step[]; proposals: Proposal[] }
type StreamEvent =
  | { type: "start"; tool: string; progress: string }
  | { type: "step"; step: Step }
  | { type: "proposal"; proposal: Proposal }
  | DoneEvent
  | { type: "error"; error: string }

type Status = {
  aiConfigured: boolean
  wallet: { configured: boolean; address: string | null; walletUsdc: string | null; gatewayUsdc: string | null; spentTodayMinor: string; dailyCapMinor: string }
  actions: { id: string; kind: "x402" | "executed"; summary: string; cost_minor: string | number; created_at: string }[]
}

// Minimal Web Speech API typing (not in TypeScript's DOM lib everywhere).
type Recognition = {
  lang: string
  interimResults: boolean
  continuous: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}
function recognitionCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const CHANGED = "sancus:agent-changed"
const usd6 = (m: string | number) => `$${(Number(m) / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
const CONFIRM_RE = /^(yes[,.!]?\s*)?(please\s+)?(confirm|confirmed|go ahead|send it|do it|approve|yes)\b/i
const CANCEL_RE = /^(no|nope|cancel|don'?t|do not|stop|never ?mind|forget it)\b/i
const EXIT_RE = /\b(exit|leave|stop|end|close)\s+voice( mode)?\b/i
/** Speech-friendly text: no bullets or line breaks. */
const forSpeech = (t: string) => t.replace(/^\s*-\s+/gm, "").replace(/\*\*/g, "").replace(/\n+/g, ". ").replace(/\.\s*\./g, ".").trim()

const SUGGESTIONS = [
  "What's due this week?",
  "How much do we have across all branches?",
  "Pay Lim Trading S$250 for invoice INV-88",
  "What did we pay out recently?",
]

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
const IconMicLg = () => (
  <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

/** POSTs to the agent in streaming mode and calls `onEvent` for each event. Returns the final result. */
async function runAgentStream(messages: { role: string; content: string }[], voice: boolean, onEvent: (e: StreamEvent) => void): Promise<DoneEvent> {
  const res = await fetch("/api/sancus/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, voice, stream: true }),
  })
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? "The agent couldn't answer")
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ""
  let done: DoneEvent | null = null
  for (;;) {
    const { value, done: end } = await reader.read()
    if (value) buf += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line) continue
      const e = JSON.parse(line) as StreamEvent
      if (e.type === "error") throw new Error(e.error)
      if (e.type === "done") done = e
      onEvent(e)
    }
    if (end) break
  }
  if (!done) throw new Error("The agent stopped before answering")
  return done
}

type AgentConsoleProps = { paused?: boolean }

export function AgentConsole({ paused = false }: AgentConsoleProps) {
  const status = useAgentStatus()
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const [liveSteps, setLiveSteps] = useState<Step[]>([])
  const [error, setError] = useState<string | null>(null)
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({})
  const logRef = useRef<HTMLDivElement>(null)

  // Voice mode
  const [phase, setPhase] = useState<Phase>("off")
  const [interim, setInterim] = useState("")
  const [voiceNote, setVoiceNote] = useState<string | null>(null)
  const [eleven, setEleven] = useState(false)
  const phaseRef = useRef<Phase>("off")
  const turnsRef = useRef<Turn[]>([])
  const outcomesRef = useRef<Record<string, Outcome>>({})
  const recRef = useRef<Recognition | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const speakChain = useRef<Promise<void>>(Promise.resolve())
  const speakGen = useRef(0)
  const listenRef = useRef<() => void>(() => {})

  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p
    setPhase(p)
  }
  useEffect(() => {
    turnsRef.current = turns
  }, [turns])
  useEffect(() => {
    outcomesRef.current = outcomes
  }, [outcomes])
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" })
  }, [turns, busy, liveSteps])
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/sancus/agent/speak", { cache: "no-store" })
        if (res.ok) setEleven(Boolean((await res.json()).elevenlabs))
      } catch {
        /* browser voice */
      }
    }, 0)
    return () => clearTimeout(t)
  }, [])

  // ---------- speaking ----------

  const stopSpeaking = useCallback(() => {
    speakGen.current++ // anything still queued is skipped
    audioRef.current?.pause()
    audioRef.current = null
    if (typeof window !== "undefined") window.speechSynthesis?.cancel()
    speakChain.current = Promise.resolve()
  }, [])

  const speakBrowser = (text: string) =>
    new Promise<void>((resolve) => {
      const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined
      if (!synth) return resolve()
      const u = new SpeechSynthesisUtterance(text)
      u.rate = 1.03
      u.onend = () => resolve()
      u.onerror = () => resolve()
      synth.speak(u)
    })

  /** Pre-recorded fixed phrases (progress lines, greetings) → object URLs, so they play instantly. */
  const phraseCache = useRef<Map<string, string>>(new Map())
  const prefetchPhrases = useCallback(async () => {
    if (!eleven) return
    const phrases = [...VOICE_GREETINGS, ...Object.values(PROGRESS).map((p) => `${p}.`)]
    await Promise.all(
      phrases
        .filter((p) => !phraseCache.current.has(p))
        .map(async (p) => {
          try {
            const res = await fetch("/api/sancus/agent/speak", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text: p }),
            })
            if (res.ok) phraseCache.current.set(p, URL.createObjectURL(await res.blob()))
          } catch {
            /* that phrase streams live instead */
          }
        })
    )
  }, [eleven])

  /** Plays an audio URL until it ends or is stopped. Resolves false if it never played. */
  const playUrl = (url: string) =>
    new Promise<boolean>((resolve) => {
      const a = new Audio(url)
      audioRef.current = a
      let started = false
      a.onplaying = () => {
        started = true
      }
      a.onended = () => resolve(true)
      a.onpause = () => resolve(true) // stopped by stopSpeaking()
      a.onerror = () => resolve(started)
      void a.play().catch(() => resolve(false))
    })

  const speakOnce = useCallback(
    async (text: string) => {
      if (phaseRef.current === "off" || !text.trim()) return
      if (eleven) {
        // Fixed phrases play from the cache.
        const cached = phraseCache.current.get(text)
        if (cached) {
          if (await playUrl(cached)) return
        } else {
          // Anything else: split into sentences so the short first one starts sooner, and start
          // downloading every sentence at once so they play back to back without gaps.
          const gen = speakGen.current
          const parts = (text.slice(0, 1400).match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text]).map((s) => s.trim()).filter(Boolean)
          const audios = parts.map((p) => {
            const a = new Audio(`/api/sancus/agent/speak?text=${encodeURIComponent(p)}`)
            a.preload = "auto"
            return a
          })
          let playedAny = false
          for (const a of audios) {
            if (gen !== speakGen.current) break // interrupted or voice mode exited
            const ok = await new Promise<boolean>((resolve) => {
              audioRef.current = a
              let started = false
              a.onplaying = () => {
                started = true
              }
              a.onended = () => resolve(true)
              a.onpause = () => resolve(true)
              a.onerror = () => resolve(started)
              void a.play().catch(() => resolve(false))
            })
            playedAny ||= ok
            if (!ok && !playedAny) break
          }
          audios.forEach((a) => a.removeAttribute("src"))
          if (playedAny) return
        }
      }
      await speakBrowser(text)
    },
    [eleven]
  )

  /**
   * Queue speech so lines never talk over each other. `interrupt` (used for the actual answer)
   * cuts off whatever is playing or queued, so a progress line never delays the reply.
   */
  const say = useCallback(
    (text: string, opts: { interrupt?: boolean } = {}) => {
      if (opts.interrupt) stopSpeaking()
      const gen = speakGen.current
      const next = speakChain.current.then(() => (gen === speakGen.current ? speakOnce(forSpeech(text)) : undefined))
      speakChain.current = next.catch(() => {})
      return next
    },
    [speakOnce, stopSpeaking]
  )

  // ---------- the agent ----------

  const ask = useCallback(
    async (text: string, spoken = false) => {
      const content = text.trim()
      if (!content || paused) return
      const next: Turn[] = [...turnsRef.current, { role: "user", content, spoken }]
      turnsRef.current = next
      setTurns(next)
      setDraft("")
      setBusy(true)
      setLiveSteps([])
      setError(null)
      const voice = phaseRef.current !== "off"
      if (voice) setPhaseBoth("thinking")
      const spokenProgress = new Set<string>()
      try {
        const done = await runAgentStream(
          next.map((t) => ({ role: t.role, content: t.content })),
          voice,
          (e) => {
            if (e.type === "step") setLiveSteps((s) => [...s, e.step])
            // Fill the silence with what it's doing (at most two short lines a turn).
            if (e.type === "start" && voice && spokenProgress.size < 2 && !spokenProgress.has(e.progress)) {
              spokenProgress.add(e.progress)
              void say(`${e.progress}.`)
            }
          }
        )
        const turn: Turn = { role: "assistant", content: done.reply, steps: done.steps ?? [], proposals: done.proposals ?? [] }
        setTurns((prev) => {
          const v = [...prev, turn]
          turnsRef.current = v
          return v
        })
        if ((done.steps ?? []).some((s) => s.costLabel)) window.dispatchEvent(new Event(CHANGED))
        if (voice) {
          setPhaseBoth("speaking")
          await say(done.reply, { interrupt: true }) // the answer cuts off any progress line
          if (phaseRef.current === "speaking") listenRef.current()
        }
      } catch (e) {
        const msg = (e as Error).message
        setError(msg)
        setTurns((prev) => {
          const v = prev.slice(0, -1)
          turnsRef.current = v
          return v
        })
        if (!spoken) setDraft(content)
        if (voice) {
          setPhaseBoth("speaking")
          await say(`Sorry, ${msg}`, { interrupt: true })
          if (phaseRef.current === "speaking") listenRef.current()
        }
      } finally {
        setBusy(false)
        setLiveSteps([])
      }
    },
    [paused, say]
  )

  const confirm = useCallback(async (p: Proposal): Promise<string> => {
    setOutcomes((o) => ({ ...o, [p.id]: { state: "running", text: "Working…" } }))
    try {
      const res = await fetch("/api/sancus/agent/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal: p }),
      })
      const body = await res.json()
      if (!res.ok || !body.ok) throw new Error(body.error ?? "That didn't go through")
      const text = body.needsApproval
        ? "Sent for approval. It moves once an approver says yes."
        : p.kind === "collection"
          ? "QR created. Find it under Receive."
          : p.kind === "limits"
            ? "Limits updated."
            : `Done. Status: ${String(body.status).replace(/_/g, " ").toLowerCase()}.`
      setOutcomes((o) => ({ ...o, [p.id]: { state: "done", text } }))
      window.dispatchEvent(new Event(CHANGED))
      return text
    } catch (e) {
      const text = (e as Error).message
      setOutcomes((o) => ({ ...o, [p.id]: { state: "error", text } }))
      return `That didn't go through. ${text}`
    }
  }, [])

  /** The one card waiting for a decision, if there is exactly one. */
  const waitingProposal = useCallback((): Proposal | null => {
    const last = [...turnsRef.current].reverse().find((t) => t.role === "assistant")
    if (!last || last.role !== "assistant") return null
    const open = last.proposals.filter((p) => !outcomesRef.current[p.id] || outcomesRef.current[p.id].state === "error")
    return open.length === 1 ? open[0]! : null
  }, [])

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
        setTurns((prev) => [...prev, { role: "user", content: text, spoken: true }])
        setPhaseBoth("thinking")
        const outcome = await confirm(waiting)
        setPhaseBoth("speaking")
        await say(outcome, { interrupt: true })
        if (phaseRef.current === "speaking") listenRef.current()
        return
      }
      if (waiting && CANCEL_RE.test(text.trim())) {
        setTurns((prev) => [...prev, { role: "user", content: text, spoken: true }])
        setOutcomes((o) => ({ ...o, [waiting.id]: { state: "dismissed", text: "Cancelled." } }))
        setPhaseBoth("speaking")
        await say("Okay, I won't do that.", { interrupt: true })
        if (phaseRef.current === "speaking") listenRef.current()
        return
      }
      await ask(text, true)
    },
    [ask, confirm, exitVoice, paused, say, waitingProposal]
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
    await say(turnsRef.current.length ? VOICE_GREETINGS[1]! : VOICE_GREETINGS[0]!)
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

  function clearChat() {
    setTurns([])
    turnsRef.current = []
    setOutcomes({})
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
                  {t.proposals.map((p) => {
                    const o = outcomes[p.id]
                    return (
                      <div key={p.id} className="ag-card">
                        <b>{p.title}</b>
                        {p.lines.map((l) => (
                          <div className="kv" key={l.label}>
                            <span className="body-s">{l.label}</span>
                            <span className="body-s">{l.value}</span>
                          </div>
                        ))}
                        {p.note ? <span className="body-s muted">{p.note}</span> : null}
                        {o?.state === "done" || o?.state === "dismissed" ? (
                          <span className="body-s" role="status">
                            {o.state === "done" ? "✓ " : ""}
                            {o.text}
                          </span>
                        ) : (
                          <div className="ag-acts">
                            <button type="button" className="sx-btn sx-btn--primary sx-btn--sm" onClick={() => void confirm(p)} disabled={paused || o?.state === "running"}>
                              {o?.state === "running" ? "Working…" : "Confirm"}
                            </button>
                            <span className="body-s muted">Nothing is sent until you confirm</span>
                            {o?.state === "error" ? (
                              <span className="body-s" role="alert" style={{ color: "var(--failed)" }}>
                                {o.text}
                              </span>
                            ) : null}
                          </div>
                        )}
                      </div>
                    )
                  })}
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
                The agent needs an Anthropic API key: add <code>ANTHROPIC_API_KEY</code> to <code>.env.local</code> and restart the app.
              </span>
            ) : null}
            {error ? (
              <span className="body-s" role="alert" style={{ color: "var(--failed)" }}>
                {error}
              </span>
            ) : null}
          </div>
        ) : null}

        {turns.length === 0 ? (
          <div className="ag-sugg" role="group" aria-label="Try one">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="chip" onClick={() => void ask(s)} disabled={busy || paused || status?.aiConfigured === false}>
                {s}
              </button>
            ))}
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
          <div className="ag-orb" data-phase={phase}>
            <button type="button" onClick={onOrb} disabled={phase === "thinking"} aria-label={phase === "paused" ? "Resume listening" : phase === "speaking" ? "Interrupt" : "Pause listening"}>
              <IconMicLg />
            </button>
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
        {recentVoice.length ? (
          <ol className="ag-vturns" aria-label="Voice transcript">
            {recentVoice.map((t, i) => (
              <li key={i} className={i === recentVoice.length - 1 && t.role === "user" ? "now" : undefined}>
                <span className="sx-label">{t.role === "user" ? "You" : "Sancus"}</span>
                <span>{t.role === "user" ? t.content : t.content}</span>
              </li>
            ))}
          </ol>
        ) : null}
        <div className="ag-vnote">
          <span className="body-s muted">Payments still need a tap to confirm · say “confirm”, “cancel”, or “exit voice”</span>
        </div>
      </div>
    </section>
  )
}

function StepList({ steps, title, running = false }: { steps: Step[]; title: string; running?: boolean }) {
  if (!steps.length && !running) return null
  return (
    <div className="ag-flow" role="status" aria-label={title}>
      <div className="ag-flow-h">
        <b>{title}</b>
        {running ? (
          <span className="ag-live">
            <i aria-hidden="true" />
            Working
          </span>
        ) : null}
      </div>
      <ol className="ag-flow-steps">
        {steps.map((s, j) => (
          <li key={j} className={s.ok ? "ok" : "todo"}>
            <span className="ag-dot">{s.ok ? <IconCheck /> : null}</span>
            <span className="ag-st">
              {s.label}
              {s.costLabel ? <small>x402 · {s.costLabel}</small> : null}
            </span>
            <span className="ag-tm" />
          </li>
        ))}
        {running ? (
          <li className="run">
            <span className="ag-dot" />
            <span className="ag-st">Working on it</span>
            <span className="ag-tm">…</span>
          </li>
        ) : null}
      </ol>
      <div className="ag-flow-f">
        <span className="body-s muted">Nothing is sent until you confirm</span>
      </div>
    </div>
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
