// Sancus: change a member's role, limits, or disable them.
import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { capabilities, effectiveRole, type CompanyRow, type MembershipRow, type Role } from "@/lib/sancus/companies"
import { canAssignRole } from "@/lib/sancus/members"

const patchSchema = z.object({
  role: z.enum(["OWNER", "ADMIN", "FINANCE", "EMPLOYEE", "VIEWER"]).optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
  perPaymentLimitUsd: z.string().max(20).optional(),
  dailyLimitUsd: z.string().max(20).optional(),
})

function memberId(req: NextRequest): string | null {
  const id = req.nextUrl.pathname.split("/").filter(Boolean).pop()
  return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null
}

export const GET = withAuth(async (req, { user, supabase }) => {
  const id = memberId(req)
  if (!id) return NextResponse.json({ error: "Invalid member id" }, { status: 400 })
  const requestedCompanyId = req.nextUrl.searchParams.get("companyId")
  if (requestedCompanyId && !/^[0-9a-f-]{36}$/i.test(requestedCompanyId)) {
    return NextResponse.json({ error: "Invalid company id" }, { status: 400 })
  }

  const { data: row } = await supabase
    .from("sancus_memberships")
    .select("id, company_id, user_id, invited_email, role, status, per_payment_limit_minor, daily_limit_minor, created_at, accepted_at")
    .eq("id", id)
    .maybeSingle()
  if (!row) return NextResponse.json({ error: "Member not found" }, { status: 404 })

  const { data: company } = await supabase
    .from("sancus_companies")
    .select("id, parent_id, root_id, name, country, base_currency, created_at")
    .eq("id", row.company_id)
    .maybeSingle()
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 })

  const { data: companies } = await supabase
    .from("sancus_companies")
    .select("id, parent_id, root_id, name, country, base_currency, created_at")
    .eq("root_id", (company as CompanyRow).root_id)
  const { data: memberships } = await supabase
    .from("sancus_memberships")
    .select("company_id, user_id, role, status")
    .in(
      "company_id",
      ((companies ?? []) as CompanyRow[]).map((c) => c.id)
    )

  const companyRows = (companies ?? []) as CompanyRow[]
  const scopedCompany = requestedCompanyId
    ? companyRows.find((candidate) => candidate.id === requestedCompanyId)
    : company as CompanyRow
  if (!scopedCompany) return NextResponse.json({ error: "Company not found" }, { status: 404 })

  const actor = effectiveRole(
    companyRows,
    (memberships ?? []) as MembershipRow[],
    user.id,
    scopedCompany.id
  )
  if (!actor.role) return NextResponse.json({ error: "No access" }, { status: 403 })
  const memberRole = row.user_id
    ? effectiveRole(companyRows, (memberships ?? []) as MembershipRow[], row.user_id, scopedCompany.id).role
    : null
  if (requestedCompanyId && (row.status !== "ACTIVE" || (memberRole !== "EMPLOYEE" && memberRole !== "FINANCE"))) {
    return NextResponse.json({ error: "This person is not an active employee in the selected company" }, { status: 400 })
  }

  return NextResponse.json({
    member: {
      id: row.id,
      companyId: scopedCompany.id,
      userId: row.user_id,
      email: row.invited_email,
      role: memberRole ?? row.role,
      status: row.status,
      roleInherited: scopedCompany.id !== row.company_id,
      perPaymentLimitMinor: row.per_payment_limit_minor != null ? String(row.per_payment_limit_minor) : null,
      dailyLimitMinor: row.daily_limit_minor != null ? String(row.daily_limit_minor) : null,
      invitedAt: row.created_at,
      acceptedAt: row.accepted_at,
    },
    company: {
      id: scopedCompany.id,
      name: scopedCompany.name,
      country: scopedCompany.country,
      currency: scopedCompany.base_currency,
    },
    can: capabilities(actor.role),
    actorRole: actor.role,
  })
})

