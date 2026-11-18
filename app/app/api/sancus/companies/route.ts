// Sancus: create the global account (root company) + its first wallet.
import { NextResponse } from "next/server"
import { validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { createError, getCompany, nodeSchema, resolveNodeInput } from "@/lib/sancus/company-api"
import { createCompanyWallet } from "@/lib/sancus/company-wallets"

export const POST = withAuth(async (req, { user, supabase }) => {
  const parsed = await validateJsonBody(req, nodeSchema)
  if (!parsed.ok) return parsed.response
  const input = resolveNodeInput(parsed.data)
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 })

  const { data: adminMemberships, error: membershipError } = await supabase
    .from("sancus_memberships")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("status", "ACTIVE")
    .in("role", ["OWNER", "ADMIN"])
  if (membershipError) return NextResponse.json({ error: "Could not check your existing company" }, { status: 500 })
  const managedIds = (adminMemberships ?? []).map((membership) => membership.company_id as string)
  if (managedIds.length) {
    const { data: existingParents, error: parentError } = await supabase
      .from("sancus_companies")
      .select("id")
      .in("id", managedIds)
      .is("parent_id", null)
      .limit(1)
    if (parentError) return NextResponse.json({ error: "Could not check your existing company" }, { status: 500 })
    if (existingParents?.length) {
      return NextResponse.json({ error: "This admin already has a parent company. Add branches beneath it instead." }, { status: 409 })
    }
  }

  const { data: id, error } = await supabase.rpc("sancus_create_company", {
    p_parent: null,
    p_name: input.name,
    p_country: input.country,
    p_currency: input.currency,
  })
  if (error || !id) {
    const e = createError(error?.message ?? "")
    return NextResponse.json({ error: e.error }, { status: e.status })
  }

  const company = await getCompany(supabase, id as string)
  if (!company) return NextResponse.json({ error: "Created, but couldn't read it back" }, { status: 500 })

  // Every node gets exactly one wallet, created automatically and named after it.
  const wallet = await createCompanyWallet(supabase, user.id, company, `${company.name} wallet`)
  return NextResponse.json(
    { company, wallet: wallet.ok ? wallet.wallet : null, walletError: wallet.ok ? null : wallet.error },
    { status: 201 }
  )
})
