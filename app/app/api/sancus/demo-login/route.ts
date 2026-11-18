// Sancus: signs the visitor in as the demo user, creating it on first use.
// See lib/sancus/demo-login.ts for when this is allowed.
//
// If Supabase auth is unavailable (no secret key, rate limit, etc.), we still
// drop the visitor into /home with a guest cookie so the Open demo button
// always reaches the app UI (demo data) instead of looping on /auth/login.
import { NextResponse, type NextRequest } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import {
  DEMO_GUEST_COOKIE,
  demoCredentials,
  isDemoLoginEnabled,
  safeNextPath,
} from "@/lib/sancus/demo-login"

function enterAsGuest(request: NextRequest, next: string, reason: string) {
  console.warn(`Demo login falling back to guest UI (${reason})`)
  const response = NextResponse.redirect(new URL(next, request.url))
  response.cookies.set(DEMO_GUEST_COOKIE, "1", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
  })
  return response
}

export async function GET(request: NextRequest) {
  const next = safeNextPath(request.nextUrl.searchParams.get("next"))

  if (!isDemoLoginEnabled()) {
    return enterAsGuest(request, next, "demo-disabled")
  }
  const creds = demoCredentials()
  if (!creds) {
    return enterAsGuest(request, next, "demo-misconfigured")
  }

  try {
    const supabase = await createClient()
    let { error } = await supabase.auth.signInWithPassword(creds)

    // First run: create the demo user, then sign in.
    if (error) {
      const secret = process.env.SUPABASE_SECRET_KEY?.trim()
      if (secret) {
        const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
        const created = await admin.auth.admin.createUser({ ...creds, email_confirm: true })
        if (created.error && !/already/i.test(created.error.message)) {
          return enterAsGuest(request, next, `create-failed: ${created.error.message}`)
        }
      } else {
        const signedUp = await supabase.auth.signUp({
          email: creds.email,
          password: creds.password,
        })
        if (signedUp.error && !/already|registered/i.test(signedUp.error.message)) {
          return enterAsGuest(request, next, `signup-failed: ${signedUp.error.message}`)
        }
        if (signedUp.data.session) {
          const response = NextResponse.redirect(new URL(next, request.url))
          response.cookies.delete(DEMO_GUEST_COOKIE)
          return response
        }
      }
      ;({ error } = await supabase.auth.signInWithPassword(creds))
    }

    if (error) {
      return enterAsGuest(request, next, `signin-failed: ${error.message}`)
    }

    const response = NextResponse.redirect(new URL(next, request.url))
    response.cookies.delete(DEMO_GUEST_COOKIE)
    return response
  } catch (err) {
    return enterAsGuest(request, next, err instanceof Error ? err.message : "unknown")
  }
}
