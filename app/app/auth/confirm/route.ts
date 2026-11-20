/**
 * Supabase email confirmation / magic-link landing.
 * Handles both PKCE (`?code=`) and older `token_hash` links, then continues sign-up.
 */
import { createClient } from "@/lib/supabase/server"
import { provisionTreasury } from "@/lib/sancus/provision-circle"
import { type EmailOtpType } from "@supabase/supabase-js"
import { redirect } from "next/navigation"
import { type NextRequest } from "next/server"

function safeNext(raw: string | null): string {
  if (!raw) return "/sign-up/account-type"
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/sign-up/account-type"
  return raw
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const next = safeNext(searchParams.get("next"))
  const code = searchParams.get("code")
  const token_hash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null
  const supabase = await createClient()

  let errorMessage: string | null = null

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) errorMessage = error.message
  } else if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (error) errorMessage = error.message
  } else {
    errorMessage = "This confirmation link is missing its code. Enter the six-digit code on the sign-up screen instead."
  }

  if (errorMessage) {
    redirect(`/auth/error?error=${encodeURIComponent(errorMessage)}`)
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) await provisionTreasury(supabase, user.id)

  redirect(next)
}
