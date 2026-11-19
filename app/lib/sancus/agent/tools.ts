// Sancus agent: the tools Claude can use. Every tool calls the app's own API routes as the
// signed-in person (their session cookie), so account permissions, spending policy and approvals
// apply exactly as in the UI. Tools that would change anything only create a signed proposal;
// the person confirms it with a click (see proposals.ts and /api/sancus/agent/execute).
// Server only.

import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod"
import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool"
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod/v4"
import type { SancusAccount } from "@/lib/sancus/accounts"
import { applyCompanyBalances, type CompanyBalanceSnapshot, type CompanyNode } from "@/lib/sancus/companies"
import { recipients as demoRecipients } from "@/lib/sancus/demo-data"
import { signProposal, type Proposal, type ProposalKind } from "./proposals"
import { payX402 } from "./x402-wallet"
import { PROGRESS } from "./progress"

export type AgentStep = { tool: string; label: string; ok: boolean; costLabel?: string }

export type AgentContext = {
  origin: string
  cookie: string
  supabase: SupabaseClient
  userId: string
  account: SancusAccount
  companyId: string | null
  steps: AgentStep[]
  proposals: Proposal[]
  /** Live events for streaming clients (voice mode speaks the "start" ones). */
  emit?: (e: AgentEvent) => void
}

export type AgentEvent =
  | { type: "start"; tool: string; progress: string }
  | { type: "step"; step: AgentStep }
  | { type: "proposal"; proposal: Proposal }

export { PROGRESS }

function record(ctx: AgentContext, s: AgentStep) {
  ctx.steps.push(s)
  ctx.emit?.({ type: "step", step: s })
}

