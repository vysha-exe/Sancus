// Sancus: the signed-in user's account type, permissions, home page and navigation.
import { NextResponse } from "next/server"
import { withAuth } from "@/lib/api/with-auth"
import { loadAccount } from "@/lib/sancus/accounts-server"

export const GET = withAuth(async (_req, { user, supabase }) => {
  const account = await loadAccount(supabase, user)
  const firstName = (user.user_metadata?.first_name as string | undefined) ?? null
  return NextResponse.json({ account: { ...account.toJSON(), firstName } })
})
