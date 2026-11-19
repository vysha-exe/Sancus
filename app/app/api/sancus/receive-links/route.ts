import { NextResponse } from "next/server"
import { withAuth } from "@/lib/api/with-auth"
import { effectiveRole, type CompanyRow, type MembershipRow } from "@/lib/sancus/companies"
import { collectionRailConfig } from "@/lib/sancus/provider-collection"
import type { CollectionRail } from "@/lib/sancus/local-rails"

type ReceiveRail = CollectionRail | "USDC"

type ReceiveLinkRow = {
  id: string
  company_id: string
  rail: ReceiveRail
  public_token: string
  active: boolean
  created_at: string
}

export const GET = withAuth(async (_request, { user, supabase }) => {
  const [{ data: companies }, { data: memberships }] = await Promise.all([
    supabase.from("sancus_companies").select("id, parent_id, root_id, name, country, base_currency, created_at"),
    supabase.from("sancus_memberships").select("company_id, user_id, role, status"),
  ])
  const companyRows = (companies ?? []) as CompanyRow[]
  const membershipRows = (memberships ?? []) as MembershipRow[]
  const accessibleIds = companyRows
    .filter((company) => effectiveRole(companyRows, membershipRows, user.id, company.id).role !== null)
    .map((company) => company.id)
  if (!accessibleIds.length) return NextResponse.json({ links: [] })

  const { data: links, error } = await supabase
    .from("sancus_receive_links")
    .select("id, company_id, rail, public_token, active, created_at")
    .in("company_id", accessibleIds)
    .eq("active", true)
    .order("created_at")
  if (error) return NextResponse.json({ error: "Could not load static receive links" }, { status: 500 })

  const rows = (links ?? []) as ReceiveLinkRow[]
  const companyById = new Map(companyRows.map((company) => [company.id, company]))

  return NextResponse.json({
    links: rows.flatMap((row) => {
      const company = companyById.get(row.company_id)
      if (!company) return []
      const currency = row.rail === "USDC" ? "USDC" : collectionRailConfig[row.rail].currency
      return [{
        id: row.id,
        companyId: row.company_id,
        companyName: company.name,
        rail: row.rail,
        currency,
        publicToken: row.public_token,
        createdAt: row.created_at,
      }]
    }),
  })
})
