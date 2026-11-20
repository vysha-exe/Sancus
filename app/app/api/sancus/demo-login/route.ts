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
import {
  DEMO_HOME,
  demoEmailFor,
  ensureDemoAccount,
  parseDemoAs,
  type DemoAccountReady,
} from "@/lib/sancus/demo-accounts"
import { SANCUS_ADMIN_COOKIE, SANCUS_EMPLOYEE_COOKIE } from "@/lib/sancus/simple-auth"
import { COMPANY_COOKIE } from "@/lib/sancus/workspace"
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

async function adminClientOrNull() {
  const secret = process.env.SUPABASE_SECRET_KEY?.trim()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  if (!secret || !url) return null
  const admin = createAdminClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  // Probe: sb_secret keys that aren't registered fail here — don't block password sign-in.
  const probe = await admin.auth.admin.listUsers({ page: 1, perPage: 1 })
  if (probe.error) {
    console.warn(`Demo login: service key unusable (${probe.error.message})`)
    return null
  }
  return admin
}

/** After a successful sign-in, pick the HQ / branch cookie from the user's memberships. */
async function companyIdsForUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<{ rootId?: string; branchId?: string }> {
  const { data: memberships } = await supabase
    .from("sancus_memberships")
    .select("company_id, role")
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
  const ids = (memberships ?? []).map((m) => m.company_id as string)
  if (!ids.length) return {}
  const { data: companies } = await supabase.from("sancus_companies").select("id, parent_id").in("id", ids)
  const rootId = (companies ?? []).find((c) => c.parent_id == null)?.id as string | undefined
  const branchId = (companies ?? []).find((c) => c.parent_id != null)?.id as string | undefined
  return { rootId, branchId }
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

  let creds: DemoAccountReady = {
    ...baseCreds,
    email: demoEmailFor(baseCreds.email, as),
  }

  try {
    // Prefer password sign-in first. Demo admin already exists; a broken service-role
    // key must not force the whole app into guest "***" balances.
    const supabase = await createClient()
    let { error } = await supabase.auth.signInWithPassword({
      email: creds.email,
      password: creds.password,
    })

    const admin = await adminClientOrNull()
    if (admin) {
      try {
        creds = await ensureDemoAccount(admin, baseCreds, as)
        // Re-sign in if ensureDemoAccount switched to a different identity email.
        if (creds.email.toLowerCase() !== demoEmailFor(baseCreds.email, as).toLowerCase() || error) {
          ;({ error } = await supabase.auth.signInWithPassword({
            email: creds.email,
            password: creds.password,
          }))
        }
      } catch (ensureErr) {
        console.warn(
          "Demo login: ensureDemoAccount skipped",
          ensureErr instanceof Error ? ensureErr.message : ensureErr
        )
      }
    } else if (as !== "admin" && error) {
      return enterAsGuest(request, next, "demo-missing-secret")
    }

    // First run without a working service key: try public sign-up for this identity.
    if (error) {
      if (admin) {
        const created = await admin.auth.admin.createUser({
          email: creds.email,
          password: creds.password,
          email_confirm: true,
        })
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
      ;({ error } = await supabase.auth.signInWithPassword({
        email: creds.email,
        password: creds.password,
      }))
    }

    if (error) {
      return enterAsGuest(request, next, `signin-failed: ${error.message}`)
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user && !creds.rootId && !creds.branchId) {
      const ids = await companyIdsForUser(supabase, user.id)
      creds = { ...creds, ...ids }
    }

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
    // Pin workspace: Business Admin → HQ, branch/employee → branch, individual → personal.
    if (as === "admin" && creds.rootId) {
      response.cookies.set(COMPANY_COOKIE, creds.rootId, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 })
    } else if ((as === "branch" || as === "employee") && creds.branchId) {
      response.cookies.set(COMPANY_COOKIE, creds.branchId, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 })
    } else if (as === "finance" && creds.rootId) {
      response.cookies.set(COMPANY_COOKIE, creds.rootId, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 })
    } else if (as === "individual") {
      response.cookies.set(COMPANY_COOKIE, "", { path: "/", maxAge: 0 })
    }
    return response
  } catch (err) {
    return enterAsGuest(request, next, err instanceof Error ? err.message : "unknown")
  }
}
