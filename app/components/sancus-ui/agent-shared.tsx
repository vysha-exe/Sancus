"use client"

// Shared by the Agents page console and the agent call button on every tab:
//   - one conversation (turns, card outcomes, live progress) kept for the browser session, so
//     whatever you say on a call shows up in the Agents chat and the other way round
//   - streaming calls to /api/sancus/agent, confirming cards via /api/sancus/agent/execute
//   - speech out (ElevenLabs when configured, else the browser voice) and speech-in helpers
//   - the confirm card and the "what it did" step list
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { PROGRESS, VOICE_GREETINGS } from "@/lib/sancus/agent/progress"

export type Step = { tool: string; label: string; ok: boolean; costLabel?: string }
export type Proposal = {
  id: string
  kind: string
  title: string
  lines: { label: string; value: string }[]
  note?: string
  [key: string]: unknown
}
export type AgentAction = { type: "navigate"; path: string; label: string }
export type Turn =
  | { role: "user"; content: string; spoken?: boolean }
  | { role: "assistant"; content: string; steps: Step[]; proposals: Proposal[] }
export type Outcome = { state: "running" | "done" | "error" | "dismissed"; text: string }
export type Phase = "off" | "listening" | "thinking" | "speaking" | "paused"
export type DoneEvent = { type: "done"; reply: string; steps: Step[]; proposals: Proposal[]; actions?: AgentAction[] }
export type StreamEvent =
  | { type: "start"; tool: string; progress: string }
  | { type: "step"; step: Step }
  | { type: "proposal"; proposal: Proposal }
  | { type: "action"; action: AgentAction }
  | DoneEvent
  | { type: "error"; error: string }
export type PageContext = { path: string; title?: string; text?: string }

export const CHANGED = "sancus:agent-changed"
export const CONFIRM_RE = /^(yes[,.!]?\s*)?(please\s+)?(confirm|confirmed|go ahead|send it|do it|approve|yes)\b/i
export const CANCEL_RE = /^(no|nope|cancel|don'?t|do not|stop|never ?mind|forget it)\b/i
export const EXIT_RE = /\b(exit|leave|stop|end|close)\s+(voice( mode)?|the call|call)\b|^(hang up|goodbye|bye)\b/i
/** Speech-friendly text: no bullets or line breaks. */
export const forSpeech = (t: string) => t.replace(/^\s*-\s+/gm, "").replace(/\*\*/g, "").replace(/\n+/g, ". ").replace(/\.\s*\./g, ".").trim()

// ---------- the shared conversation ----------

export type ChatState = { turns: Turn[]; outcomes: Record<string, Outcome>; busy: boolean; liveSteps: Step[] }
const KEY = "sancus:agent-chat"
const EMPTY: ChatState = { turns: [], outcomes: {}, busy: false, liveSteps: [] }
let chat: ChatState = EMPTY
let loaded = false
const listeners = new Set<() => void>()

function loadOnce() {
  if (loaded || typeof window === "undefined") return
  loaded = true
  try {
    const raw = sessionStorage.getItem(KEY)
    if (raw) {
      const saved = JSON.parse(raw) as Partial<ChatState>
      chat = { ...EMPTY, turns: saved.turns ?? [], outcomes: saved.outcomes ?? {} }
    }
  } catch {
    /* fresh chat */
  }
}

export function getChat(): ChatState {
  loadOnce()
  return chat
}

export function setChat(update: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>)) {
  const cur = getChat()
  chat = { ...cur, ...(typeof update === "function" ? update(cur) : update) }
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ turns: chat.turns, outcomes: chat.outcomes }))
  } catch {
    /* private mode: keep it in memory */
  }
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useAgentChat(): ChatState {
  return useSyncExternalStore(subscribe, getChat, () => EMPTY)
}

/** The one card still waiting for a decision in the latest answer, if there is exactly one. */
export function waitingProposal(): Proposal | null {
  const { turns, outcomes } = getChat()
  const last = [...turns].reverse().find((t) => t.role === "assistant")
  if (!last || last.role !== "assistant") return null
  const open = last.proposals.filter((p) => !outcomes[p.id] || outcomes[p.id]!.state === "error")
  return open.length === 1 ? open[0]! : null
}

