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

  const wallet = await createCompanyWallet(supabase, user.id, company, parsed.data.walletName || "Global treasury")
  return NextResponse.json(
    { company, wallet: wallet.ok ? wallet.wallet : null, walletError: wallet.ok ? null : wallet.error },
    { status: 201 }
  )
})
