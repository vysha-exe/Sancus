"use client"

// The agent button at the top right of every page. Tapping it starts a voice call: Sancus greets
// you and listens. Ask about the page you're on ("what am I looking at?", "why is this pending?")
// and it answers aloud; tell it to do something ("pay Siam Packaging five thousand baht", "take me to scan a
// QR") and it opens the right page and prepares the action as a card you confirm by tapping or
// saying "confirm". Everything said is kept in the Agents chat (shared conversation).
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  askAgent,
  CANCEL_RE,
  CONFIRM_RE,
  confirmProposal,
  currentPageContext,
  dismissProposal,
  EXIT_RE,
  needsWhisperListen,
  openProposals,
  ProposalCard,
  recognitionCtor,
  recordUtterance,
  setChat,
  StepList,
  unlockAudioPlayback,
  useAgentChat,
  useSpeaker,
  useVoiceGlow,
  waitingProposal,
  type Phase,
  type Proposal,
  type Recognition,
} from "./agent-shared"

const PAUSE_KEY = "sancus-agent-paused"

const IconMic = ({ size = 16 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
)

export function AgentCallButton() {
  const router = useRouter()
  const { turns, outcomes, busy, liveSteps } = useAgentChat()
  const [phase, setPhase] = useState<Phase>("off")
  const [interim, setInterim] = useState("")
  const [note, setNote] = useState<string | null>(null)
  const [caption, setCaption] = useState<string | null>(null)
  const phaseRef = useRef<Phase>("off")
  const recRef = useRef<Recognition | null>(null)
  const listenRef = useRef<() => void>(() => {})
  const whisperStopRef = useRef<{ stopped: boolean } | null>(null)
  const [whisperMode, setWhisperMode] = useState(false)
  useEffect(() => {
    setWhisperMode(needsWhisperListen())
  }, [])
  const { orbRef, tapOutput } = useVoiceGlow(phase)
  const isActive = useCallback(() => phaseRef.current !== "off", [])
  const { say, stopSpeaking, prefetchPhrases } = useSpeaker(isActive, { onAudio: tapOutput })

  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p
    setPhase(p)
  }

  const hangUp = useCallback(() => {
    setPhaseBoth("off")
    if (whisperStopRef.current) whisperStopRef.current.stopped = true
    whisperStopRef.current = null
    recRef.current?.abort()
    recRef.current = null
    stopSpeaking()
    setInterim("")
    setCaption(null)
  }, [stopSpeaking])

  const afterSpeaking = useCallback(() => {
    if (phaseRef.current === "speaking") listenRef.current()
  }, [])

  const ask = useCallback(
    async (content: string) => {
      setPhaseBoth("thinking")
      setCaption(null)
      // Skip progress TTS on phones — speaking mid-await often burns iOS audio unlock.
      const speakProgress = !whisperMode
      const spokenProgress = new Set<string>()
      try {
        const done = await askAgent(content, {
          spoken: true,
          voice: true,
          page: currentPageContext(),
          onEvent: (e) => {
            if (e.type === "action" && e.action.type === "navigate") router.push(e.action.path) // take them there now
            if (speakProgress && e.type === "start" && spokenProgress.size < 2 && !spokenProgress.has(e.progress)) {
              spokenProgress.add(e.progress)
              void say(`${e.progress}.`)
            }
          },
        })
        setCaption(done.reply)
        setPhaseBoth("speaking")
        await say(done.reply, { interrupt: true })
        afterSpeaking()
      } catch (e) {
        const msg = `Sorry, ${(e as Error).message}`
        setCaption(msg)
        setPhaseBoth("speaking")
        await say(msg, { interrupt: true })
        afterSpeaking()
      }
    },
    [router, say, afterSpeaking, whisperMode]
  )

  const runConfirm = useCallback(
    async (p: Proposal) => {
      recRef.current?.abort()
      recRef.current = null
      setPhaseBoth("thinking")
      void say("Sending it now.", { interrupt: true })
      const outcome = await confirmProposal(p)
      if (phaseRef.current === "off") return
      setPhaseBoth("speaking")
      await say(outcome, { interrupt: true })
      afterSpeaking()
    },
    [say, afterSpeaking]
  )

  const handleUtterance = useCallback(
    async (text: string) => {
      setInterim("")
      if (EXIT_RE.test(text)) {
        void say("Okay, bye.", { interrupt: true })
        return hangUp()
      }
      const waiting = waitingProposal()
      if (waiting && CONFIRM_RE.test(text.trim())) {
        setChat((s) => ({ turns: [...s.turns, { role: "user", content: text, spoken: true }] }))
        return runConfirm(waiting)
      }
      if (waiting && CANCEL_RE.test(text.trim())) {
        setChat((s) => ({ turns: [...s.turns, { role: "user", content: text, spoken: true }] }))
        dismissProposal(waiting)
        setPhaseBoth("speaking")
        await say("Okay, I won't do that.", { interrupt: true })
        return afterSpeaking()
      }
      await ask(text)
    },
    [ask, hangUp, runConfirm, say, afterSpeaking]
  )

  const listen = useCallback(() => {
    if (phaseRef.current === "off") return

    // Phones without SpeechRecognition: push-to-talk → Whisper.
    if (needsWhisperListen()) {
      if (whisperStopRef.current) whisperStopRef.current.stopped = true
      const signal = { stopped: false }
      whisperStopRef.current = signal
      setInterim("")
      setNote("Listening… tap the orb when you're done speaking.")
      setPhaseBoth("listening")
      void (async () => {
        const result = await recordUtterance({
          maxMs: 15_000,
          signal,
          onStarted: () => setInterim("Recording…"),
        })
        if (phaseRef.current === "off") return
        whisperStopRef.current = null
        if ("error" in result) {
          setNote(result.error)
          setInterim("")
          setPhaseBoth("paused")
          return
        }
        setNote(null)
        setInterim(result.text)
        await handleUtterance(result.text)
      })()
      return
    }

    const Ctor = recognitionCtor()
    if (!Ctor) return
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
        setNote("Microphone access is blocked. Allow it in the address bar, then tap the mic.")
        setPhaseBoth("paused")
      }
    }
    rec.onend = () => {
      if (recRef.current !== rec) return
      recRef.current = null
      const text = finalText.trim()
      if (text) void handleUtterance(text)
      else if (phaseRef.current === "listening") listenRef.current()
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
  useEffect(() => () => hangUp(), [hangUp])

  async function start() {
    let paused = false
    try {
      paused = localStorage.getItem(PAUSE_KEY) === "1"
    } catch {
      /* private mode */
    }
    if (paused) {
      setNote("The agent is paused. Resume it on the Agents page.")
      setPhaseBoth("paused")
      return
    }
    // Must run in the same user gesture as the tap — otherwise iOS mutes later replies.
    await unlockAudioPlayback()
    const canListen = Boolean(recognitionCtor()) || needsWhisperListen()
    setNote(
      canListen
        ? needsWhisperListen()
          ? "On this phone: tap the orb to stop when you're done speaking."
          : null
        : "This browser can't listen. Open Agents and type, or try Chrome on desktop."
    )
    setCaption(null)
    setPhaseBoth("speaking")
    void prefetchPhrases()
    await say("Hi, I'm here. Ask me about this page, or tell me what to do.")
    if (phaseRef.current === "off") return
    if (canListen) listenRef.current()
    else setPhaseBoth("paused")
  }

  function onOrb() {
    if (phase === "speaking") {
      stopSpeaking()
      listen()
    } else if (phase === "listening") {
      if (whisperStopRef.current) {
        whisperStopRef.current.stopped = true
        setInterim("Got it — hearing you…")
        return
      }
      recRef.current?.abort()
      recRef.current = null
      setPhaseBoth("paused")
      setInterim("")
    } else if (phase === "paused") {
      listen()
    }
  }

  const on = phase !== "off"
  const label = { off: "", listening: "Listening", thinking: "Working", speaking: "Speaking", paused: "Paused" }[phase]
  const last = [...turns].reverse().find((t) => t.role === "assistant")
  const lastUser = [...turns].reverse().find((t) => t.role === "user")
  // Every card still waiting, even if a later question or a page change came after it.
  const cards = openProposals({ turns, outcomes })

  return (
    <>
      <button
        type="button"
        className="ag-callbtn"
        aria-pressed={on}
        aria-label={on ? "End the agent call" : "Talk to the Sancus agent"}
        title={on ? "End call" : "Talk to the agent about this page"}
        onClick={() => (on ? hangUp() : void start())}
      >
        <span className="dot">
          <IconMic />
        </span>
        <span className="lbl">{on ? "End call" : "Ask Sancus"}</span>
      </button>

      {on ? (
        <section className="ag-call" aria-label="Agent call" role="dialog">
          <div className="ag-call-h">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div ref={orbRef} className="ag-orb ag-orb--sm" data-phase={phase} style={{ ["--ag-level" as string]: 0 }}>
                <span className="ag-blob" aria-hidden="true" />
                <button
                  type="button"
                  className="ag-orb-hit"
                  onClick={onOrb}
                  disabled={phase === "thinking"}
                  aria-label={phase === "paused" ? "Resume listening" : phase === "speaking" ? "Interrupt" : "Pause listening"}
                />
              </div>
              <div style={{ display: "grid", gap: 2 }}>
                <span className="ag-live">
                  <i aria-hidden="true" />
                  {label}
                </span>
                <span className="body-s muted">Sancus agent · on this page</span>
              </div>
            </div>
            <button type="button" className="sx-btn sx-btn--secondary sx-btn--sm" onClick={hangUp}>
              End
            </button>
          </div>

          {interim ? (
            <span className="ag-call-said" style={{ fontStyle: "italic" }}>
              “{interim}”
            </span>
          ) : lastUser && lastUser.role === "user" && (busy || phase === "thinking") ? (
            <span className="ag-call-said muted">“{lastUser.content}”</span>
          ) : null}

          {busy ? <StepList steps={liveSteps} title="Working on it" running /> : null}

          {!busy && (caption || (last && last.role === "assistant")) ? (
            <span className="ag-call-said">{caption || (last && last.role === "assistant" ? last.content : "")}</span>
          ) : null}

          {cards.map((p) => (
            <ProposalCard key={p.id} p={p} outcome={outcomes[p.id]} onConfirm={(x) => void runConfirm(x)} onCancel={(x) => dismissProposal(x)} />
          ))}

          {note ? (
            <span className="body-s" role="alert">
              {note}
            </span>
          ) : null}

          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <span className="body-s muted">
              {whisperMode ? "Tap orb to finish speaking · “confirm” to send" : "Say “confirm” to send · “end call” to hang up"}
            </span>
            <Link href="/agents" className="body-s">
              Open chat
            </Link>
          </div>
        </section>
      ) : null}
    </>
  )
}
