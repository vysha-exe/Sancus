// Sancus agent: proposals. The agent never moves money itself. Any action that changes something
// becomes a signed proposal shown to the person as a card; only their Confirm click runs it.
// The signature binds the exact request to the person and expires, so the browser can't alter it.
// Server only.

import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto"

export type ProposalKind = "paynow" | "ach" | "collection" | "limits"

/** Each kind may only call one endpoint, whatever a tampered proposal says. */
export const ALLOWED: Record<ProposalKind, { method: "POST" | "PATCH"; path: RegExp }> = {
  paynow: { method: "POST", path: /^\/api\/sancus\/payouts$/ },
  ach: { method: "POST", path: /^\/api\/sancus\/payments$/ },
  collection: { method: "POST", path: /^\/api\/sancus\/rails\/collections$/ },
  limits: { method: "PATCH", path: /^\/api\/sancus\/accounts\/[0-9a-f-]{36}$/ },
}

export type ProposalRequest = { method: "POST" | "PATCH"; path: string; body: Record<string, unknown>; idempotent: boolean }

export type Proposal = {
  id: string
  kind: ProposalKind
  title: string
  /** Label/value lines for the confirm card. */
  lines: { label: string; value: string }[]
  note?: string
  request: ProposalRequest
  userId: string
  expiresAt: string
  sig: string
}

const TTL_MS = 10 * 60 * 1000

function secret(): string {
  const explicit = process.env.AGENT_PROPOSAL_SECRET?.trim()
  if (explicit) return explicit
  const base = process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!base) throw new Error("Set AGENT_PROPOSAL_SECRET (or SUPABASE_SECRET_KEY) to sign agent proposals")
  return createHash("sha256").update(`sancus-agent-proposals:${base}`).digest("hex")
}

function payload(p: Omit<Proposal, "sig">): string {
  return JSON.stringify([p.id, p.kind, p.userId, p.expiresAt, p.request.method, p.request.path, p.request.body, p.request.idempotent])
}

export function signProposal(input: Omit<Proposal, "id" | "expiresAt" | "sig">, now = Date.now(), key = secret()): Proposal {
  const unsigned = { ...input, id: randomUUID(), expiresAt: new Date(now + TTL_MS).toISOString() }
  return { ...unsigned, sig: createHmac("sha256", key).update(payload(unsigned)).digest("hex") }
}

export type VerifyResult = { ok: true } | { ok: false; status: number; error: string }

export function verifyProposal(p: Proposal, userId: string, now = Date.now(), key = secret()): VerifyResult {
  if (!p || typeof p !== "object" || !p.sig || !p.request) return { ok: false, status: 400, error: "Invalid proposal" }
  const rule = ALLOWED[p.kind]
  if (!rule || rule.method !== p.request.method || !rule.path.test(p.request.path)) return { ok: false, status: 400, error: "That action isn't allowed" }
  const expected = Buffer.from(createHmac("sha256", key).update(payload(p)).digest("hex"), "hex")
  const given = Buffer.from(String(p.sig), "hex")
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, status: 400, error: "This proposal was changed. Ask the agent again." }
  if (p.userId !== userId) return { ok: false, status: 403, error: "This proposal belongs to someone else" }
  if (Date.parse(p.expiresAt) < now) return { ok: false, status: 410, error: "This proposal expired. Ask the agent to prepare it again." }
  return { ok: true }
}
