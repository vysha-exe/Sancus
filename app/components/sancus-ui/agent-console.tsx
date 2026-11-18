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
  "How much do we have across all branches?",
  "What's the cheapest way to send 5,000 SGD to Singapore right now?",
  "Pay Lim Trading S$250 for invoice INV-88",
  "Collect 500 baht from a customer in Bangkok",
  "What did we pay out recently?",
]

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
  const orbLabel = { off: "", listening: "Listening… tap to pause", thinking: "Working on it…", speaking: "Speaking… tap to interrupt", paused: "Paused · tap to listen" }[phase]

  return (
    <section className="tile s7 r2" aria-labelledby="ask">
      <div className="tile-head">
        <h2 className="tile-title" id="ask">
          Ask Sancus to do it
        </h2>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            className={`sx-btn sx-btn--sm ${voiceOn ? "sx-btn--primary" : "sx-btn--secondary"}`}
            aria-pressed={voiceOn}
            onClick={() => (voiceOn ? exitVoice() : void enterVoice())}
            disabled={status?.aiConfigured === false || paused}
          >
            {voiceOn ? "Exit voice mode" : "🎙 Voice mode"}
          </button>
          <button
            type="button"
            className="sx-btn sx-btn--quiet sx-btn--sm"
            onClick={() => {
              setTurns([])
              turnsRef.current = []
              setOutcomes({})
              setError(null)
            }}
            disabled={busy}
          >
            New chat
          </button>
        </div>
      </div>

      {voiceOn ? (
        <div style={{ display: "grid", justifyItems: "center", gap: 8, padding: "12px 0" }} aria-live="polite">
          <button
            type="button"
            onClick={onOrb}
            disabled={phase === "thinking"}
            aria-label={orbLabel}
            style={{
              width: 88,
              height: 88,
              borderRadius: "50%",
              border: "none",
              cursor: phase === "thinking" ? "default" : "pointer",
              fontSize: 34,
              color: "#fff",
              background: phase === "listening" ? "var(--accent, #1f7a4d)" : phase === "speaking" ? "#3b6fd8" : phase === "thinking" ? "#8a8f98" : "#5c6470",
              boxShadow: phase === "listening" ? "0 0 0 10px color-mix(in srgb, var(--accent, #1f7a4d) 22%, transparent)" : "0 4px 14px rgba(0,0,0,.18)",
              transition: "box-shadow .3s, background .3s",
            }}
          >
            {phase === "speaking" ? "🔊" : phase === "thinking" ? "…" : "🎙"}
          </button>
          <span className="body-s muted">{orbLabel}</span>
          {interim ? <span className="body-s" style={{ fontStyle: "italic" }}>“{interim}”</span> : null}
          <span className="body-s muted">
            Voice: {eleven ? "ElevenLabs" : "browser"} · say “confirm” or “cancel” for a waiting card · “exit voice” to stop
          </span>
          {voiceNote ? (
            <span className="body-s" role="alert">
              {voiceNote}
            </span>
          ) : null}
        </div>
      ) : null}

      <div ref={logRef} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", maxHeight: voiceOn ? 360 : 520 }} role="log" aria-live="polite">
        {turns.length === 0 && !voiceOn ? (
          <div style={{ display: "grid", gap: 10 }}>
            <span className="body-s muted">
              Say what you want done. The agent checks balances, gets live quotes, buys route data for a cent when it helps, and
              prepares payments for you to confirm. Or press Voice mode and just talk.
            </span>
            <div className="filters" role="group" aria-label="Try one">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="chip" onClick={() => void ask(s)} disabled={busy || paused || status?.aiConfigured === false}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {turns.map((t, i) =>
          t.role === "user" ? (
            <span key={i} className="bubble bubble--me">
              {t.spoken ? "🎙 " : ""}
              {t.content}
            </span>
          ) : (
            <div key={i} className="bubble bubble--us" style={{ display: "grid", gap: 10 }}>
              {t.steps.length ? <StepList steps={t.steps} /> : null}
              <span style={{ whiteSpace: "pre-wrap" }}>{t.content}</span>
              {t.proposals.map((p) => {
                const o = outcomes[p.id]
                return (
                  <div key={p.id} style={{ display: "grid", gap: 6, padding: 12, border: "1px solid var(--line)", borderRadius: 10 }}>
                    <span className="body-strong">{p.title}</span>
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
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <button type="button" className="sx-btn sx-btn--primary sx-btn--sm" onClick={() => void confirm(p)} disabled={paused || o?.state === "running"}>
                          {o?.state === "running" ? "Working…" : "Confirm"}
                        </button>
                        <span className="body-s muted">Nothing happens until you confirm.</span>
                        {o?.state === "error" ? (
                          <span className="body-s" role="alert" style={{ color: "var(--danger, #c0392b)" }}>
                            {o.text}
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ),
        )}
        {busy ? (
          <div className="bubble bubble--us" style={{ display: "grid", gap: 6 }}>
            {liveSteps.length ? <StepList steps={liveSteps} /> : null}
            <span className="body-s muted">Working on it…</span>
          </div>
        ) : null}
      </div>

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
        <span className="body-s" role="alert" style={{ color: "var(--danger, #c0392b)" }}>
          {error}
        </span>
      ) : null}

      <form className="tile-foot" style={{ flexWrap: "nowrap" }} onSubmit={submit}>
        <label style={{ flex: 1 }}>
          <span className="vh">What do you want done?</span>
          <input
            id="agent-input"
            className="sx-field__input"
            placeholder={voiceOn ? "Or type here" : "e.g. Pay Tan Logistics S$120 by PayNow"}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={busy || paused}
          />
        </label>
        <button type="submit" className="sx-btn sx-btn--primary" disabled={busy || paused || !draft.trim()}>
          {busy ? "Working…" : "Go"}
        </button>
      </form>
      <span className="body-s muted">Payments, collections and limit changes always wait for your Confirm.</span>
    </section>
  )
}

function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 4 }} aria-label="What the agent did">
      {steps.map((s, j) => (
        <li key={j} className="body-s muted" style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
          <span>
            {s.ok ? "✓" : "✗"} {s.label}
          </span>
          {s.costLabel ? <span className="sx-pill sx-pill--pending">x402 · {s.costLabel}</span> : null}
        </li>
      ))}
    </ol>
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
          Agent activity
        </h2>
        <Link href="/activity" className="sx-btn sx-btn--quiet">
          All activity
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