const setOutcome = (id: string, o: Outcome) => setChat((s) => ({ outcomes: { ...s.outcomes, [id]: o } }))

/** Runs a confirmed card. Returns a sentence to show or say. */
export async function confirmProposal(p: Proposal): Promise<string> {
  setOutcome(p.id, { state: "running", text: "Working…" })
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
    setOutcome(p.id, { state: "done", text })
    window.dispatchEvent(new Event(CHANGED))
    return text
  } catch (e) {
    const text = (e as Error).message
    setOutcome(p.id, { state: "error", text })
    return `That didn't go through. ${text}`
  }
}

export function dismissProposal(p: Proposal) {
  setOutcome(p.id, { state: "dismissed", text: "Cancelled." })
}

/** POSTs to the agent in streaming mode and calls `onEvent` for each event. Returns the final result. */
export async function runAgentStream(
  messages: { role: string; content: string }[],
  voice: boolean,
  onEvent: (e: StreamEvent) => void,
  page?: PageContext
): Promise<DoneEvent> {
  const res = await fetch("/api/sancus/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: messages.slice(-30), voice, stream: true, page }),
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

/**
 * Sends one message as part of the shared conversation: records your turn, streams progress into
 * the shared state (so every open view shows "working"), records the answer.
 */
export async function askAgent(
  content: string,
  opts: { spoken?: boolean; voice?: boolean; page?: PageContext; onEvent?: (e: StreamEvent) => void }
): Promise<DoneEvent> {
  const next: Turn[] = [...getChat().turns, { role: "user", content, spoken: opts.spoken }]
  setChat({ turns: next, busy: true, liveSteps: [] })
  try {
    const done = await runAgentStream(
      next.map((t) => ({ role: t.role, content: t.content })),
      Boolean(opts.voice),
      (e) => {
        if (e.type === "step") setChat((s) => ({ liveSteps: [...s.liveSteps, e.step] }))
        opts.onEvent?.(e)
      },
      opts.page
    )
    const turn: Turn = { role: "assistant", content: done.reply, steps: done.steps ?? [], proposals: done.proposals ?? [] }
    setChat((s) => ({ turns: [...s.turns, turn] }))
    if ((done.steps ?? []).some((s) => s.costLabel)) window.dispatchEvent(new Event(CHANGED))
    return done
  } catch (e) {
    setChat((s) => ({ turns: s.turns.slice(0, -1) }))
    throw e
  } finally {
    setChat({ busy: false, liveSteps: [] })
  }
}

export function clearAgentChat() {
  setChat({ turns: [], outcomes: {}, busy: false, liveSteps: [] })
}

/** What's on screen right now, for questions like "what am I looking at?". */
export function currentPageContext(): PageContext {
  const main = document.querySelector("main") ?? document.body
  const text = (main as HTMLElement).innerText.replace(/\n{3,}/g, "\n\n").trim().slice(0, 5000)
  return { path: window.location.pathname, title: document.querySelector("h1")?.textContent?.trim() || document.title, text }
}

// ---------- speech in ----------

export type Recognition = {
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
export function recognitionCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

// ---------- speech out ----------

/**
 * Speaking: queued lines that never talk over each other; `interrupt` cuts off whatever is playing
 * (used for the real answer, so a progress line never delays it). `isActive` says whether voice
 * is still on (nothing is spoken after the call ends).
 */
export function useSpeaker(isActive: () => boolean) {
  const [eleven, setEleven] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const speakChain = useRef<Promise<void>>(Promise.resolve())
  const speakGen = useRef(0)
  const phraseCache = useRef<Map<string, string>>(new Map())
  const activeRef = useRef(isActive)
  useEffect(() => {
    activeRef.current = isActive
  }, [isActive])

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

  const stopSpeaking = useCallback(() => {
    speakGen.current++
    audioRef.current?.pause()
    audioRef.current = null
    if (typeof window !== "undefined") window.speechSynthesis?.cancel()
    speakChain.current = Promise.resolve()
  }, [])

  const prefetchPhrases = useCallback(async () => {
    if (!eleven) return
    const phrases = [...VOICE_GREETINGS, ...Object.values(PROGRESS).map((p) => `${p}.`)]
    await Promise.all(
      phrases
        .filter((p) => !phraseCache.current.has(p))
        .map(async (p) => {
          try {
            const res = await fetch("/api/sancus/agent/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: p }) })
            if (res.ok) phraseCache.current.set(p, URL.createObjectURL(await res.blob()))
          } catch {
            /* streams live instead */
          }
        })
    )
  }, [eleven])

  const play = useCallback(
    (a: HTMLAudioElement) =>
      new Promise<boolean>((resolve) => {
        audioRef.current = a
        let started = false
        a.onplaying = () => {
          started = true
        }
        a.onended = () => resolve(true)
        a.onpause = () => resolve(true)
        a.onerror = () => resolve(started)
        void a.play().catch(() => resolve(false))
      }),
    []
  )

  const speakOnce = useCallback(
    async (text: string) => {
      if (!activeRef.current() || !text.trim()) return
      if (eleven) {
        const cached = phraseCache.current.get(text)
        if (cached) {
          if (await play(new Audio(cached))) return
        } else {
          // Sentence by sentence, all downloading at once, so the first starts quickly.
          const gen = speakGen.current
          const parts = (text.slice(0, 1400).match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text]).map((s) => s.trim()).filter(Boolean)
          const audios = parts.map((p) => {
            const a = new Audio(`/api/sancus/agent/speak?text=${encodeURIComponent(p)}`)
            a.preload = "auto"
            return a
          })
          let playedAny = false
          for (const a of audios) {
            if (gen !== speakGen.current) break
            const ok = await play(a)
            playedAny ||= ok
            if (!ok && !playedAny) break
          }
          audios.forEach((a) => a.removeAttribute("src"))
          if (playedAny) return
        }
      }
      await new Promise<void>((resolve) => {
        const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined
        if (!synth) return resolve()
        const u = new SpeechSynthesisUtterance(text)
        u.rate = 1.03
        u.onend = () => resolve()
        u.onerror = () => resolve()
        synth.speak(u)
      })
    },
    [eleven, play]
  )

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

  return { eleven, say, stopSpeaking, prefetchPhrases }
}

// ---------- UI pieces ----------

const IconCheck = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12l4 4 10-10" />
  </svg>
)

export function StepList({ steps, title, running = false }: { steps: Step[]; title: string; running?: boolean }) {
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

/** A prepared payment / collection / limit change with its Confirm button and live status. */
export function ProposalCard({
  p,
  outcome,
  disabled = false,
  onConfirm,
  onCancel,
}: {
  p: Proposal
  outcome?: Outcome
  disabled?: boolean
  onConfirm: (p: Proposal) => void
  onCancel?: (p: Proposal) => void
}) {
  const o = outcome
  return (
    <div className="ag-card">
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
          <button type="button" className="sx-btn sx-btn--primary sx-btn--sm" onClick={() => onConfirm(p)} disabled={disabled || o?.state === "running"}>
            {o?.state === "running" ? "Sending…" : "Confirm"}
          </button>
          {onCancel && o?.state !== "running" ? (
            <button type="button" className="sx-btn sx-btn--quiet sx-btn--sm" onClick={() => onCancel(p)}>
              Cancel
            </button>
          ) : null}
          {o?.state === "running" ? (
            <span className="ag-live body-s" role="status">
              <i aria-hidden="true" />
              Sending the payment
            </span>
          ) : (
            <span className="body-s muted">Nothing is sent until you confirm</span>
          )}
          {o?.state === "error" ? (
            <span className="body-s" role="alert" style={{ color: "var(--failed)" }}>
              {o.text}
            </span>
          ) : null}
        </div>
      )}
    </div>
  )
}

export { VOICE_GREETINGS }
