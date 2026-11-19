// Sancus: login accounts a business creates for its people.
//   GET  → everyone you manage (admin: the whole company; branch admin: their branch and below)
//   POST → create a Branch admin login (admin only; optionally creates the branch too) or an
//          Employee login (admin anywhere, branch admin inside their branch). Returns a one-time
//          temporary password to hand over. Employees also get a virtual card with their limit.
import { randomBytes } from "node:crypto"
import { NextResponse } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { loadAccount } from "@/lib/sancus/accounts-server"
import { createCompanyForUser, createError, getCompany, resolveNodeInput } from "@/lib/sancus/company-api"
import { createCompanyWallet } from "@/lib/sancus/company-wallets"

const createSchema = z.object({
  type: z.enum(["BRANCH", "EMPLOYEE"]),
  /** Existing node to attach the login to. For a new branch: the parent (defaults to the global account). */
  companyId: z.string().uuid().optional(),
  newBranch: z.object({ name: z.string().trim().min(2).max(80), country: z.string().length(2) }).optional(),
  firstName: z.string().trim().min(1).max(60),
  email: z.string().trim().toLowerCase().email().max(200),
  /** USDC minor units (6 dp). */
  perPaymentLimitMinor: z.string().regex(/^\d+$/).optional(),
  dailyLimitMinor: z.string().regex(/^\d+$/).optional(),
})

type MemberRow = {
  id: string
  company_id: string
  user_id: string | null
  invited_email: string | null
  role: string
  status: string
  per_payment_limit_minor: number | string | null
  daily_limit_minor: number | string | null
  created_at: string
}

/** Display names for people (from their login profile). Falls back to the email when unavailable. */
async function displayNames(userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secret = process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !secret || !userIds.length) return out
  try {
    const admin = createAdminClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } })
    const wanted = new Set(userIds)
    for (let page = 1; page <= 5 && out.size < wanted.size; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
      if (error) break
      for (const u of data.users) {
        if (!wanted.has(u.id)) continue
        const m = u.user_metadata ?? {}
        const name = [m.first_name, m.last_name].filter(Boolean).join(" ")
        if (name) out.set(u.id, name)
      }
      if (data.users.length < 200) break
    }
  } catch {
    /* names are cosmetic */
  }
  return out
}

function nameFromEmail(email: string | null): string {
  if (!email) return "Invited"
  const local = email.split("@")[0]!.split("+")[0]!
  return local.split(/[._-]/).filter(Boolean).map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ")
}

export const GET = withAuth(async (_req, { user, supabase }) => {
  const account = await loadAccount(supabase, user)
  const ids = account.manageableCompanyIds()
  if (!ids.length) return NextResponse.json({ account: account.toJSON(), companies: [], people: [] })
  const [{ data: companies }, { data: members }] = await Promise.all([
    supabase.from("sancus_companies").select("id, parent_id, name, country").in("id", ids),
    supabase
      .from("sancus_memberships")
      .select("id, company_id, user_id, invited_email, role, status, per_payment_limit_minor, daily_limit_minor, created_at")
      .in("company_id", ids)
      .order("created_at", { ascending: true }),
  ])
  const byId = new Map((companies ?? []).map((c) => [c.id as string, c]))
  const rows = ((members ?? []) as MemberRow[]).filter((m) => m.user_id !== user.id)
  const names = await displayNames(rows.map((m) => m.user_id).filter((id): id is string => Boolean(id)))
  const people = rows
    .map((m) => ({
      membershipId: m.id,
      name: (m.user_id && names.get(m.user_id)) || nameFromEmail(m.invited_email),
      companyId: m.company_id,
      companyName: (byId.get(m.company_id)?.name as string | undefined) ?? "",
      email: m.invited_email,
      accountType: m.role === "OWNER" || m.role === "ADMIN" ? (byId.get(m.company_id)?.parent_id ? "BRANCH" : "ADMIN") : "EMPLOYEE",
      role: m.role,
      status: m.status,
      perPaymentLimitMinor: m.per_payment_limit_minor != null ? String(m.per_payment_limit_minor) : null,
      dailyLimitMinor: m.daily_limit_minor != null ? String(m.daily_limit_minor) : null,
      createdAt: m.created_at,
    }))
  return NextResponse.json({
    account: account.toJSON(),
    companies: (companies ?? []).map((c) => ({ id: c.id, parentId: c.parent_id, name: c.name, country: c.country })),
    people,
  })
})

