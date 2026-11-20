/** Public site origin for auth email links (never leave people on localhost from a phone email). */
export function publicAppOrigin(): string {
  const configured = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/$/, "")
  if (configured) return configured
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, "")}`
  return "https://sancus-peach.vercel.app"
}

/** Browser helper: on localhost, prefer the configured public URL so verification emails work. */
export function authEmailRedirectOrigin(): string {
  if (typeof window === "undefined") return publicAppOrigin()
  const host = window.location.hostname
  if (host === "localhost" || host === "127.0.0.1") return publicAppOrigin()
  return window.location.origin
}

export function signupEmailRedirectTo(next = "/sign-up/account-type"): string {
  return `${authEmailRedirectOrigin()}/auth/confirm?next=${encodeURIComponent(next)}`
}
