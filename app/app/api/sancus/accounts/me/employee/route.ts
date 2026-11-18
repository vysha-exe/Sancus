// Sancus: what an employee sees. Their branch, spending limits, virtual card and QR methods.
import { NextResponse } from "next/server"
import { withAuth } from "@/lib/api/with-auth"
import { loadAccount } from "@/lib/sancus/accounts-server"

export const GET = withAuth(async (_req, { user, supabase }) => {
  const account = await loadAccount(supabase, user)
  const [{ data: memberships }, { data: methods }] = await Promise.all([
    supabase
      .from("sancus_memberships")
      .select("id, company_id, role, per_payment_limit_minor, daily_limit_minor")
      .eq("user_id", user.id)
      .eq("status", "ACTIVE"),
    // Issued by an admin; visible to the employee they belong to (RLS).
    supabase
      .from("sancus_spending_methods")
      .select("id, method_type, provider, label, currency, monthly_limit_minor, status, created_at")
      .eq("employee_id", user.id)
      .neq("status", "REVOKED")
      .order("created_at", { ascending: true }),
  ])
  const scope = account.scopes[0] ?? null
  const m = memberships?.[0]
  return NextResponse.json({
    account: account.toJSON(),
    firstName: (user.user_metadata?.first_name as string | undefined) ?? user.email?.split("@")[0] ?? "there",
    company: scope ? { id: scope.companyId, name: scope.companyName, country: scope.country, role: scope.role } : null,
    limits: {
      perPaymentMinor: m?.per_payment_limit_minor != null ? String(m.per_payment_limit_minor) : null,
      dailyMinor: m?.daily_limit_minor != null ? String(m.daily_limit_minor) : null,
    },
    methods: (methods ?? []).map((x) => ({
      id: x.id,
      type: x.method_type,
      provider: x.provider,
      label: x.label,
      currency: x.currency,
      monthlyLimitMinor: String(x.monthly_limit_minor),
      status: x.status,
    })),
  })
})
