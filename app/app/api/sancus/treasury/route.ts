// Sancus: treasury summary (total / available / reserved / in flight + ledger check).
//   GET                       → personal scope: your own wallets (no company) + your Gateway balance
//   GET ?companyId=<node id>  → that company node and every branch under it (what a business
//                               dashboard shows; adds up to the same total as the branch tree)
import { NextResponse } from "next/server"
import { withAuth } from "@/lib/api/with-auth"
import { summarizeTreasury } from "@/lib/sancus/treasury"

export const GET = withAuth(async (req, { user, supabase }) => {
  try {
    const companyId = req.nextUrl.searchParams.get("companyId")
    let scope: { type: "personal" } | { type: "company"; companyId: string; name: string; companyIds: string[] } = { type: "personal" }

    if (companyId) {
      if (!/^[0-9a-f-]{36}$/i.test(companyId)) return NextResponse.json({ error: "Invalid company id" }, { status: 400 })
      // RLS: only nodes this user can see come back.
      const { data: node } = await supabase.from("sancus_companies").select("id, root_id, name").eq("id", companyId).maybeSingle()
      if (!node) return NextResponse.json({ error: "Company not found" }, { status: 404 })
      const { data: tree } = await supabase.from("sancus_companies").select("id, parent_id").eq("root_id", node.root_id)
      const ids = [node.id as string]
      for (let i = 0; i < ids.length; i++) for (const c of tree ?? []) if (c.parent_id === ids[i] && !ids.includes(c.id as string)) ids.push(c.id as string)
      scope = { type: "company", companyId: node.id as string, name: node.name as string, companyIds: ids }
    }

    // Dynamic import keeps Circle/viem out of the route's static module graph
    // until this handler actually runs (faster cold compile of sibling routes).
    const { loadTreasuryInputs } = await import("@/lib/sancus/treasury-load")
    const inputs = await loadTreasuryInputs(supabase, user.id, scope.type === "company" ? { companyIds: scope.companyIds } : {})
    return NextResponse.json({
      ...summarizeTreasury(inputs),
      scope:
        scope.type === "company"
          ? { type: "company", companyId: scope.companyId, name: scope.name, nodes: scope.companyIds.length }
          : { type: "personal" },
    })
  } catch (error) {
    console.error("Treasury summary failed", error)
    return NextResponse.json({ error: "Could not load treasury summary" }, { status: 500 })
  }
})
