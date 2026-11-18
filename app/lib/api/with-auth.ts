/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient as createAdminClient, type SupabaseClient, type User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import { hasEnvVars } from "@/lib/utils"
import { SANCUS_ADMIN_COOKIE, SANCUS_EMPLOYEE_COOKIE, simpleAccounts, verifyAdminSession, verifyEmployeeSession } from "@/lib/sancus/simple-auth"
import { ensureDemoAccount } from "@/lib/sancus/demo-accounts"

export type AuthContext = {
  user: User
  supabase: SupabaseClient
}

export type AuthedHandler = (
  request: NextRequest,
  ctx: AuthContext
) => Promise<NextResponse> | NextResponse

function projectUrl() {
  const configured = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  if (configured) return configured.replace(/\/$/, "")

  const connection = process.env.DBL_CONNECTION_STRING?.trim() || process.env.DB_CONNECTION_STRING?.trim()
  if (!connection) return null
  try {
    const parsed = new URL(connection)
    const hostRef = parsed.hostname.match(/^db\.([a-z0-9-]+)\.supabase\.co$/i)?.[1]
    const userRef = decodeURIComponent(parsed.username).match(/^postgres\.([a-z0-9-]+)$/i)?.[1]
    const ref = hostRef || userRef
    return ref ? `https://${ref}.supabase.co` : null
  } catch {
    return null
  }
}

let adminContextPromise: Promise<AuthContext> | null = null
let employeeContextPromise: Promise<AuthContext> | null = null

export function createAdminContext(): Promise<AuthContext> {
  if (adminContextPromise) return adminContextPromise
  adminContextPromise = (async () => {
    const url = projectUrl()
    const secret = process.env.SUPABASE_SECRET_KEY?.trim()
    if (!url || !secret) throw new Error("Admin login needs a Supabase project URL/connection string and SUPABASE_SECRET_KEY")

    const supabase = createAdminClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } })
    const accounts = simpleAccounts()
    const listed = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (listed.error) throw listed.error
    let admin = listed.data.users.find((candidate) => candidate.email?.toLowerCase() === accounts.admin.email)
    for (const [role, account] of Object.entries(accounts)) {
      const existing = listed.data.users.find((candidate) => candidate.email?.toLowerCase() === account.email)
      if (existing) {
        const updated = await supabase.auth.admin.updateUserById(existing.id, {
          password: account.password,
          user_metadata: {
            ...existing.user_metadata,
            source: "sancus-simple-auth",
            role,
            ...(role === "admin" ? { first_name: "Admin" } : {}),
          },
        })
        if (updated.error || !updated.data.user) throw updated.error || new Error(`Could not update the Sancus ${role} user`)
        if (role === "admin") admin = updated.data.user
        continue
      }
      const created = await supabase.auth.admin.createUser({
        email: account.email,
        password: account.password,
        email_confirm: true,
        user_metadata: { source: "sancus-simple-auth", role, ...(role === "admin" ? { first_name: "Admin" } : {}) },
      })
      if (created.error || !created.data.user) throw created.error || new Error(`Could not create the Sancus ${role} user`)
      if (role === "admin") admin = created.data.user
    }
    if (!admin) throw new Error("Could not load the Sancus admin user")
    await ensureDemoAccount(supabase, { email: accounts.admin.email, password: accounts.admin.password }, "admin")
    await ensureDemoAccount(
      supabase,
      { email: accounts.admin.email, password: accounts.employee.password },
      "employee",
      accounts.employee.email
    )
    return { user: admin, supabase }
  })().catch((error) => {
    adminContextPromise = null
    throw error
  })
  return adminContextPromise
}

function createEmployeeContext(): Promise<AuthContext> {
  if (employeeContextPromise) return employeeContextPromise
  employeeContextPromise = (async () => {
    const admin = await createAdminContext()
    const email = simpleAccounts().employee.email
    const listed = await admin.supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (listed.error) throw listed.error
    const employee = listed.data.users.find((candidate) => candidate.email?.toLowerCase() === email)
    if (!employee) throw new Error("Could not load the Sancus employee user")
    return { user: employee, supabase: admin.supabase }
  })().catch((error) => {
    employeeContextPromise = null
    throw error
  })
  return employeeContextPromise
}

/**
 * Wraps a Next.js Route Handler with the canonical 8-line auth preamble:
 *
 *     const supabase = await createClient()
 *     const { data: { user } } = await supabase.auth.getUser()
 *     if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
 *
 * Adopt this on new routes; existing routes can migrate gradually. The
 * unauthorized 500 catch is intentionally left to each handler so they can
 * tailor error messages and HTTP codes to their own domain.
 */
export function withAuth(handler: AuthedHandler) {
  return async (request: NextRequest) => {
    if (await verifyAdminSession(request.cookies.get(SANCUS_ADMIN_COOKIE)?.value)) {
      try {
        return handler(request, await createAdminContext())
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Admin API is unavailable" }, { status: 503 })
      }
    }
    if (await verifyEmployeeSession(request.cookies.get(SANCUS_EMPLOYEE_COOKIE)?.value)) {
      try {
        return handler(request, await createEmployeeContext())
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Employee API is unavailable" }, { status: 503 })
      }
    }

    // Mock / local UI mode: no Supabase env configured.
    if (!hasEnvVars) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return handler(request, { user, supabase })
  }
}
