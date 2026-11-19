// Mobile-friendly speech-to-text for the voice agent (iOS Safari has no SpeechRecognition).
// POST multipart field `audio` → { text } via OpenAI Whisper.
import { NextResponse } from "next/server"
import { withAuth } from "@/lib/api/with-auth"
import { openaiConfigured } from "@/lib/sancus/agent/openai-runner"

export const maxDuration = 60

export const GET = withAuth(async () => {
  return NextResponse.json({ whisper: openaiConfigured() })
})

export const POST = withAuth(async (req) => {
  if (!openaiConfigured()) {
    return NextResponse.json({ error: "OPENAI_API_KEY isn't set — voice listening needs Whisper on phones." }, { status: 503 })
  }
  const key = process.env.OPENAI_API_KEY!.trim()
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "Expected multipart audio" }, { status: 400 })
  }
  const audio = form.get("audio")
  if (!(audio instanceof Blob) || audio.size < 64) {
    return NextResponse.json({ error: "No audio received — hold the mic and speak, then release." }, { status: 400 })
  }
  const type = audio.type || "audio/webm"
  const ext = type.includes("mp4") || type.includes("m4a") ? "m4a" : type.includes("ogg") ? "ogg" : type.includes("wav") ? "wav" : "webm"
  const file = new File([audio], `utterance.${ext}`, { type: type || `audio/${ext}` })

  const body = new FormData()
  body.append("file", file)
  body.append("model", "whisper-1")
  body.append("language", "en")

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body,
    signal: AbortSignal.timeout(45_000),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    console.error("Whisper failed", res.status, detail.slice(0, 400))
    return NextResponse.json({ error: `Could not hear that (${res.status})` }, { status: 502 })
  }
  const data = (await res.json()) as { text?: string }
  const text = (data.text ?? "").trim()
  if (!text) return NextResponse.json({ error: "I didn't catch that — try again." }, { status: 422 })
  return NextResponse.json({ text })
})