const usd6 = (minor: string | number | bigint) => `$${(Number(minor) / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

async function api<T = Record<string, unknown>>(ctx: AgentContext, path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
  const res = await fetch(new URL(path, ctx.origin), {
    ...init,
    headers: { cookie: ctx.cookie, "content-type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  })
  const body = (await res.json().catch(() => ({}))) as T
  return { status: res.status, body }
}

const sgRecipients = demoRecipients.filter((r) => r.payout)

type AchRecipient = { id: string; name: string; bankName: string; accountMasked: string; accountType: string }

async function findRecipient(ctx: AgentContext, id: string) {
  if (id.startsWith("sg:")) {
    const r = sgRecipients.find((x) => x.id === id.slice(3))
    return r ? ({ kind: "paynow", r } as const) : null
  }
  if (id.startsWith("ach:")) {
    const { body } = await api<{ recipients?: AchRecipient[] }>(ctx, "/api/sancus/recipients")
    const r = body.recipients?.find((x) => x.id === id.slice(4))
    return r ? ({ kind: "ach", r } as const) : null
  }
  return null
}

function propose(ctx: AgentContext, kind: ProposalKind, title: string, lines: Proposal["lines"], request: Proposal["request"], note?: string) {
  const p = signProposal({ kind, title, lines, request, note, userId: ctx.userId })
  ctx.proposals.push(p)
  ctx.emit?.({ type: "proposal", proposal: p })
  return `Prepared proposal ${p.id.slice(0, 8)}: "${title}". It is shown to the person as a card with a Confirm button. Nothing has been sent yet; do not say it was.`
}

/** Wraps a tool body so each call is logged as a step and errors come back as text. */
function step<I>(ctx: AgentContext, tool: string, label: (input: I) => string, run: (input: I) => Promise<string>) {
  return async (input: I) => {
    ctx.emit?.({ type: "start", tool, progress: PROGRESS[tool] ?? "Working on it" })
    try {
      const out = await run(input)
      record(ctx, { tool, label: label(input), ok: true })
      return out
    } catch (e) {
      record(ctx, { tool, label: label(input), ok: false })
      return `Error: ${e instanceof Error ? e.message : String(e)}`
    }
  }
}

// Each tool has its own input type; the runner takes a mixed list.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = BetaRunnableTool<any>

export function buildTools(ctx: AgentContext): AnyTool[] {
  const tools: AnyTool[] = [
    betaZodTool({
      name: "get_balances",
      description:
        "Available USDC balance of the current workspace (the company and its branches, or personal), with each branch's own balance. Use for any balance question.",
      inputSchema: z.object({}),
      run: step(ctx, "get_balances", () => "Checked balances", async () => {
        const scope = ctx.companyId ? `?companyId=${ctx.companyId}` : ""
        const [{ body: t }, { body: c }, { body: balances }] = await Promise.all([
          api<Record<string, string>>(ctx, `/api/sancus/treasury${scope}`),
          api<{ tree?: CompanyNode[] }>(ctx, "/api/sancus/companies/me"),
          api<CompanyBalanceSnapshot>(ctx, "/api/sancus/companies/balances"),
        ])
        const tree = applyCompanyBalances(c.tree ?? [], balances)
        const nodes: string[] = []
        const walk = (n: CompanyNode, depth: number) => {
          nodes.push(`${"  ".repeat(depth)}${n.name}: own ${usd6(n.ownMinor)}, with branches ${usd6(n.totalMinor)}`)
          for (const k of n.children) walk(k, depth + 1)
        }
        for (const root of tree) walk(root, 0)
        return [
          `Available: ${usd6(t.availableMinor ?? "0")} (onchain ${usd6(t.totalMinor ?? "0")}, held for payments in progress ${usd6(t.reservedMinor ?? "0")})`,
          nodes.length ? `Branches:\n${nodes.join("\n")}` : "No company branches.",
        ].join("\n")
      }),
    }),

    betaZodTool({
      name: "list_recipients",
      description:
        "People and businesses this account can pay, with the id to use in other tools. sg:* ids are Singapore PayNow/FAST payees (amounts in SGD); ach:* ids are US bank accounts (amounts in USD).",
      inputSchema: z.object({}),
      run: step(ctx, "list_recipients", () => "Looked up recipients", async () => {
        const { body } = await api<{ recipients?: AchRecipient[] }>(ctx, "/api/sancus/recipients")
        const sg = sgRecipients.map((r) => `sg:${r.id} | ${r.name} | ${r.detail}`)
        const ach = (body.recipients ?? []).map((r) => `ach:${r.id} | ${r.name} | US bank ${r.bankName} ${r.accountMasked} (${r.accountType.toLowerCase()})`)
        return [...sg, ...ach].join("\n") || "No recipients yet."
      }),
    }),

    betaZodTool({
      name: "quote_payment",
      description: "Live quote for paying a recipient: what they receive, the fee, the USDC it costs, the FX rate and arrival. Quoting moves no money.",
      inputSchema: z.object({
        recipient_id: z.string().describe("An id from list_recipients, e.g. sg:lim-trading or ach:<uuid>"),
        amount: z.string().describe("What the recipient receives, as a decimal string, in their currency (SGD for sg:*, USD for ach:*)"),
        same_day: z.boolean().optional().describe("ACH only: same-day ACH ($1.00 fee) instead of standard ($0.50)"),
      }),
      run: step(ctx, "quote_payment", (i) => `Quoted ${i.amount} to ${i.recipient_id.split(":")[0].toUpperCase()} recipient`, async (i) => {
        const found = await findRecipient(ctx, i.recipient_id)
        if (!found) return "Unknown recipient id. Call list_recipients first."
        if (found.kind === "paynow") {
          const { status, body } = await api<{ quote?: Record<string, string>; rail?: string; etaLabel?: string; error?: string }>(ctx, "/api/sancus/payouts/quote", {
            method: "POST",
            body: JSON.stringify({ recipient: { name: found.r.name, ...found.r.payout }, sgdAmount: i.amount }),
          })
          if (status !== 200 || !body.quote) return `Quote failed: ${body.error ?? status}`
          const q = body.quote
          return `${found.r.name} receives S$${i.amount} by ${body.rail}. Costs ${usd6(q.usdcAmountMinor)} USDC (fee S$${(Number(q.feeSgdMinor) / 100).toFixed(2)}, rate 1 USDC = ${q.clientRate} SGD, live mid ${q.midRate}). Arrives ${body.etaLabel}.`
        }
        const { status, body } = await api<{ quote?: Record<string, string>; policy?: { decision: string; reason: string | null }; error?: string }>(ctx, "/api/sancus/payments/quote", {
          method: "POST",
          body: JSON.stringify({ recipientId: found.r.id, usdAmount: i.amount, speed: i.same_day ? "SAME_DAY" : "STANDARD" }),
        })
        if (status !== 200 || !body.quote) return `Quote failed: ${body.error ?? status}`
        const q = body.quote
        return `${found.r.name} receives US$${i.amount} by ${i.same_day ? "same-day " : ""}ACH. Costs ${usd6(q.usdcAmountMinor)} USDC (fee $${(Number(q.feeUsdMinor) / 100).toFixed(2)}, 1 USDC = 1 USD). ${q.etaLabel}. Policy: ${body.policy?.decision}${body.policy?.reason ? ` (${body.policy.reason})` : ""}.`
      }),
    }),

    betaZodTool({
      name: "propose_payment",
      description:
        "Prepare a payment for the person to confirm. Does NOT send it: the person sees a confirm card. Always quote first. Payments at or over the approval rule go to Approvals after confirming.",
      inputSchema: z.object({
        recipient_id: z.string(),
        amount: z.string().describe("What the recipient receives, in their currency (SGD for sg:*, USD for ach:*)"),
        reference: z.string().max(60).optional(),
        same_day: z.boolean().optional(),
      }),
      run: step(ctx, "propose_payment", (i) => `Prepared a payment of ${i.amount}`, async (i) => {
        if (!ctx.account.can("money.send")) return "This account can't send money. Tell the person to ask their admin."
        const found = await findRecipient(ctx, i.recipient_id)
        if (!found) return "Unknown recipient id. Call list_recipients first."
        if (found.kind === "paynow") {
          return propose(
            ctx,
            "paynow",
            `Pay ${found.r.name} S$${i.amount}`,
            [
              { label: "To", value: `${found.r.name} · ${found.r.detail}` },
              { label: "They receive", value: `S$${i.amount}` },
              { label: "Rail", value: found.r.payout?.proxyType === "BANK" ? "FAST" : "PayNow" },
              ...(i.reference ? [{ label: "Reference", value: i.reference }] : []),
            ],
            { method: "POST", path: "/api/sancus/payouts", idempotent: true, body: { recipient: { name: found.r.name, ...found.r.payout }, sgdAmount: i.amount, reference: i.reference } },
            "Rate is re-quoted live when you confirm."
          )
        }
        return propose(
          ctx,
          "ach",
          `Pay ${found.r.name} US$${i.amount} by ACH`,
          [
            { label: "To", value: `${found.r.name} · ${found.r.bankName} ${found.r.accountMasked}` },
            { label: "They receive", value: `US$${i.amount}` },
            { label: "Speed", value: i.same_day ? "Same-day ACH ($1.00 fee)" : "Standard ACH ($0.50 fee)" },
            ...(i.reference ? [{ label: "Reference", value: i.reference }] : []),
          ],
          { method: "POST", path: "/api/sancus/payments", idempotent: true, body: { recipientId: found.r.id, usdAmount: i.amount, speed: i.same_day ? "SAME_DAY" : "STANDARD", reference: i.reference } }
        )
      }),
    }),

    betaZodTool({
      name: "buy_route_quote",
      description:
        "Buy a live best-route quote (rail, FX rate, fee, total USDC cost, arrival) for sending money into Singapore, Indonesia or Thailand. Costs about $0.01 per call, paid by the agent's own wallet with an x402 micropayment on Arc. Use when the person asks for the cheapest or best way to send money to SG/ID/TH, or to compare corridors.",
      inputSchema: z.object({
        country: z.enum(["SG", "ID", "TH"]),
        amount: z.string().describe("Amount in the local currency (SGD, IDR or THB)"),
        recipient_type: z.enum(["UEN", "MOBILE", "BANK"]).optional(),
      }),
      run: async (i) => {
        ctx.emit?.({ type: "start", tool: "buy_route_quote", progress: PROGRESS.buy_route_quote })
        const url = `${ctx.origin}/api/x402/route-quote?country=${i.country}&amount=${encodeURIComponent(i.amount)}&recipientType=${i.recipient_type ?? "BANK"}`
        const res = await payX402<Record<string, unknown>>(ctx.supabase, ctx.userId, ctx.companyId, url, `Route quote ${i.country} ${i.amount}`)
        record(ctx, {
          tool: "buy_route_quote",
          label: res.ok ? `Bought a live ${i.country} route quote` : `Couldn't buy a ${i.country} route quote (${res.error})`,
          ok: res.ok,
          costLabel: res.ok ? res.costLabel : undefined,
        })
        return res.ok ? `Paid ${res.costLabel} via x402. Quote: ${JSON.stringify(res.data)}` : `Couldn't buy the quote: ${res.error}`
      },
    }),

    betaZodTool({
      name: "recent_activity",
      description: "The latest payments in and out (PayNow, ACH, Pix, local collections) with status.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(20).optional() }),
      run: step(ctx, "recent_activity", () => "Read recent activity", async (i) => {
        const [{ body: p }, { body: a }] = await Promise.all([
          api<{ payouts?: { recipientName: string; rail: string; usdcAmountMinor: string; status: string; createdAt: string }[] }>(ctx, "/api/sancus/payouts"),
          api<{ payments?: { recipient: { name: string }; usdcAmountMinor: string; status: string; createdAt: string }[] }>(ctx, "/api/sancus/payments"),
        ])
        const rows = [
          ...(p.payouts ?? []).map((x) => ({ at: x.createdAt, line: `${x.createdAt.slice(0, 16)} ${x.rail} to ${x.recipientName}: ${usd6(x.usdcAmountMinor)} · ${x.status}` })),
          ...(a.payments ?? []).map((x) => ({ at: x.createdAt, line: `${x.createdAt.slice(0, 16)} ACH to ${x.recipient.name}: ${usd6(x.usdcAmountMinor)} · ${x.status}` })),
        ].sort((x, y) => Date.parse(y.at) - Date.parse(x.at))
        return rows.slice(0, i.limit ?? 8).map((r) => r.line).join("\n") || "No payments yet."
      }),
    }),

    betaZodTool({
      name: "propose_collection",
      description:
        "Prepare a local QR collection for the person to confirm: a customer pays by QRIS (Indonesia, IDR), PromptPay (Thailand, THB) or Pix (Brazil, BRL); a matching local stablecoin is minted into that country's branch wallet.",
      inputSchema: z.object({ rail: z.enum(["QRIS", "PROMPTPAY", "PIX"]), amount: z.string().describe("Local currency amount, e.g. 500") }),
      run: step(ctx, "propose_collection", (i) => `Prepared a ${i.rail} collection`, async (i) => {
        if (!ctx.account.can("money.receive")) return "This account can't collect payments."
        const minor = Math.round(Number(i.amount) * 100)
        if (!Number.isFinite(minor) || minor <= 0) return "Amount must be a positive number."
        const cur = { QRIS: "IDR", PROMPTPAY: "THB", PIX: "BRL" }[i.rail]
        return propose(
          ctx,
          "collection",
          `Collect ${i.amount} ${cur} by ${i.rail === "PROMPTPAY" ? "PromptPay" : i.rail}`,
          [
            { label: "Rail", value: i.rail === "PROMPTPAY" ? "PromptPay (Thailand)" : i.rail === "QRIS" ? "QRIS (Indonesia)" : "Pix (Brazil)" },
            { label: "Amount", value: `${i.amount} ${cur}` },
          ],
          { method: "POST", path: "/api/sancus/rails/collections", idempotent: false, body: { rail: i.rail, amountMinor: String(minor) } },
          "Creates a QR for your customer; the matching test stablecoin is minted when it's paid."
        )
      }),
    }),
  ]

  // People management for admins and branch admins.
  if (ctx.account.can("members.manage")) {
    tools.push(
      betaZodTool({
        name: "list_people",
        description: "Employees and branch admins this account manages, with their membership id and spending limits.",
        inputSchema: z.object({}),
        run: step(ctx, "list_people", () => "Looked up your people", async () => {
          const { body } = await api<{ people?: { membershipId: string; email: string | null; accountType: string; companyName: string; perPaymentLimitMinor: string | null; dailyLimitMinor: string | null; status: string }[] }>(ctx, "/api/sancus/accounts")
          return (
            (body.people ?? [])
              .map((p) => `${p.membershipId} | ${p.email} | ${p.accountType} at ${p.companyName} | per payment ${p.perPaymentLimitMinor ? usd6(p.perPaymentLimitMinor) : "none"}, per day ${p.dailyLimitMinor ? usd6(p.dailyLimitMinor) : "none"} | ${p.status}`)
              .join("\n") || "No one yet."
          )
        }),
      }),
      betaZodTool({
        name: "propose_limits",
        description: "Prepare new spending limits for an employee, for the person to confirm. Amounts in US dollars.",
        inputSchema: z.object({
          membership_id: z.string().describe("From list_people"),
          per_payment_usd: z.string().optional(),
          per_day_usd: z.string().optional(),
        }),
        run: step(ctx, "propose_limits", () => "Prepared new spending limits", async (i) => {
          const toMinor = (v?: string) => (v && /^\d+(\.\d{1,2})?$/.test(v) ? String(Math.round(Number(v) * 100) * 10_000) : undefined)
          const body: Record<string, string> = {}
          const pp = toMinor(i.per_payment_usd)
          const pd = toMinor(i.per_day_usd)
          if (pp) body.perPaymentLimitMinor = pp
          if (pd) body.dailyLimitMinor = pd
          if (!Object.keys(body).length) return "Give a per-payment or per-day limit in dollars."
          return propose(
            ctx,
            "limits",
            "Change spending limits",
            [
              ...(pp ? [{ label: "Per payment", value: `$${i.per_payment_usd}` }] : []),
              ...(pd ? [{ label: "Per day", value: `$${i.per_day_usd}` }] : []),
            ],
            { method: "PATCH", path: `/api/sancus/accounts/${i.membership_id}`, idempotent: false, body }
          )
        }),
      })
    )
  }
  return tools
}
