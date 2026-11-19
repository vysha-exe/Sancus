// Sancus agent voice: turns the agent's reply into natural speech with ElevenLabs. Server-side so
// the API key never reaches the browser. Without ELEVENLABS_API_KEY the client falls back to the
// browser's built-in voice.
//   GET              → { elevenlabs: boolean }
//   GET ?text=…      → streamed audio/mpeg: point an <audio> element here and it starts playing
//                      as the first bytes arrive (lowest time to first sound)
//   POST { text }    → audio/mpeg (same audio, for pre-recording fixed phrases)
import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"

const VOICE_ID = () => process.env.ELEVENLABS_VOICE_ID?.trim() || "JBFqnCBsd6RMkjVDRZzb"
const MODEL_ID = () => process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_flash_v2_5" // ~100 ms, built for live agents
const key = () => process.env.ELEVENLABS_API_KEY?.trim() || ""

const schema = z.object({ text: z.string().min(1).max(1500) })

/** Pipes ElevenLabs' streaming endpoint straight through, chunk by chunk. */
async function speak(text: string): Promise<NextResponse> {
  if (!key()) return NextResponse.json({ error: "ELEVENLABS_API_KEY isn't set" }, { status: 503 })
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(VOICE_ID())}/stream?output_format=mp3_44100_64`, {
    method: "POST",
    headers: { "xi-api-key": key(), "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID(),
      // Flash doesn't read numbers and amounts naturally unless normalisation is on.
      apply_text_normalization: "on",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "")
    console.error("ElevenLabs TTS failed", res.status, detail.slice(0, 300))
    return NextResponse.json({ error: `Voice service error (${res.status})` }, { status: 502 })
  }
  return new NextResponse(res.body, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } })
}

export const GET = withAuth(async (req: NextRequest) => {
  const text = req.nextUrl.searchParams.get("text")
  if (!text) return NextResponse.json({ elevenlabs: Boolean(key()) })
  const parsed = schema.safeParse({ text })
  if (!parsed.success) return NextResponse.json({ error: "Text must be 1–1500 characters" }, { status: 400 })
  return speak(parsed.data.text)
})

export const POST = withAuth(async (req) => {
  const parsed = await validateJsonBody(req, schema)
  if (!parsed.ok) return parsed.response
  return speak(parsed.data.text)
})
