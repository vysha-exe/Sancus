/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

// Next.js 16 root-level middleware (replaces middleware.ts). Picked up
// automatically by the framework via the exported `proxy` function and
// `config.matcher` below — do not delete or rename without updating both.
//
// See: https://nextjs.org/docs/app/api-reference/file-conventions/proxy
//
// Modified by the Sancus team, 2026: when demo login is enabled
// (SANCUS_DEMO_LOGIN=true), signed-out visitors skip the login screen and are
// signed in as the demo user instead. If that fails, a guest cookie still
// unlocks the app screens with demo data (no redirect loop on /auth/login).

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseReqResClient } from "@/lib/supabase/server-client";
import { DEMO_GUEST_COOKIE, DEMO_LOGIN_PATH, isDemoLoginEnabled } from "@/lib/sancus/demo-login";
import { hasEnvVars } from "@/lib/utils";

// Sancus app screens. Only enforced when Supabase is configured (see the
// hasEnvVars check below); without it the screens run as a mock UI with demo
// data. With demo login on, signed-out visitors are signed in automatically, so
// the screens load live data from the backend.
//
// Public marketing and mock auth routes (/, /pricing, /security, /sign-in,
// /sign-up/*, /onboarding) are not listed here, so they stay open.
const PROTECTED_PREFIXES: string[] = [
  "/home",
  "/pay",
  "/activity",
  "/receive",
  "/spending",
  "/team",
  "/branches",
  "/branch",
  "/me",
  "/invoices",
  "/agents",
  "/settings",
];

function startsWithAny(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => pathname.startsWith(prefix));
}

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const { pathname } = request.nextUrl;

  // API routes do their own per-route auth checks. Skip proxy logic.
  if (pathname.startsWith("/api")) {
    return response;
  }

  // No Supabase env → serve the mock UI without auth (local wireframe mode).
  if (!hasEnvVars) {
    return response;
  }

  const isProtected = startsWithAny(pathname, PROTECTED_PREFIXES);
  const isAuthForm = pathname === "/auth/login" || pathname === "/auth/sign-up";

  // Public marketing / mock sign-up: no session read. Auth forms still need
  // getUser so signed-in visitors can be bounced to /home.
  if (!isProtected && !isAuthForm) {
    return response;
  }

  const supabase = createSupabaseReqResClient(request, response);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const demoOn = isDemoLoginEnabled();
  const demoGuest = request.cookies.get(DEMO_GUEST_COOKIE)?.value === "1";

  // Demo mode: try a real demo session once for protected screens. If auth
  // already failed, the guest cookie lets the UI through with demo data.
  // Do NOT hijack /auth/login or /auth/sign-up — those stay available.
  if (!user && demoOn && isProtected) {
    if (demoGuest) {
      return response;
    }
    const url = request.nextUrl.clone();
    url.pathname = DEMO_LOGIN_PATH;
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  // Unauthenticated users hitting a protected route get bounced to login.
  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  // Authenticated users hitting login/signup get bounced to the Sancus app.
  // Marketing site and mock /sign-in, /sign-up routes stay public.
  if (user && isAuthForm) {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
