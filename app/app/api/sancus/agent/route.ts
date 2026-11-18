// Sancus agent: tell the portal what you want and it does it.
//   GET  → agent status: AI configured, the agent's x402 wallet, today's data spend vs its cap,
//          and recent agent activity
//   POST { messages: [{ role, content }] } → Claude (claude-opus-5-5) works out the steps with
//          tools that call the app's own APIs as you. Anything that moves money or changes
//          settings comes back as a signed proposal you confirm (POST /api/sancus/agent/execute).
import Anthropic from "@anthropic-ai/sdk"
import { NextResponse } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { loadAccount } from "@/lib/sancus/accounts-server"
import { buildTools, type AgentContext } from "@/lib/sancus/agent/tools"
import { agentWalletStatus } from "@/lib/sancus/agent/x402-wallet"
import { workspaceCompany } from "@/lib/sancus/workspace-server"

export const maxDuration = 120

const MODEL = "claude-opus-5-5"

const bodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) }))
    .min(1)
    .max(30),
  /** Voice mode: replies are spoken, so short sentences and no lists. */
  voice: z.boolean().optional(),
  /** Stream newline-delimited JSON events (start / step / proposal / done / error). */
  stream: z.boolean().optional(),
})

const VOICE_RULES = [
  "",
  "Voice mode: your reply is read aloud, then the person answers by voice.",
  "- Answer in one to three short spoken sentences. No lists, no symbols, no URLs.",
  "- Say amounts the way a person would (\"two hundred and fifty Singapore dollars\" is fine as \"S$250\"), and round USDC costs to cents.",
  "- When you prepare a proposal, say what it is in one sentence, then: \"Say confirm, or tap Confirm, to send it.\" Never say it was sent.",
  "- If you need a detail (who, how much), ask one short question.",
].join("\n")

const aiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPIC_AUTH_TOKEN?.trim())

function systemPrompt(ctx: AgentContext, companyName: string | null): string {
  const today = new Date().toISOString().slice(0, 10)
  return [
    "You are the Sancus agent inside a stablecoin business account built on Arc and Circle. The person tells you what they want done and you do it with your tools.",
    "",
    "How to work:",
    "- Use tools for every fact (balances, recipients, quotes, activity). Never invent amounts, rates or names.",
    "- To pay someone: find them with list_recipients, quote_payment, then propose_payment. To collect money locally: propose_collection.",
    "- Proposals are not sent. The person confirms each one on a card under your message. Say what you prepared and that they can confirm it; never say money moved.",
    "- For the cheapest or best way to send money into Singapore, Indonesia or Thailand, use buy_route_quote. It costs the agent about $0.01 per call from its own wallet (an x402 micropayment), so call it only when it helps, at most three times per request, and mention what you paid.",
    "- If something is outside your tools or this account's permissions, say so plainly and suggest where in the app to do it.",
    "- Keep replies short: a sentence or two, then any figures as a short list. Amounts in their currency, USDC costs in dollars.",
    "- Write plain text: the chat doesn't render Markdown, so no asterisks, bold or headings. Use \"- \" for list items.",
    "",
    `Signed in as: ${ctx.account.label}${companyName ? ` of ${companyName}` : ""}. Workspace: ${ctx.companyId ? "the company" : "personal"}. Today is ${today}.`,
    ctx.account.can("money.send") ? "" : "This account cannot send money; don't prepare payments.",
  ].join("\n")
}

export const GET = withAuth(async (_req, { user, supabase }) => {
  const [wallet, { data: actions }] = await Promise.all([
    agentWalletStatus(supabase, user.id),
    supabase.from("sancus_agent_actions").select("id, kind, summary, cost_minor, reference, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(15),
  ])
  return NextResponse.json({ aiConfigured: aiConfigured(), model: MODEL, wallet, actions: actions ?? [] })
})

export const POST = withAuth(async (req, { user, supabase }) => {
  if (!aiConfigured()) {
    return NextResponse.json({ error: "The agent needs an Anthropic API key. Add ANTHROPIC_API_KEY to .env.local and restart." }, { status: 503 })
  }
  const parsed = await validateJsonBody(req, bodySchema)
  if (!parsed.ok) return parsed.response
  if (parsed.data.messages[0]?.role !== "user") return NextResponse.json({ error: "The conversation must start with you" }, { status: 400 })

  const account = await loadAccount(supabase, user)
  const companyId = await workspaceCompany(req, supabase, user.id)
  const ctx: AgentContext = {
    origin: req.nextUrl.origin,
    cookie: req.headers.get("cookie") ?? "",
    supabase,
    userId: user.id,
    account,
    companyId,
    steps: [],
    proposals: [],
  }
  const companyName = account.scopes.find((s) => s.companyId === companyId)?.companyName ?? account.scopes.find((s) => s.isRoot)?.companyName ?? null
  const { messages, voice, stream } = parsed.data

  async function run() {
    const client = new Anthropic()
    const final = await client.beta.messages.toolRunner({
      model: MODEL,
      max_tokens: 16000,
      max_iterations: 12,
      // Voice turns run lighter so the person isn't left waiting in silence.
      output_config: { effort: voice ? "low" : "medium" },
      // Server-side refusal fallback (on by default for this model).
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: systemPrompt(ctx, companyName) + (voice ? VOICE_RULES : ""),
      tools: buildTools(ctx),
      messages,
    })
    if (final.stop_reason === "refusal") return { reply: "I can't help with that one.", steps: ctx.steps, proposals: ctx.proposals }
    const reply = final.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim()
    return { reply: reply || "Done.", steps: ctx.steps, proposals: ctx.proposals }
  }

  if (!stream) {
    try {
      return NextResponse.json(await run())
    } catch (error) {
      const e = describeError(error)
      return NextResponse.json({ error: e.error }, { status: e.status })
    }
  }

  // Streaming: each tool start / finished step / proposal goes out as it happens, then "done".
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"))
      ctx.emit = send
      try {
        send({ type: "done", ...(await run()) })
      } catch (error) {
        send({ type: "error", error: describeError(error).error })
      } finally {
        controller.close()
      }
    },
  })
  return new NextResponse(body, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } })
})

function describeError(error: unknown): { status: number; error: string } {
  if (error instanceof Anthropic.AuthenticationError) return { status: 503, error: "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY." }
  if (error instanceof Anthropic.RateLimitError) return { status: 429, error: "The agent is busy right now. Try again in a moment." }
  if (error instanceof Anthropic.APIError) {
    console.error("Agent API error", error.status, error.message)
    return { status: 502, error: `The agent hit an error (${error.status}). Try again.` }
  }
  console.error("Agent failed", error)
  return { status: 500, error: "The agent couldn't finish. Try again." }
}
