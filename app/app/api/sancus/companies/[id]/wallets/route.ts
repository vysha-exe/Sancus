// Sancus: add another wallet to a company node (global account, branch or sub-branch).
import { NextResponse } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { getCompany, idFromPath } from "@/lib/sancus/company-api"
import { createCompanyWallet } from "@/lib/sancus/company-wallets"

const bodySchema = z.object({ name: z.string().trim().min(1, "Give the wallet a name").max(80) })

export const POST = withAuth(async (req, { user, supabase }) => {
  const companyId = idFromPath(req.nextUrl.pathname, "companies")
  if (!companyId) return NextResponse.json({ error: "Invalid company id" }, { status: 400 })

  const parsed = await validateJsonBody(req, bodySchema)
  if (!parsed.ok) return parsed.response

  const company = await getCompany(supabase, companyId)
  if (!company) return NextResponse.json({ error: "Branch not found" }, { status: 404 })

  // Same rule the database enforces on insert: Owner/Admin here or on an ancestor.
  const { data: canManage } = await supabase.rpc("sancus_can_manage_company", { p_user: user.id, p_company: companyId })
  if (!canManage) {
    return NextResponse.json({ error: "Only an Owner or Admin of this branch can add wallets" }, { status: 403 })
  }

  const result = await createCompanyWallet(supabase, user.id, company, parsed.data.name)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ wallet: result.wallet }, { status: 201 })
})
