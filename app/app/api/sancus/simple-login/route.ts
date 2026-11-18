import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { createAdminContext } from "@/lib/api/with-auth"
import { createAdminSession, createEmployeeSession, SANCUS_ADMIN_COOKIE, SANCUS_EMPLOYEE_COOKIE, simpleAccounts } from "@/lib/sancus/simple-auth"

const schema = z.object({ email: z.string().email(), password: z.string() })

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email and password" }, { status: 400 })

  const accounts = simpleAccounts()
  const email = parsed.data.email.trim().toLowerCase()
  if (email === accounts.employee.email) {
    if (parsed.data.password !== accounts.employee.password) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
    }
    try {
      await createAdminContext()
      const response = NextResponse.json({ ok: true, role: "employee" })
      response.cookies.set(SANCUS_ADMIN_COOKIE, "", { path: "/", maxAge: 0 })
      response.cookies.set(SANCUS_EMPLOYEE_COOKIE, await createEmployeeSession(), {
        path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 7,
      })
      return response
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Employee login is unavailable" }, { status: 503 })
    }
  }
  if (email !== accounts.admin.email || parsed.data.password !== accounts.admin.password) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
  }

  try {
    await createAdminContext()
    const response = NextResponse.json({ ok: true, role: "admin" })
    response.cookies.set(SANCUS_ADMIN_COOKIE, await createAdminSession(), {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 7,
    })
    response.cookies.set(SANCUS_EMPLOYEE_COOKIE, "", { path: "/", maxAge: 0 })
    return response
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Login is unavailable" }, { status: 503 })
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(SANCUS_ADMIN_COOKIE, "", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  })
  response.cookies.set(SANCUS_EMPLOYEE_COOKIE, "", { path: "/", maxAge: 0 })
  return response
}
