// Sancus: one demo login per account type, so the demo can be opened as any of them.
//   admin       SANCUS_DEMO_EMAIL itself (owner of the demo global account)
//   branch      <local>+branch@<domain>    Branch admin of the demo company's first branch
//   employee    <local>+employee@<domain>  Employee in that branch, with limits and a virtual card
//   individual  <local>+individual@<domain> No business
// All share SANCUS_DEMO_PASSWORD. Created and wired up on first use with the service-role key.
// Server only; only reachable through demo login (see lib/sancus/demo-login.ts).

import type { SupabaseClient } from "@supabase/supabase-js"

export type DemoAs = "admin" | "branch" | "employee" | "individual"
export const DEMO_AS: DemoAs[] = ["admin", "branch", "employee", "individual"]
export const DEMO_HOME: Record<DemoAs, string> = { admin: "/home", branch: "/branch", employee: "/me", individual: "/home" }
const DEMO_NAMES: Record<DemoAs, string> = { admin: "Maya", branch: "Ploy", employee: "Niran", individual: "Alex" }

export function parseDemoAs(v: string | null | undefined): DemoAs {
  return DEMO_AS.includes(v as DemoAs) ? (v as DemoAs) : "admin"
}

export function demoEmailFor(baseEmail: string, as: DemoAs): string {
  if (as === "admin") return baseEmail
  const [local, domain] = baseEmail.split("@")
  return `${local}+${as}@${domain}`
}

async function findUserId(admin: SupabaseClient, email: string): Promise<string | null> {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) return null
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (hit) return hit.id
    if (data.users.length < 200) return null
  }
  return null
}

async function ensureUser(admin: SupabaseClient, email: string, password: string, firstName: string): Promise<string> {
  const existing = await findUserId(admin, email)
  if (existing) return existing
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { first_name: firstName } })
  if (error || !data.user) throw new Error(`couldn't create ${email}: ${error?.message}`)
  return data.user.id
}

/** The demo admin's global account and a branch under it (created if missing). */
async function ensureDemoCompany(admin: SupabaseClient, adminId: string): Promise<{ rootId: string; branchId: string }> {
  const { data: owned } = await admin
    .from("sancus_memberships")
    .select("company_id")
    .eq("user_id", adminId)
    .eq("status", "ACTIVE")
    .in("role", ["OWNER", "ADMIN"])
  const ownedIds = (owned ?? []).map((m) => m.company_id as string)
  let rootId: string | null = null
  if (ownedIds.length) {
    const { data: roots } = await admin.from("sancus_companies").select("id").in("id", ownedIds).is("parent_id", null).order("created_at").limit(1)
    rootId = (roots?.[0]?.id as string | undefined) ?? null
  }
  if (!rootId) {
    const { data: root, error } = await admin
      .from("sancus_companies")
      .insert({ parent_id: null, root_id: "00000000-0000-0000-0000-000000000000", name: "Lion City Trading", country: "SG", base_currency: "SGD", created_by: adminId })
      .select("id")
      .single()
    if (error || !root) throw new Error(`couldn't create demo company: ${error?.message}`)
    rootId = root.id as string
    await admin.from("sancus_memberships").insert({ company_id: rootId, user_id: adminId, role: "OWNER", status: "ACTIVE" })
  }
  const { data: branches } = await admin.from("sancus_companies").select("id, country").eq("parent_id", rootId).order("created_at")
  let branchId = ((branches ?? []).find((b) => b.country === "TH") ?? branches?.[0])?.id as string | undefined
  if (!branchId) {
    const { data: b, error } = await admin
      .from("sancus_companies")
      .insert({ parent_id: rootId, root_id: rootId, name: "Thailand", country: "TH", base_currency: "THB", created_by: adminId })
      .select("id")
      .single()
    if (error || !b) throw new Error(`couldn't create demo branch: ${error?.message}`)
    branchId = b.id as string
  }
  return { rootId, branchId }
}

async function ensureMembership(admin: SupabaseClient, companyId: string, userId: string, email: string, role: "ADMIN" | "EMPLOYEE") {
  const { data } = await admin.from("sancus_memberships").select("id").eq("company_id", companyId).eq("user_id", userId).maybeSingle()
  if (data) return
  const { error } = await admin.from("sancus_memberships").insert({
    company_id: companyId,
    user_id: userId,
    invited_email: email,
    role,
    status: "ACTIVE",
    accepted_at: new Date().toISOString(),
    per_payment_limit_minor: role === "EMPLOYEE" ? "500000000" : null, // $500
    daily_limit_minor: role === "EMPLOYEE" ? "1000000000" : null, // $1,000
  })
  if (error) throw new Error(`couldn't add demo membership: ${error.message}`)
}

async function ensureEmployeeMethods(admin: SupabaseClient, adminId: string, employeeId: string, name: string) {
  const { data } = await admin.from("sancus_spending_methods").select("id").eq("employee_id", employeeId).limit(1)
  if (data?.length) return
  await admin.from("sancus_spending_methods").insert([
    { user_id: adminId, employee_id: employeeId, employee_name: name, method_type: "CARD", provider: "SIMULATED", currency: "USD", label: "Virtual card", monthly_limit_minor: "300000" },
    { user_id: adminId, employee_id: employeeId, employee_name: name, method_type: "PROMPTPAY", provider: "SIMULATED", currency: "THB", label: "PromptPay QR (Bangkok trip)", monthly_limit_minor: "2000000" },
  ])
}

/** Makes sure the demo login for `as` exists and has the right access. Returns its credentials. */
export async function ensureDemoAccount(
  admin: SupabaseClient,
  base: { email: string; password: string },
  as: DemoAs
): Promise<{ email: string; password: string }> {
  const email = demoEmailFor(base.email, as)
  if (as === "admin") return { email, password: base.password }
  const userId = await ensureUser(admin, email, base.password, DEMO_NAMES[as])
  if (as === "individual") return { email, password: base.password }

  const adminId = await ensureUser(admin, base.email, base.password, DEMO_NAMES.admin)
  const { branchId } = await ensureDemoCompany(admin, adminId)
  await ensureMembership(admin, branchId, userId, email, as === "branch" ? "ADMIN" : "EMPLOYEE")
  if (as === "employee") await ensureEmployeeMethods(admin, adminId, userId, DEMO_NAMES.employee)
  return { email, password: base.password }
}
