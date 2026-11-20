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
  const open = openProposals(getChat())
  return open.length ? open[open.length - 1]! : null
}

/**
 * Cards still waiting for a decision, oldest first. A card stays open across later questions
 * ("what's the fee?") and page changes until it's confirmed or cancelled; only the latest two
 * answers that prepared something are considered.
 */
export function openProposals(state: Pick<ChatState, "turns" | "outcomes">): Proposal[] {
  const withCards = state.turns.filter((t): t is Extract<Turn, { role: "assistant" }> => t.role === "assistant" && t.proposals.length > 0).slice(-2)
  return withCards.flatMap((t) => t.proposals).filter((p) => {
    const o = state.outcomes[p.id]
    return !o || o.state === "error" || o.state === "running"
  })
}

/** The conversation as the API wants it: at most 30 messages, starting with one of yours. */
function forApi(messages: { role: string; content: string }[]) {
  const recent = messages.filter((m) => m.content.trim()).slice(-30)
  const firstUser = recent.findIndex((m) => m.role === "user")
  return firstUser < 0 ? [] : recent.slice(firstUser)
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
        ? "Local QR created for your customer. Open Pay with QR, then Make a local QR, to show it."
        : p.kind === "limits"
          ? "Limits updated."
          : p.kind === "transfer" && body.status === "COMPLETED"
            ? "Money moved. Both branches' activity is updated."
            : `Done. Status: ${String(body.status).replace(/_/g, " ").toLowerCase()}.`
    setOutcome(p.id, { state: "done", text })
    noteInChat(`${p.title}: ${text}`)
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
  noteInChat(`${p.title}: cancelled.`)
}

/** Records what happened to a card as a short assistant line, so the agent knows on the next turn. */
function noteInChat(text: string) {
  setChat((s) => ({ turns: [...s.turns, { role: "assistant", content: text, steps: [], proposals: [] }] }))
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
    body: JSON.stringify({ messages: forApi(messages), voice, stream: true, page }),
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

/** iPhone Safari (and most iOS browsers) have no SpeechRecognition — use Whisper push-to-talk instead. */
export function needsWhisperListen(): boolean {
  if (typeof window === "undefined") return false
  if (recognitionCtor()) return false
  return typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia)
}

/** Call inside the tap that starts the call so iOS allows later TTS after awaits. */
export async function unlockAudioPlayback(): Promise<void> {
  if (typeof window === "undefined") return
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (AC) {
      const ctx = new AC()
      await ctx.resume()
      const buffer = ctx.createBuffer(1, 1, 22050)
      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.connect(ctx.destination)
      src.start(0)
      // Keep context around briefly; speaker creates its own too.
      setTimeout(() => void ctx.close().catch(() => {}), 2_000)
    }
  } catch {
    /* ignore */
  }
  try {
    // Tiny silent wav — unlocks HTMLAudioElement.play() for ElevenLabs replies.
    const a = new Audio(
      "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAAAAAA=="
    )
    a.setAttribute("playsinline", "true")
    ;(a as HTMLAudioElement & { playsInline?: boolean }).playsInline = true
    a.volume = 0.01
    await a.play().catch(() => {})
    a.pause()
  } catch {
    /* ignore */
  }
}

function preferredRecorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined
  for (const type of ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"]) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return undefined
}

/** Record until `stop` is called (or maxMs), then Whisper-transcribe via /api/sancus/agent/listen. */
export async function recordUtterance(opts: {
  maxMs?: number
  onStarted?: () => void
  signal?: { stopped: boolean }
}): Promise<{ text: string } | { error: string }> {
  if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return { error: "This browser can't record audio." }
  }
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
  } catch {
    return { error: "Microphone access is blocked. Allow it, then try again." }
  }
  const mime = preferredRecorderMime()
  const chunks: BlobPart[] = []
  const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data)
    }
    recorder.onerror = () => reject(new Error("Recording failed"))
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || mime || "audio/webm" }))
  })
  try {
    recorder.start(250)
    opts.onStarted?.()
    const maxMs = opts.maxMs ?? 12_000
    const started = Date.now()
    while (!opts.signal?.stopped && Date.now() - started < maxMs) {
      await new Promise((r) => setTimeout(r, 120))
    }
    if (recorder.state !== "inactive") recorder.stop()
    const blob = await done
    stream.getTracks().forEach((t) => t.stop())
    if (blob.size < 64) return { error: "I didn't catch that — hold the mic and speak." }
    const form = new FormData()
    form.append("audio", blob, "utterance.webm")
    const res = await fetch("/api/sancus/agent/listen", { method: "POST", body: form })
    const body = (await res.json().catch(() => ({}))) as { text?: string; error?: string }
    if (!res.ok) return { error: body.error || "Could not hear that" }
    if (!body.text?.trim()) return { error: "I didn't catch that — try again." }
    return { text: body.text.trim() }
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop())
    return { error: e instanceof Error ? e.message : "Recording failed" }
  }
}

/**
 * Soft voice orb: drives CSS `--ag-level` from mic input (listening) or spoken audio
 * (speaking). Pass `tapOutput` into `useSpeaker(..., { onAudio: tapOutput })`.
 */
