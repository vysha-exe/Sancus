// Sancus: demo auto-login so a demo or local run skips the sign-up / login screens.
//
// Enabled only when SANCUS_DEMO_LOGIN=true. Production builds also require
// SANCUS_DEMO_LOGIN_ALLOW_PRODUCTION=true, so it can't be switched on by accident
// on a real deployment. Anyone who can open the app is signed in as the demo user,
// so only use it on testnet demos.

export const DEMO_LOGIN_PATH = "/api/sancus/demo-login"

type Env = Record<string, string | undefined>

export function isDemoLoginEnabled(env: Env = process.env): boolean {
  if (env.SANCUS_DEMO_LOGIN !== "true") return false
  if (env.NODE_ENV === "production" && env.SANCUS_DEMO_LOGIN_ALLOW_PRODUCTION !== "true") return false
  return true
}

export function demoCredentials(env: Env = process.env): { email: string; password: string } | null {
  const email = env.SANCUS_DEMO_EMAIL?.trim()
  const password = env.SANCUS_DEMO_PASSWORD
  if (!email || !password || password.length < 8) return null
  return { email, password }
}

/** Only allow redirects to in-app paths (no open redirects). */
export function safeNextPath(next: string | null | undefined, fallback = "/home"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/api/")) return fallback
  return next
}
