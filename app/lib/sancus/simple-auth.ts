export const SANCUS_ADMIN_COOKIE = "sancus-admin-session"
export const SANCUS_EMPLOYEE_COOKIE = "sancus-employee-session"

export function simpleAccounts() {
  return {
    admin: {
      email: (process.env.SANCUS_ADMIN_EMAIL || "admin@gmail.com").trim().toLowerCase(),
      password: process.env.SANCUS_ADMIN_PASSWORD || "password",
    },
    employee: {
      email: (process.env.SANCUS_EMPLOYEE_EMAIL || "employee@gmail.com").trim().toLowerCase(),
      password: process.env.SANCUS_EMPLOYEE_PASSWORD || "password",
    },
  }
}

function secret() {
  return process.env.SANCUS_SESSION_SECRET?.trim() || process.env.SUPABASE_SECRET_KEY?.trim() || "sancus-local-session"
}

function encode(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url")
}

async function signature(payload: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  return encode(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))))
}

async function createSession(email: string) {
  const payload = encode(new TextEncoder().encode(JSON.stringify({ email, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })))
  return `${payload}.${await signature(payload)}`
}

async function verifySession(value: string | null | undefined, email: string) {
  if (!value) return false
  const [payload, provided, extra] = value.split(".")
  if (!payload || !provided || extra || provided !== await signature(payload)) return false
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { email?: string; exp?: number }
    return parsed.email === email && typeof parsed.exp === "number" && parsed.exp > Date.now()
  } catch {
    return false
  }
}

export const createAdminSession = () => createSession(simpleAccounts().admin.email)
export const createEmployeeSession = () => createSession(simpleAccounts().employee.email)
export const verifyAdminSession = (value?: string | null) => verifySession(value, simpleAccounts().admin.email)
export const verifyEmployeeSession = (value?: string | null) => verifySession(value, simpleAccounts().employee.email)