export const PATCH = withAuth(async (req, { user, supabase }) => {
  const id = memberId(req)
  if (!id) return NextResponse.json({ error: "Invalid member id" }, { status: 400 })

  const parsed = await validateJsonBody(req, patchSchema)
  if (!parsed.ok) return parsed.response

  const { data: row } = await supabase
    .from("sancus_memberships")
    .select("id, company_id, user_id, role, status, invited_email")
    .eq("id", id)
    .maybeSingle()
  if (!row) return NextResponse.json({ error: "Member not found" }, { status: 404 })

  const { data: company } = await supabase
    .from("sancus_companies")
    .select("id, parent_id, root_id, name, country, base_currency, created_at")
    .eq("id", row.company_id)
    .maybeSingle()
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 })

  const { data: companies } = await supabase
    .from("sancus_companies")
    .select("id, parent_id, root_id, name, country, base_currency, created_at")
    .eq("root_id", (company as CompanyRow).root_id)
  const { data: memberships } = await supabase
    .from("sancus_memberships")
    .select("company_id, user_id, role, status")
    .in(
      "company_id",
      ((companies ?? []) as CompanyRow[]).map((c) => c.id)
    )

  const actor = effectiveRole(
    (companies ?? []) as CompanyRow[],
    (memberships ?? []) as MembershipRow[],
    user.id,
    row.company_id
  )
  if (!actor.role || !capabilities(actor.role).invite) {
    return NextResponse.json({ error: "Only an Owner or Admin can change roles" }, { status: 403 })
  }

  const nextRole = (parsed.data.role ?? row.role) as Role
  if (parsed.data.role && !canAssignRole(actor.role, nextRole)) {
    return NextResponse.json({ error: `You can't set someone to ${nextRole}` }, { status: 403 })
  }
  if (row.role === "OWNER" && actor.role !== "OWNER") {
    return NextResponse.json({ error: "Only an Owner can change another Owner" }, { status: 403 })
  }

  const update: Record<string, unknown> = {}
  if (parsed.data.role) update.role = parsed.data.role
  if (parsed.data.status) update.status = parsed.data.status

  // Optional USD limits → USDC minor (6 decimals), same as policies.
  const { parseToMinor, USDC_DECIMALS } = await import("@/lib/sancus/money")
  if (parsed.data.perPaymentLimitUsd !== undefined) {
    const m = parseToMinor(parsed.data.perPaymentLimitUsd.replace(/[$,]/g, ""), USDC_DECIMALS)
    if (m === null || m < 0n) return NextResponse.json({ error: "Invalid per-payment limit" }, { status: 400 })
    update.per_payment_limit_minor = m.toString()
  }
  if (parsed.data.dailyLimitUsd !== undefined) {
    const m = parseToMinor(parsed.data.dailyLimitUsd.replace(/[$,]/g, ""), USDC_DECIMALS)
    if (m === null || m < 0n) return NextResponse.json({ error: "Invalid daily limit" }, { status: 400 })
    update.daily_limit_minor = m.toString()
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
  }

  const { data: updated, error } = await supabase
    .from("sancus_memberships")
    .update(update)
    .eq("id", id)
    .select("id, company_id, user_id, invited_email, role, status, per_payment_limit_minor, daily_limit_minor, created_at, accepted_at")
    .single()

  if (error || !updated) {
    console.error("member patch failed", error)
    return NextResponse.json({ error: "Could not update member" }, { status: 500 })
  }

  if (updated.user_id) {
    await supabase.from("sancus_notifications").insert({
      user_id: updated.user_id,
      type: "role_changed",
      payload: { membershipId: id, role: updated.role, status: updated.status, companyId: row.company_id },
    })
  }

  return NextResponse.json({
    member: {
      id: updated.id,
      companyId: updated.company_id,
      userId: updated.user_id,
      email: updated.invited_email,
      role: updated.role,
      status: updated.status,
      roleInherited: false,
      perPaymentLimitMinor: updated.per_payment_limit_minor != null ? String(updated.per_payment_limit_minor) : null,
      dailyLimitMinor: updated.daily_limit_minor != null ? String(updated.daily_limit_minor) : null,
      invitedAt: updated.created_at,
      acceptedAt: updated.accepted_at,
    },
  })
})
