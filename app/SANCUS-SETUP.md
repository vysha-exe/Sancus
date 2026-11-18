# Running the Sancus app locally

> **Full list of every account, API key, wallet and faucet:** [docs/SETUP-ACCOUNTS.md](../docs/SETUP-ACCOUNTS.md). Shortcut for the Circle entity secret: `node scripts/circle-entity-secret.mjs`.

The app in this folder is based on Circle's arc-fintech sample (see [UPSTREAM.md](UPSTREAM.md)). These are the short steps for our team; the full upstream guide is in [README.md](README.md).

## 1. Install tools (once)
- **Node.js 22+**
- **Docker Desktop** (for the local database), or a free Supabase cloud project
- **ngrok** (optional, only for live webhook updates)

## 2. Get Circle credentials (each person, ~10 min)
1. Sign up at https://console.circle.com and switch to **Testnet**.
2. Create an **API key**.
3. Generate and register an **Entity Secret**: https://developers.circle.com/wallets/dev-controlled/register-entity-secret
   Save the recovery file somewhere safe. **Never commit the secret.**
4. (Needed for Swap and Add Funds) Create a **Kit Key** in the Console, using the **sandbox** environment.
5. Get testnet USDC/EURC: https://faucet.circle.com (pick Arc Testnet).

## 3. Install and configure
```bash
cd app
npm install
cp .env.example .env.local
```
Fill in `.env.local`:
| Variable | Where it comes from |
|---|---|
| `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET` | Step 2 |
| `KIT_KEY` | Step 2.4 (sandbox key) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | Printed by `npx supabase start` (step 4), or Supabase dashboard → Settings → API |
| `WEBHOOK_ENDPOINT_URL` | Your ngrok URL + `/api/circle/webhook` (optional) |
| `ONRAMP_API_BASE_URL`, `NEXT_PUBLIC_ONRAMP_WIDGET_BASE_URL` | **Keep the sandbox values** already in the file. Unset means production, where purchases charge real cards. |

`.env.local` is ignored by git.

## 4. Start the database
Local (Docker running):
```bash
npx supabase start
npx supabase migration up
```
Or cloud: `npx supabase link --project-ref <ref>` then `npx supabase db push`.

## 5. Skip the login screen (optional, for demos)
Add to `.env.local`:
```bash
SANCUS_DEMO_LOGIN=true
SANCUS_DEMO_EMAIL=demo@sancus.app
SANCUS_DEMO_PASSWORD=<any password, 8+ characters>
```
Opening the app then signs you in as the demo user (created on first visit) and lands on **Pay**. Restart `npm run dev` after changing env vars. It's disabled in production builds unless `SANCUS_DEMO_LOGIN_ALLOW_PRODUCTION=true` is also set, because anyone who opens the app gets the demo account.

## 6. Run it
```bash
npm run dev
```
Open http://localhost:3000 (add `-- -p 3010` if port 3000 is busy). Create wallets on Arc Testnet, fund them from the faucet, and try a Gateway deposit.

## 7. Try the Singapore payout (works without Circle keys)
1. Open **Pay** in the sidebar.
2. Recipient `Lim Trading Pte Ltd`, UEN `201912345K`, amount `2000`.
3. Check the live quote (rate, fee, USDC debited), then **Send**. The payout moves Quote locked → USDC sent → Converting → Paying out → Delivered in about 15 seconds.
4. Send exactly **S$13.13** to see the failure path.

The rate and the SGD payout partner are **simulated** until StraitsX sandbox access arrives (`lib/sancus/payout-provider.ts`). To make the USDC leg a real Arc testnet transfer, set `SANCUS_SETTLEMENT_ADDRESS` and pick a funded Arc wallet in **Pay from**.

## 8. Checks
```bash
npm test          # Vitest unit tests
npx tsc --noEmit  # typecheck
```

## Notes
- **Add Funds (Onramp Kit) is untested end to end.** We switched it to Circle's public onramp package, whose docs describe the key as `<ENV>_API_KEY:<keyId>:<keySecret>`. If Add Funds rejects your `KIT_KEY`, try your Circle testnet API key. Everything else works without it.
- Earn **rewards are mocked** upstream (`lib/earn/mock-rewards.ts`); deposits and withdrawals are real testnet operations.
- Webhooks need a public URL (ngrok). Without one, balances still load; they just don't update live.
- When you change an upstream file, add `// Modified by the Sancus team, 2026.` under its license header and log it in [UPSTREAM.md](UPSTREAM.md).
