# Upstream: Circle arc-fintech

This `app/` folder started as a copy of Circle's **arc-fintech** sample app:

- Source: https://github.com/circlefin/arc-fintech
- Commit: `0b10d386ce2a30e1a0572f28a5aad4aaf4fc66e6` (Sep 16, 2026)
- Copied into Sancus: Nov 17, 2026
- License: **Apache License 2.0** (see [LICENSE](LICENSE)). Copyright 2026 Circle Internet Group, Inc.

The rest of the Sancus repo is MIT-licensed; this folder stays under Apache-2.0.

## What we got for free
| Area | Where |
|---|---|
| Auth (Supabase sign-up / login) | `app/auth/`, `lib/supabase/` |
| Circle developer-controlled wallets | `lib/circle/developer-controlled-wallets-client.ts`, `app/api/wallet*` |
| Gateway unified balance (deposit, balance, payout) | `lib/circle/gateway-sdk.ts`, `lib/circle/unified-balance-payout.ts`, `app/api/gateway/` |
| Transfers / cross-chain bridge + rebalance | `app/api/wallet/transfer`, `app/api/bridge/` |
| Webhooks (wallets + Gateway, deduped) | `app/api/circle/`, `lib/circle/gateway-webhooks.ts` |
| Add funds (Onramp Kit, sandbox) | `components/add-funds-dialog.tsx`, `app/api/onramp/` |
| Swap USDC ⇄ EURC, Earn (yield vaults) | `app/dashboard/swap`, `app/dashboard/earn`, `lib/circle/app-kit*.ts`, `lib/circle/earn-*.ts` |
| Compliance screening + logs | `app/api/compliance/`, `app/dashboard/compliance` |
| Dashboard UI (shadcn/ui, charts, activity feed) | `app/dashboard/`, `components/` |
| Database schema | `supabase/migrations/` |
| Tests (Vitest) | `tests/` |

## Sancus changes
Apache-2.0 asks us to mark files we change. When you modify an upstream file, add a line under its license header:

```ts
// Modified by the Sancus team, 2026.
```

Log notable changes here:

- **Nov 17:** `app/api/onramp/session/route.ts` and `components/add-funds-dialog.tsx` import the public `@circle-fin/onramp-kit` (listed in `package.json`) instead of Circle's private `@crcl-main/onramp-kit` canary build, which needs Circle's internal npm credentials. The public kit names the server option `apiKey` instead of `kitKey`; the route still reads it from `KIT_KEY`.
- **Nov 17:** removed `tests/spend-arc-gateway-usdc.test.ts`; it tests `scripts/spend-arc-gateway-usdc.mjs`, which upstream doesn't ship.
- After these changes: `npx tsc --noEmit` clean, `npm test` 113/113 passing, `next build` succeeds.
- **Nov 17 (Singapore payouts):** new Sancus code in `lib/sancus/`, `components/sancus/`, `app/api/sancus/`, `app/dashboard/pay/`, `tests/sancus-*.test.ts` and migration `supabase/migrations/20261117120000_create_sancus_payouts.sql`. Upstream files touched: `lib/constants/sidebar-data.ts` (Pay entry), `tsconfig.json` (target ES2017 → ES2020 for BigInt money math), `.env.example` (Sancus variables).
- **Nov 17 (demo login):** `proxy.ts` sends signed-out visitors to `/api/sancus/demo-login` when `SANCUS_DEMO_LOGIN=true`, skipping the landing, login and sign-up screens.
