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
import { DEMO_HOME, ensureDemoAccount, parseDemoAs } from "@/lib/sancus/demo-accounts"
import { SANCUS_ADMIN_COOKIE, SANCUS_EMPLOYEE_COOKIE } from "@/lib/sancus/simple-auth"
// Do NOT statically import provision-circle / Circle SDKs here. On Vercel those
// packages can fail to load as ESM and take down this whole route (Open demo → 500).

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
  // ?as=admin|branch|employee|individual picks which demo account to open (default admin).
  const as = parseDemoAs(request.nextUrl.searchParams.get("as"))
  const next = safeNextPath(request.nextUrl.searchParams.get("next"), DEMO_HOME[as])

  if (!isDemoLoginEnabled()) {
    return enterAsGuest(request, next, "demo-disabled")
  }
  const baseCreds = demoCredentials()
  if (!baseCreds) {
    return enterAsGuest(request, next, "demo-misconfigured")
  }
  let creds = baseCreds

  try {
    // Create and wire every demo identity, including the global Admin account.
    const secret = process.env.SUPABASE_SECRET_KEY?.trim()
    if (secret) {
      const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      creds = await ensureDemoAccount(admin, baseCreds, as)
    } else if (as !== "admin") {
      return enterAsGuest(request, next, "demo-missing-secret")
    }

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

    // Best-effort wallet setup after sign-in. Dynamic import so a Circle SDK
    // load failure never blocks demo entry.
    const {
      data: { user },
    } = await supabase.auth.getUser()
    // Only accounts that hold money get treasury wallets (not branch admins or employees).
    if (user && (as === "admin" || as === "individual")) {
      try {
        const { provisionTreasury } = await import("@/lib/sancus/provision-circle")
        const provisioned = await provisionTreasury(supabase, user.id)
        if (!provisioned.ok && provisioned.reason === "circle-error") {
          console.warn("Demo login: treasury provisioning failed", provisioned.message)
        }
      } catch (provisionErr) {
        console.warn(
          "Demo login: skipped treasury provisioning",
          provisionErr instanceof Error ? provisionErr.message : provisionErr
        )
      }
    }

    const response = NextResponse.redirect(new URL(next, request.url))
    response.cookies.delete(DEMO_GUEST_COOKIE)
    // Switching demo accounts: drop an admin@/employee@ simple-login session, which would
    // otherwise win over this one.
    response.cookies.set(SANCUS_ADMIN_COOKIE, "", { path: "/", maxAge: 0 })
    response.cookies.set(SANCUS_EMPLOYEE_COOKIE, "", { path: "/", maxAge: 0 })
    return response
  } catch (err) {
    return enterAsGuest(request, next, err instanceof Error ? err.message : "unknown")
  }
}
