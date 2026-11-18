// Sancus: company-scoped spending policy (sancus_company_policies).
import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { capabilities, effectiveRole, type CompanyRow, type MembershipRow } from "@/lib/sancus/companies"
import { getCompany, idFromPath } from "@/lib/sancus/company-api"
import { parseToMinor, USDC_DECIMALS } from "@/lib/sancus/money"
import { loadCompanyPolicy, serializePolicy } from "@/lib/sancus/policy"

const bodySchema = z.object({
  approvalThreshold: z.string().max(20).optional(),
  perPaymentLimit: z.string().max(20).optional(),
  dailyLimit: z.string().max(20).optional(),
  blockedRecipients: z.array(z.string().min(1).max(140)).max(200).optional(),
})

export const GET = withAuth(async (req: NextRequest, { user, supabase }) => {
  const companyId = idFromPath(req.nextUrl.pathname, "companies")
  if (!companyId) return NextResponse.json({ error: "Invalid company id" }, { status: 400 })
  const company = await getCompany(supabase, companyId)
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 })

  const { data: companies } = await supabase
    .from("sancus_companies")
    .select("id, parent_id, root_id, name, country, base_currency, created_at")
    .eq("root_id", company.root_id)
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
    companyId
  )
  if (!actor.role) return NextResponse.json({ error: "No access" }, { status: 403 })

  const policy = await loadCompanyPolicy(supabase, companyId, user.id)
  return NextResponse.json({
    policy: serializePolicy(policy),
    companyId,
    canEdit: capabilities(actor.role).editPolicies,
  })
})

export const PUT = withAuth(async (req: NextRequest, { user, supabase }) => {
  const companyId = idFromPath(req.nextUrl.pathname, "companies")
  if (!companyId) return NextResponse.json({ error: "Invalid company id" }, { status: 400 })
  const company = await getCompany(supabase, companyId)
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 })

  const { data: companies } = await supabase
    .from("sancus_companies")
    .select("id, parent_id, root_id, name, country, base_currency, created_at")
    .eq("root_id", company.root_id)
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
    companyId
  )
  if (!actor.role || !capabilities(actor.role).editPolicies) {
    return NextResponse.json({ error: "Only an Owner or Admin can change company rules" }, { status: 403 })
  }

  const parsed = await validateJsonBody(req, bodySchema)
  if (!parsed.ok) return parsed.response

  const current = await loadCompanyPolicy(supabase, companyId, user.id)
  const toMinor = (v: string | undefined, fallback: bigint, field: string) => {
    if (v === undefined) return { ok: true as const, value: fallback }
    const m = parseToMinor(v, USDC_DECIMALS)
    return m === null || m <= 0n
      ? { ok: false as const, issue: { field, message: "Enter a positive dollar amount" } }
      : { ok: true as const, value: m }
  }

  const threshold = toMinor(parsed.data.approvalThreshold, current.approvalThresholdMinor, "approvalThreshold")
  const perPayment = toMinor(parsed.data.perPaymentLimit, current.perPaymentLimitMinor, "perPaymentLimit")
  const daily = toMinor(parsed.data.dailyLimit, current.dailyLimitMinor, "dailyLimit")
  const issues = [threshold, perPayment, daily].flatMap((r) => (r.ok ? [] : [r.issue]))
  if (issues.length) return NextResponse.json({ error: "Invalid policy", issues }, { status: 400 })
  if (!threshold.ok || !perPayment.ok || !daily.ok) {
    return NextResponse.json({ error: "Invalid policy" }, { status: 400 })
  }

  const { error } = await supabase.from("sancus_company_policies").upsert({
    company_id: companyId,
    approval_threshold_minor: threshold.value.toString(),
    per_payment_limit_minor: perPayment.value.toString(),
    daily_limit_minor: daily.value.toString(),
    blocked_recipients: parsed.data.blockedRecipients ?? current.blockedRecipients,
  })
  if (error) {
    console.error("company policy save", error)
    return NextResponse.json({ error: "Could not save rules" }, { status: 500 })
  }

  return NextResponse.json({
    policy: serializePolicy(await loadCompanyPolicy(supabase, companyId)),
    companyId,
  })
})
