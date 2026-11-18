// Sancus agent: run a proposal the person confirmed. Verifies the signature (exact request, this
// person, not expired), then calls the same API the UI uses, as the person, so permissions,
// spending policy and approvals still decide. Records the action for the agent activity list.
import { NextResponse } from "next/server"
import { withAuth } from "@/lib/api/with-auth"
import { verifyProposal, type Proposal } from "@/lib/sancus/agent/proposals"
import { workspaceCompany } from "@/lib/sancus/workspace-server"

export const POST = withAuth(async (req, { user, supabase }) => {
  const body = (await req.json().catch(() => null)) as { proposal?: Proposal } | null
  const p = body?.proposal
  if (!p) return NextResponse.json({ error: "Missing proposal" }, { status: 400 })
  const check = verifyProposal(p, user.id)
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status })

  const res = await fetch(new URL(p.request.path, req.nextUrl.origin), {
    method: p.request.method,
    headers: {
      cookie: req.headers.get("cookie") ?? "",
      "content-type": "application/json",
      // One proposal → at most one payment, however many times Confirm is clicked.
      ...(p.request.idempotent ? { "idempotency-key": `agent-${p.id}` } : {}),
    },
    body: JSON.stringify(p.request.body),
    cache: "no-store",
  })
  const result = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: (result.error as string) ?? `That didn't go through (${res.status})` }, { status: res.status })
  }

  const record = (result.payout ?? result.payment ?? result.collection ?? result) as Record<string, unknown>
  const status = (record.status as string | undefined) ?? "done"
  // A repeated Confirm returns the original payment; don't log it twice.
  if (result.replayed) {
    return NextResponse.json({ ok: true, status, needsApproval: status === "PENDING_APPROVAL", result: record, replayed: true })
  }
  await supabase.from("sancus_agent_actions").insert({
    user_id: user.id,
    company_id: await workspaceCompany(req, supabase, user.id),
    kind: "executed",
    summary: p.title,
    cost_minor: 0,
    reference: (record.id as string | undefined) ?? p.id,
    detail: { kind: p.kind, status, replayed: Boolean(result.replayed) },
  })
  return NextResponse.json({ ok: true, status, needsApproval: status === "PENDING_APPROVAL" || Boolean(result.needsApproval), result: record })
})
