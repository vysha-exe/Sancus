// Sancus: treasury summary (total / available / reserved / in flight + ledger check).
import { NextResponse } from "next/server"
import { withAuth } from "@/lib/api/with-auth"
import { summarizeTreasury } from "@/lib/sancus/treasury"

export const GET = withAuth(async (_req, { user, supabase }) => {
  try {
    // Dynamic import keeps Circle/viem out of the route's static module graph
    // until this handler actually runs (faster cold compile of sibling routes).
    const { loadTreasuryInputs } = await import("@/lib/sancus/treasury-load")
    const inputs = await loadTreasuryInputs(supabase, user.id)
    return NextResponse.json(summarizeTreasury(inputs))
  } catch (error) {
    console.error("Treasury summary failed", error)
    return NextResponse.json({ error: "Could not load treasury summary" }, { status: 500 })
  }
})
