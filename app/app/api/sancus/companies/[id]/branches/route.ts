// Sancus: add a branch (or sub-branch) under a company node, with its first wallet.
// Requires Owner/Admin on the parent or any ancestor (checked in sancus_create_company).
import { NextResponse } from "next/server"
import { validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { createError, getCompany, idFromPath, nodeSchema, resolveNodeInput } from "@/lib/sancus/company-api"
import { createCompanyWallet } from "@/lib/sancus/company-wallets"

export const POST = withAuth(async (req, { user, supabase }) => {
  const parentId = idFromPath(req.nextUrl.pathname, "companies")
  if (!parentId) return NextResponse.json({ error: "Invalid company id" }, { status: 400 })

  const parsed = await validateJsonBody(req, nodeSchema)
  if (!parsed.ok) return parsed.response
  const input = resolveNodeInput(parsed.data)
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 })

  const parent = await getCompany(supabase, parentId)
  if (!parent) return NextResponse.json({ error: "Branch not found" }, { status: 404 })

  const { data: id, error } = await supabase.rpc("sancus_create_company", {
    p_parent: parentId,
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

  // The branch's wallet is created automatically with it, named after the branch.
  const wallet = await createCompanyWallet(supabase, user.id, company, `${company.name} wallet`)
  return NextResponse.json(
    { company, wallet: wallet.ok ? wallet.wallet : null, walletError: wallet.ok ? null : wallet.error },
    { status: 201 }
  )
})
