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

import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components / PPR blocks the fully-client Sancus shell when anything
  // in the request path touches cookies (Supabase auth). Keep it off until
  // auth-aware segments are wrapped in Suspense; product features unchanged.
  cacheComponents: false,

  // Critical: a stray C:\Users\patel\package-lock.json made Turbopack treat the
  // home directory as the workspace root, so compiles hung scanning unrelated
  // trees. Pin root to this app folder.
  turbopack: {
    root: path.join(__dirname),
  },

  // Externalize heavy server SDKs. Avoid packages with fragile subpath exports
  // (e.g. @circle-fin/x402-batching/server) — those must stay bundled.
  serverExternalPackages: [
    "viem",
    "@circle-fin/developer-controlled-wallets",
  ],

  experimental: {
    optimizePackageImports: ["lucide-react", "@tabler/icons-react", "date-fns"],
  },
};

export default nextConfig;
