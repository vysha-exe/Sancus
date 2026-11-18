// Sancus: active workspace (personal vs company node) for the shell and money APIs.
export const COMPANY_HEADER = "x-sancus-company-id"
export const COMPANY_COOKIE = "sancus_company_id"
export const ACCOUNT_MODE_KEY = "sancus_account_mode" // "personal" | "business"

export type AccountMode = "personal" | "business"

export function companyIdFromRequest(headers: Headers, cookieHeader?: string | null): string | null {
  const fromHeader = headers.get(COMPANY_HEADER)?.trim()
  if (fromHeader && /^[0-9a-f-]{36}$/i.test(fromHeader)) return fromHeader
  if (!cookieHeader) return null
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COMPANY_COOKIE}=([^;]+)`))
  const v = match?.[1] ? decodeURIComponent(match[1]) : ""
  return /^[0-9a-f-]{36}$/i.test(v) ? v : null
}

/** Browser helpers — Personal clears company cookie. */
export function readCompanyCookie(): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${COMPANY_COOKIE}=([^;]+)`))
  const v = match?.[1] ? decodeURIComponent(match[1]) : ""
  return /^[0-9a-f-]{36}$/i.test(v) ? v : null
}

export function readAccountMode(): AccountMode {
  if (typeof window === "undefined") return "personal"
  const stored = window.localStorage.getItem(ACCOUNT_MODE_KEY)
  return stored === "business" ? "business" : "personal"
}

export function setWorkspacePersonal() {
  if (typeof document !== "undefined") {
    document.cookie = `${COMPANY_COOKIE}=; path=/; max-age=0; samesite=lax`
  }
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ACCOUNT_MODE_KEY, "personal")
  }
}

export function setWorkspaceCompany(companyId: string) {
  if (typeof document !== "undefined") {
    document.cookie = `${COMPANY_COOKIE}=${encodeURIComponent(companyId)}; path=/; max-age=31536000; samesite=lax`
  }
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ACCOUNT_MODE_KEY, "business")
  }
}

/** Map sign-up country names to ISO codes for company create. */
export const SIGNUP_COUNTRY_TO_CODE: Record<string, string> = {
  Brazil: "BR",
  Mexico: "MX",
  Indonesia: "ID",
  Thailand: "TH",
  Portugal: "PT",
  Singapore: "SG",
  "United States": "US",
}
