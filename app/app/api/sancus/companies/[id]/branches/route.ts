// Sancus: add a direct country branch under the single global treasury.
import { NextResponse } from "next/server"
import { validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { createCompanyForUser, createError, getCompany, idFromPath, nodeSchema, resolveNodeInput } from "@/lib/sancus/company-api"
import { createCompanyWallet } from "@/lib/sancus/company-wallets"
import { ensureCompanyReceiveAccount } from "@/lib/sancus/receive-accounts"
import { serviceOrUser } from "@/lib/sancus/service-client"

export const POST = withAuth(async (req, { user, supabase }) => {
  const parentId = idFromPath(req.nextUrl.pathname, "companies")
  if (!parentId) return NextResponse.json({ error: "Invalid company id" }, { status: 400 })

  const parsed = await validateJsonBody(req, nodeSchema)
  if (!parsed.ok) return parsed.response
  const input = resolveNodeInput(parsed.data)
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 })

  const parent = await getCompany(supabase, parentId)
  if (!parent) return NextResponse.json({ error: "Branch not found" }, { status: 404 })
  if (parent.parent_id !== null) {
    return NextResponse.json({ error: "Add branches under the global treasury, not under another branch" }, { status: 400 })
  }

  const created = await createCompanyForUser(supabase, user.id, { parentId, ...input })
  if (created.error || !created.id) {
    const e = createError(created.error ?? "")
    return NextResponse.json({ error: e.error }, { status: e.status })
  }

  const company = await getCompany(supabase, created.id)
  if (!company) return NextResponse.json({ error: "Created, but couldn't read it back" }, { status: 500 })

  // Every operating branch gets its bank account and separate wallet immediately.
  const bankAccount = await ensureCompanyReceiveAccount(await serviceOrUser(supabase), company)
  const wallet = await createCompanyWallet(supabase, user.id, company, `${company.name} wallet`)
  return NextResponse.json(
    { company, bankAccountId: bankAccount.id, wallet: wallet.ok ? wallet.wallet : null, walletError: wallet.ok ? null : wallet.error },
    { status: 201 }
  )
})
