// Keeps Supabase sessions fresh for API calls.
//
// Pages refresh an expiring session in the proxy, but API routes used to refresh on their own. When a
// page fires several API calls at once with an expired token, each route tries to swap the same
// single-use refresh token: one wins, the rest fail with "Refresh Token Not Found" and the user
// sees "Unauthorized". This refreshes once in the proxy instead, writes the new tokens onto the
// request the route reads *and* the response the browser stores, and only does it when the access
// token is expired or about to expire (so normal API calls cost nothing extra).
import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

const REFRESH_MARGIN_SECONDS = 60

/** Seconds until the access token in the Supabase auth cookie expires, or null if there's no session. */
function secondsLeft(req: NextRequest): number | null {
  const parts = req.cookies
    .getAll()
    .filter((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  if (!parts.length) return null
  let raw = parts.map((c) => c.value).join("")
  try {
    if (raw.startsWith("base64-")) raw = atob(raw.slice(7).replace(/-/g, "+").replace(/_/g, "/"))
    const session = JSON.parse(raw) as { expires_at?: number }
    if (!session.expires_at) return 0
    return session.expires_at - Math.floor(Date.now() / 1000)
  } catch {
    return 0 // unreadable: let Supabase sort it out
  }
}

/** For /api requests: refresh an expiring Supabase session once, here. Returns the response to use. */
export async function refreshApiSession(request: NextRequest): Promise<NextResponse> {
  const left = secondsLeft(request)
  if (left === null || left > REFRESH_MARGIN_SECONDS) return NextResponse.next({ request })

  let response = NextResponse.next({ request })
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        // The route handler reads the request: give it the fresh tokens.
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        // The browser keeps the response cookies for the next call.
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })
  await supabase.auth.getUser()
  return response
}