export function useVoiceGlow(phase: Phase) {
  const orbRef = useRef<HTMLDivElement>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const micAnalyserRef = useRef<AnalyserNode | null>(null)
  const outAnalyserRef = useRef<AnalyserNode | null>(null)
  const mediaSourcesRef = useRef(new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>())
  const meterModeRef = useRef<"off" | "mic" | "out" | "synth">("off")
  const meterRafRef = useRef(0)

  const writeLevel = (v: number) => {
    orbRef.current?.style.setProperty("--ag-level", Math.max(0, Math.min(1, v)).toFixed(3))
  }

  const analyserLevel = (analyser: AnalyserNode) => {
    const buf = new Uint8Array(analyser.fftSize)
    analyser.getByteTimeDomainData(buf)
    let sum = 0
    for (let i = 0; i < buf.length; i++) {
      const n = (buf[i]! - 128) / 128
      sum += n * n
    }
    return Math.min(1, Math.sqrt(sum / buf.length) * 3.4)
  }

  const stopMeter = useCallback(() => {
    meterModeRef.current = "off"
    cancelAnimationFrame(meterRafRef.current)
    writeLevel(0)
  }, [])

  const startMeter = useCallback((mode: "mic" | "out" | "synth") => {
    meterModeRef.current = mode
    cancelAnimationFrame(meterRafRef.current)
    const tick = (t: number) => {
      let level = 0
      if (meterModeRef.current === "mic" && micAnalyserRef.current) level = analyserLevel(micAnalyserRef.current)
      else if (meterModeRef.current === "out" && outAnalyserRef.current) level = analyserLevel(outAnalyserRef.current)
      else if (meterModeRef.current === "synth") level = 0.3 + 0.22 * Math.sin(t * 0.007) + 0.14 * Math.sin(t * 0.019)
      writeLevel(level)
      if (meterModeRef.current !== "off") meterRafRef.current = requestAnimationFrame(tick)
    }
    meterRafRef.current = requestAnimationFrame(tick)
  }, [])

  const ensureAudioCtx = () => {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
    return audioCtxRef.current
  }

  const tapOutput = useCallback((el: HTMLAudioElement) => {
    try {
      const ctx = ensureAudioCtx()
      void ctx.resume()
      let analyser = outAnalyserRef.current
      if (!analyser) {
        analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.72
        analyser.connect(ctx.destination)
        outAnalyserRef.current = analyser
      }
      if (!mediaSourcesRef.current.has(el)) {
        const src = ctx.createMediaElementSource(el)
        mediaSourcesRef.current.set(el, src)
        src.connect(analyser)
      }
      if (meterModeRef.current !== "off") meterModeRef.current = "out"
    } catch {
      /* already tapped or Web Audio unavailable */
    }
  }, [])

  useEffect(() => {
    if (phase === "speaking") {
      startMeter("synth")
      return () => stopMeter()
    }
    if (phase !== "listening") {
      stopMeter()
      return
    }
    let cancelled = false
    let stream: MediaStream | null = null
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        const ctx = ensureAudioCtx()
        void ctx.resume()
        const source = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        analyser.smoothingTimeConstant = 0.78
        source.connect(analyser)
        micAnalyserRef.current = analyser
        startMeter("mic")
      } catch {
        /* recognition may already own the mic — keep idle glow */
      }
    })()
    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
      micAnalyserRef.current = null
      stopMeter()
    }
  }, [phase, startMeter, stopMeter])

  useEffect(
    () => () => {
      stopMeter()
      audioCtxRef.current?.close().catch(() => {})
      audioCtxRef.current = null
    },
    [stopMeter]
  )

  return { orbRef, tapOutput }
}

// ---------- speech out ----------

/**
 * Browser fallback (no ElevenLabs key): an American English female voice, so it sounds like the
 * ElevenLabs one instead of the system default (often a male voice on Windows).
 */
const FEMALE_VOICES = /samantha|zira|aria|jenny|ava|allison|susan|joanna|female|google us english/i
function femaleEnglishVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | null {
  const voices = synth.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"))
  return (
    voices.find((v) => v.lang === "en-US" && FEMALE_VOICES.test(v.name)) ??
    voices.find((v) => FEMALE_VOICES.test(v.name)) ??
    null
  )
}

/**
 * Speaking: queued lines that never talk over each other; `interrupt` cuts off whatever is playing
 * (used for the real answer, so a progress line never delays it). `isActive` says whether voice
 * is still on (nothing is spoken after the call ends).
 */
export function useSpeaker(isActive: () => boolean, opts?: { onAudio?: (a: HTMLAudioElement) => void }) {
  const [eleven, setEleven] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const speakChain = useRef<Promise<void>>(Promise.resolve())
  const speakGen = useRef(0)
  const phraseCache = useRef<Map<string, string>>(new Map())
  const activeRef = useRef(isActive)
  const onAudioRef = useRef(opts?.onAudio)
  useEffect(() => {
    activeRef.current = isActive
  }, [isActive])
  useEffect(() => {
    onAudioRef.current = opts?.onAudio
  }, [opts?.onAudio])

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
        // iOS needs playsInline or replies after an await stay silent.
        a.setAttribute("playsinline", "true")
        ;(a as HTMLAudioElement & { playsInline?: boolean }).playsInline = true
        audioRef.current = a
        onAudioRef.current?.(a)
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
        const voice = femaleEnglishVoice(synth)
        if (voice) u.voice = voice
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
