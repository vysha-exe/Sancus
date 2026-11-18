import { NextResponse } from "next/server"
import { withAuth } from "@/lib/api/with-auth"
import { getRegionalBalance } from "@/lib/sancus/regional-balance"

export const GET = withAuth(async (_req, { user, supabase }) => {
  try {
    return NextResponse.json({ balance: await getRegionalBalance(supabase, user.id) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load the Brazil balance" }, { status: 500 })
  }
})