export const POST = withAuth(async (req, { user, supabase }) => {
  const parsed = await validateJsonBody(req, createSchema)
  if (!parsed.ok) return parsed.response
  const input = parsed.data
  let actor = await loadAccount(supabase, user)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secret = process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !secret) return NextResponse.json({ error: "Creating logins needs SUPABASE_SECRET_KEY on the server" }, { status: 503 })

  // 1. Where the login goes. A new country branch can be created first by the
  // global admin, either for its first employee or its branch admin.
  let companyId = input.companyId
  let branchCreated: { id: string; name: string; walletAddress: string | null } | null = null
  if (input.newBranch) {
    if (!actor.can("branches.create")) {
      return NextResponse.json({ error: "Only the global account's admin can add branches" }, { status: 403 })
    }
    const parentId = companyId ?? actor.scopes.find((s) => s.isRoot)?.companyId
    if (!parentId) return NextResponse.json({ error: "Create your global account first" }, { status: 409 })
    const node = resolveNodeInput(input.newBranch)
    if (!node.ok) return NextResponse.json({ error: node.error }, { status: 400 })
    const created = await createCompanyForUser(supabase, user.id, { parentId, ...node })
    if (created.error || !created.id) {
      const e = createError(created.error ?? "")
      return NextResponse.json({ error: e.error }, { status: e.status })
    }
    const company = await getCompany(supabase, created.id)
    if (!company) return NextResponse.json({ error: "Branch created but couldn't be read back" }, { status: 500 })
    const wallet = await createCompanyWallet(supabase, user.id, company, `${company.name} wallet`)
    branchCreated = { id: company.id, name: company.name, walletAddress: wallet.ok ? wallet.wallet.address : null }
    companyId = company.id
    actor = await loadAccount(supabase, user) // the new branch is now in scope
  }
  if (!companyId) return NextResponse.json({ error: "Pick a branch for this login" }, { status: 400 })
  if (!actor.canCreateAccount(input.type, companyId)) {
    const why =
      input.type === "BRANCH"
        ? "Branch logins can only be created by the global admin, on a branch"
        : "You can only add employees to branches you manage"
    return NextResponse.json({ error: why }, { status: 403 })
  }

  // 2. The login itself (confirmed, with a one-time temporary password).
  const admin = createAdminClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } })
  const tempPassword = `Sx-${randomBytes(9).toString("base64url")}`
  const created = await admin.auth.admin.createUser({
    email: input.email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { first_name: input.firstName, account_type: input.type, created_by: user.id },
  })
  if (created.error || !created.data.user) {
    const taken = /already|registered|exists/i.test(created.error?.message ?? "")
    return NextResponse.json(
      { error: taken ? "That email already has a Sancus login. Invite them from Team instead." : (created.error?.message ?? "Couldn't create the login") },
      { status: taken ? 409 : 502 }
    )
  }
  const newUserId = created.data.user.id

  // 3. Their role on the branch (inserted as the actor, so database rules apply too).
  const { data: membership, error: mErr } = await supabase
    .from("sancus_memberships")
    .insert({
      company_id: companyId,
      user_id: newUserId,
      invited_email: input.email,
      role: input.type === "BRANCH" ? "ADMIN" : "EMPLOYEE",
      status: "ACTIVE",
      accepted_at: new Date().toISOString(),
      per_payment_limit_minor: input.type === "EMPLOYEE" ? (input.perPaymentLimitMinor ?? "500000000") : null,
      daily_limit_minor: input.type === "EMPLOYEE" ? (input.dailyLimitMinor ?? "1000000000") : null,
    })
    .select("id")
    .single()
  if (mErr || !membership) {
    await admin.auth.admin.deleteUser(newUserId) // don't leave a login with no access
    console.error("Failed to add membership for new login", mErr)
    return NextResponse.json({ error: "Couldn't give the new login access to that branch" }, { status: 500 })
  }

  // 4. Employees get company-funded virtual access capped at their daily limit × 30.
  let cardIssued = false
  if (input.type === "EMPLOYEE") {
    const [{ data: fundingCompany }, { data: fundingAccount }] = await Promise.all([
      admin.from("sancus_companies").select("base_currency").eq("id", companyId).maybeSingle(),
      admin.from("sancus_receive_accounts").select("id").eq("company_id", companyId).maybeSingle(),
    ])
    const dailyUsdc = BigInt(input.dailyLimitMinor ?? "1000000000")
    const monthlyCents = (dailyUsdc / 10_000n) * 30n
    if (fundingCompany?.base_currency && fundingAccount?.id) {
      const { error: cErr } = await admin.from("sancus_spending_methods").insert({
        user_id: user.id,
        company_id: companyId,
        funding_account_id: fundingAccount.id,
        employee_id: newUserId,
        employee_name: input.firstName,
        method_type: "CARD",
        provider: "SIMULATED",
        currency: fundingCompany.base_currency,
        label: "Virtual card",
        monthly_limit_minor: monthlyCents.toString(),
      })
      cardIssued = !cErr
      if (cErr) console.warn("Virtual card not issued", cErr.message)
    }
  }

  return NextResponse.json(
    {
      login: { email: input.email, temporaryPassword: tempPassword, type: input.type },
      membershipId: membership.id,
      companyId,
      branchCreated,
      cardIssued,
    },
    { status: 201 }
  )
})
