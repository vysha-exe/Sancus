// Sancus: signs the visitor in as the demo user, creating it on first use.
// See lib/sancus/demo-login.ts for when this is allowed.
import { NextResponse, type NextRequest } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import { demoCredentials, isDemoLoginEnabled, safeNextPath } from "@/lib/sancus/demo-login"

export async function GET(request: NextRequest) {
  if (!isDemoLoginEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  const creds = demoCredentials()
  if (!creds) {
    return NextResponse.json(
      { error: "Demo login is on, but SANCUS_DEMO_EMAIL / SANCUS_DEMO_PASSWORD (8+ chars) are not set" },
      { status: 500 }
    )
  }

  const next = safeNextPath(request.nextUrl.searchParams.get("next"))
  const supabase = await createClient()

  let { error } = await supabase.auth.signInWithPassword(creds)

  // First run: create the demo user (pre-confirmed) with the service key, then sign in.
  if (error) {
    const secret = process.env.SUPABASE_SECRET_KEY
    if (!secret) {
      return NextResponse.json({ error: "Demo user missing and SUPABASE_SECRET_KEY not set" }, { status: 500 })
    }
    const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const created = await admin.auth.admin.createUser({ ...creds, email_confirm: true })
    if (created.error && !/already/i.test(created.error.message)) {
      console.error("Demo user creation failed", created.error)
      return NextResponse.json({ error: "Could not create the demo user" }, { status: 500 })
    }
    ;({ error } = await supabase.auth.signInWithPassword(creds))
  }

  if (error) {
    console.error("Demo login failed", error)
    return NextResponse.json({ error: "Demo login failed; check SANCUS_DEMO_PASSWORD" }, { status: 500 })
  }

  return NextResponse.redirect(new URL(next, request.url))
}
