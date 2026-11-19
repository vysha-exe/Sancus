// Sancus agent: tell the portal what you want and it does it.
//   GET  → agent status: AI configured, the agent's x402 wallet, today's data spend vs its cap,
//          and recent agent activity
//   POST { messages: [{ role, content }] } → OpenAI works out the steps with tools that call the
//          app's own APIs as you. Anything that moves money or changes settings comes back as a
//          signed proposal you confirm (POST /api/sancus/agent/execute).
import { NextResponse } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { loadAccount } from "@/lib/sancus/accounts-server"
import { buildTools, type AgentContext } from "@/lib/sancus/agent/tools"
import { openaiConfigured, openaiModelName, runOpenAiAgent } from "@/lib/sancus/agent/openai-runner"
import { agentWalletStatus } from "@/lib/sancus/agent/x402-wallet"
import { workspaceCompany } from "@/lib/sancus/workspace-server"

export const maxDuration = 120

const bodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) }))
    .min(1)
    .max(30),
  /** Voice mode: replies are spoken, so short sentences and no lists. */
  voice: z.boolean().optional(),
  /** Stream newline-delimited JSON events (start / step / proposal / done / error). */
  stream: z.boolean().optional(),
  /** The page the person is looking at, so the agent can answer about it or act on it. */
  page: z
    .object({ path: z.string().max(200), title: z.string().max(200).optional(), text: z.string().max(6000).optional() })
    .optional(),
})

function pageContext(page: { path: string; title?: string; text?: string } | undefined): string {
  if (!page) return ""
  return [
    "",
    `The person is on the page ${page.path}${page.title ? ` ("${page.title}")` : ""}.`,
    "If they ask about \"this page\" or what they're looking at, answer from what's on it below (it may be cut off). If they ask you to do something, use your tools; use open_page to take them to the right page.",
    page.text ? `What's on the page:\n"""\n${page.text}\n"""` : "",
  ].join("\n")
}

const VOICE_RULES = [
  "",
  "Voice mode: your reply is read aloud, then the person answers by voice.",
  "- Answer in one to three short spoken sentences. No lists, no symbols, no URLs.",
  "- Say amounts the way a person would (\"two hundred and fifty Singapore dollars\" is fine as \"S$250\"), and round USDC costs to cents.",
  "- When you prepare a proposal, say what it is in one sentence, then: \"Say confirm, or tap Confirm, to send it.\" Never say it was sent.",
  "- Only ask them to confirm after you've called propose_payment (or another propose_ tool) in this turn: that's what puts the Confirm button on screen. Quoting alone shows no button.",
  "- If they say confirm, yes or go ahead and no card is waiting, prepare it now with propose_payment instead of telling them to press a button.",
  "- If you need a detail (who, how much), ask one short question.",
].join("\n")

/** What each account type uses the agent for. */
const ROLE_NOTES: Record<"ADMIN" | "BRANCH" | "EMPLOYEE" | "INDIVIDUAL", string> = {
  ADMIN: "This is the business admin: they see every branch, pay suppliers and contractors, and manage everyone's limits.",
  BRANCH:
    "This is a branch admin: they run their own branch, can pay other companies in the org (internal transfers) and external payees, collect money (propose_collection), and manage their employees' limits.",
  EMPLOYEE:
    "This is an employee: help with their card, spending methods and limits using my_spending. They can't send money, change limits or see company balances; for a higher limit, tell them to ask their branch admin.",
  INDIVIDUAL:
    "This is a personal account (no business): they pay friends, family and shops, and companies by bank details. They have no suppliers, contractors or team. To pay a QR code, point them to Pay, then Scan a QR code.",
}

function systemPrompt(ctx: AgentContext, companyName: string | null): string {
  const today = new Date().toISOString().slice(0, 10)
  return [
    "You are the Sancus agent inside a stablecoin business account built on Arc and Circle. The person tells you what they want done and you do it with your tools.",
    "",
    "How to work:",
    "- Use tools for every fact (balances, recipients, quotes, activity). Never invent amounts, rates or names.",
    "- To pay someone: find them with list_recipients, quote_payment, then propose_payment. To collect money locally: propose_collection.",
    "- Proposals are not sent. The person confirms each one on a card under your message. Say what you prepared and that they can confirm it; never say money moved.",
    "- For the cheapest or best way to send money into Indonesia or Thailand, use buy_route_quote. It costs the agent about $0.01 per call from its own wallet (an x402 micropayment), so call it only when it helps, at most three times per request, and mention what you paid.",
    "- If something is outside your tools or this account's permissions, say so plainly and suggest where in the app to do it.",
    "- Keep replies short: a sentence or two, then any figures as a short list. Amounts in their currency, USDC costs in dollars.",
    "- Write plain text: the chat doesn't render Markdown, so no asterisks, bold or headings. Use \"- \" for list items.",
    "",
    `Signed in as: ${ctx.account.label}${companyName ? ` of ${companyName}` : ""}. Workspace: ${ctx.companyId ? "the company" : "personal"}. Today is ${today}.`,
    ctx.account.can("money.send") ? "" : "This account cannot send money; don't prepare payments.",
    ROLE_NOTES[ctx.account.type],
  ].join("\n")
}

export const GET = withAuth(async (_req, { user, supabase }) => {
  const [wallet, { data: actions }] = await Promise.all([
    agentWalletStatus(supabase, user.id),
    supabase.from("sancus_agent_actions").select("id, kind, summary, cost_minor, reference, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(15),
  ])
  return NextResponse.json({
    aiConfigured: openaiConfigured(),
    model: openaiModelName(),
    provider: "openai",
    wallet,
    actions: actions ?? [],
  })
})

export const POST = withAuth(async (req, { user, supabase }) => {
  if (!openaiConfigured()) {
    return NextResponse.json(
      { error: "The agent needs an OpenAI API key. Add OPENAI_API_KEY to .env.local and restart." },
      { status: 503 }
    )
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
    actions: [],
  }
  const companyName = account.scopes.find((s) => s.companyId === companyId)?.companyName ?? account.scopes.find((s) => s.isRoot)?.companyName ?? null
  const { messages, voice, stream, page } = parsed.data

  async function run() {
    const { reply } = await runOpenAiAgent({
      system: systemPrompt(ctx, companyName) + pageContext(page) + (voice ? VOICE_RULES : ""),
      messages,
      tools: buildTools(ctx),
      maxIterations: 12,
    })
    return { reply, steps: ctx.steps, proposals: ctx.proposals, actions: ctx.actions ?? [] }
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
  if (error && typeof error === "object" && "status" in error) {
    const status = Number((error as { status?: number }).status)
    const msg = error instanceof Error ? error.message : "OpenAI error"
    if (status === 401 || status === 403) {
      return { status: 503, error: "The OpenAI API key was rejected. Check OPENAI_API_KEY." }
    }
    if (status === 429) {
      return { status: 429, error: "The agent is busy right now. Try again in a moment." }
    }
    if (status >= 400) {
      console.error("Agent API error", status, msg)
      return { status: 502, error: `The agent hit an error (${status}). Try again.` }
    }
  }
  console.error("Agent failed", error)
  return { status: 500, error: "The agent couldn't finish. Try again." }
}
