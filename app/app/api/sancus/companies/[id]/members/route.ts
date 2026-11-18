// Sancus: list members + invite someone to a company node.
import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { capabilities, effectiveRole, ROLE_LABEL, type CompanyRow, type MembershipRow, type Role } from "@/lib/sancus/companies"
import { getCompany, idFromPath } from "@/lib/sancus/company-api"
import { canAssignRole, inviteExpiresAt, INVITE_ROLES, newInviteToken, type MemberDto } from "@/lib/sancus/members"

const inviteSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(200),
  role: z.enum(["ADMIN", "FINANCE", "EMPLOYEE", "VIEWER"]),
  // UI radios; both currently insert on this node (inheritance covers descendants).
  accessScope: z.enum(["and-below", "this-only"]).optional(),
  perPaymentLimitMinor: z.string().regex(/^\d+$/).nullable().optional(),
  monthlyLimitMinor: z.string().regex(/^\d+$/).nullable().optional(),
})

async function loadTree(supabase: Parameters<Parameters<typeof withAuth>[0]>[1]["supabase"], rootId: string) {
  const { data } = await supabase
    .from("sancus_companies")
    .select("id, parent_id, root_id, name, country, base_currency, created_at")
    .eq("root_id", rootId)
  return (data ?? []) as CompanyRow[]
}

function toDto(
  row: {
    id: string
    company_id: string
    user_id: string | null
    invited_email: string | null
    role: Role
    status: string
    per_payment_limit_minor?: number | string | null
    daily_limit_minor?: number | string | null
    created_at?: string
    accepted_at?: string | null
  },
  inherited: boolean
): MemberDto {
  return {
    id: row.id,
    companyId: row.company_id,
    userId: row.user_id,
    email: row.invited_email,
    role: row.role,
    status: row.status,
    roleInherited: inherited,
    perPaymentLimitMinor: row.per_payment_limit_minor != null ? String(row.per_payment_limit_minor) : null,
    dailyLimitMinor: row.daily_limit_minor != null ? String(row.daily_limit_minor) : null,
    invitedAt: row.created_at ?? null,
    acceptedAt: row.accepted_at ?? null,
  }
}

export const GET = withAuth(async (req, { user, supabase }) => {
  const companyId = idFromPath(req.nextUrl.pathname, "companies")
  if (!companyId) return NextResponse.json({ error: "Invalid company id" }, { status: 400 })

  const company = await getCompany(supabase, companyId)
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 })

  const companies = await loadTree(supabase, company.root_id)
  const { data: memberships } = await supabase
    .from("sancus_memberships")
    .select("id, company_id, user_id, invited_email, role, status, per_payment_limit_minor, daily_limit_minor, created_at, accepted_at")
    .in(
      "company_id",
      companies.map((c) => c.id)
    )
    .neq("status", "DISABLED")
    .order("created_at", { ascending: true })

  type Row = {
    id: string
    company_id: string
    user_id: string | null
    invited_email: string | null
    role: Role
    status: string
    per_payment_limit_minor?: number | string | null
    daily_limit_minor?: number | string | null
    created_at?: string
    accepted_at?: string | null
  }
  const rows = (memberships ?? []) as Row[]
  const asMembership = rows as unknown as MembershipRow[]

  const actor = effectiveRole(companies, asMembership, user.id, companyId)
  if (!actor.role) return NextResponse.json({ error: "No access" }, { status: 403 })

  // Local memberships on this node + inherited-looking rows from ancestors (for display).
  const local = rows.filter((m) => m.company_id === companyId)
  const members: MemberDto[] = local.map((m) => toDto(m, false))

  // Also show people who only have an ancestor membership (inherited access).
  for (const m of rows) {
    if (m.company_id === companyId) continue
    if (m.status !== "ACTIVE" || !m.user_id) continue
    const eff = effectiveRole(companies, asMembership, m.user_id, companyId)
    if (!eff.role || !eff.inherited) continue
    if (members.some((x) => x.userId === m.user_id)) continue
    members.push(toDto({ ...m, role: eff.role, company_id: companyId }, true))
  }

  return NextResponse.json({
    companyId,
    role: actor.role,
    can: capabilities(actor.role),
    members,
    inviteRoles: INVITE_ROLES.filter((r) => canAssignRole(actor.role!, r)),
  })
})

export const POST = withAuth(async (req: NextRequest, { user, supabase }) => {
  const companyId = idFromPath(req.nextUrl.pathname, "companies")
  if (!companyId) return NextResponse.json({ error: "Invalid company id" }, { status: 400 })

  const company = await getCompany(supabase, companyId)
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 })

  const companies = await loadTree(supabase, company.root_id)
  const { data: memberships } = await supabase
    .from("sancus_memberships")
    .select("company_id, user_id, role, status")
    .in(
      "company_id",
      companies.map((c) => c.id)
    )
  const actor = effectiveRole(companies, (memberships ?? []) as MembershipRow[], user.id, companyId)
  if (!actor.role || !capabilities(actor.role).invite) {
    return NextResponse.json({ error: "Only an Owner or Admin can invite people" }, { status: 403 })
  }

  const parsed = await validateJsonBody(req, inviteSchema)
  if (!parsed.ok) return parsed.response
  const { email, role, perPaymentLimitMinor, monthlyLimitMinor } = parsed.data
  if (!canAssignRole(actor.role, role)) {
    return NextResponse.json(
      { error: `You can't invite someone as ${ROLE_LABEL[role]}. Only an Owner can make someone an Owner.` },
      { status: 403 }
    )
  }

  const emailNorm = email.toLowerCase()
  const { data: existingInvite } = await supabase
    .from("sancus_memberships")
    .select("id, role, status")
    .eq("company_id", companyId)
    .eq("invited_email", emailNorm)
    .in("status", ["INVITED", "ACTIVE"])
    .maybeSingle()
  if (existingInvite) {
    const existingRole = (existingInvite as { role?: Role }).role
    return NextResponse.json(
      {
        error: existingRole
          ? `They're already on this branch as ${ROLE_LABEL[existingRole]}. Change their role from their profile.`
          : "They're already on this branch. Change their role from their profile.",
      },
      { status: 409 }
    )
  }

  const token = newInviteToken()
  const { data, error } = await supabase
    .from("sancus_memberships")
    .insert({
      company_id: companyId,
      user_id: null,
      role,
      status: "INVITED",
      invited_by: user.id,
      invited_email: emailNorm,
      invite_token: token,
      expires_at: inviteExpiresAt(),
      per_payment_limit_minor: perPaymentLimitMinor ? Number(perPaymentLimitMinor) : null,
      daily_limit_minor: monthlyLimitMinor ? Number(monthlyLimitMinor) : null,
    })
    .select("id, company_id, user_id, invited_email, role, status, created_at, accepted_at")
    .single()

  if (error) {
    if (/unique|duplicate/i.test(error.message)) {
      return NextResponse.json(
        { error: "They're already on this branch. Change their role from their profile." },
        { status: 409 }
      )
    }
    console.error("invite failed", error)
    return NextResponse.json({ error: "Could not send invite" }, { status: 500 })
  }

  // Notify inviter's copy isn't useful; stub notification row keyed to inviter for demo inbox.
  await supabase.from("sancus_notifications").insert({
    user_id: user.id,
    type: "invite_sent",
    payload: { email, role, companyId, companyName: company.name, token },
  })

  return NextResponse.json(
    {
      member: toDto(data, false),
      inviteToken: token,
      // Demo: no email provider — return accept path for the UI to copy.
      acceptPath: `/api/sancus/invites/${token}/accept`,
    },
    { status: 201 }
  )
})
