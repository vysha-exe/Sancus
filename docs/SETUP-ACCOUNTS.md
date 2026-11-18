# Sancus: Accounts, API keys, wallets & faucets

Step-by-step list of everything to sign up for, create and paste into `app/.env.local` so every feature runs. All of it is **free** and **testnet / sandbox only**. Never use real money or production keys.

**Order matters:** do Part A today (≈45 min); it's enough for the full Circle + Arc demo. Part B unlocks partner features; request those **today** because some need a human to reply. Part C is for bounties.

> Secrets go only in `app/.env.local` (git-ignored). Never paste keys in Slack/Discord, screenshots or commits.

---

## Quick status board

| # | What | Needed for | Time | Who | Done |
|---|---|---|---|---|---|
| A1 | Node 22, Docker Desktop, Git | Running anything | 15 min | everyone | ☐ |
| A2 | Local Supabase database | Login, payouts, ledger | 5 min | everyone | ☐ |
| A3 | Circle Developer account + **testnet API key** | Wallets, Gateway, transfers | 5 min | everyone | ☐ |
| A4 | Circle **entity secret** (script) | Wallets, Gateway, transfers | 2 min | everyone | ☐ |
| A5 | Create **Arc testnet wallets** in the app | Treasury | 3 min | everyone | ☐ |
| A6 | **Faucet** USDC + EURC on Arc testnet | Real balances | 2 min | everyone | ☐ |
| A7 | **Settlement address** | Real USDC leg of Singapore payouts | 2 min | 1 person | ☐ |
| A8 | Demo login | Skip sign-in screens | 1 min | everyone | ☐ |
| B1 | ngrok (public URL) | Circle webhooks (live balances) | 10 min | 1 person | ☐ |
| B2 | Circle **Kit Key** (sandbox) | Swap, Earn, Add Funds | 5 min | 1 person | ☐ |
| B3 | Circle **Gas Station** policy | No-gas transfers | 5 min | 1 person | ☐ |
| B4 | Arc RPC key (optional) | Fewer rate limits on balance reads | 5 min | 1 person | ☐ |
| B5 | **StraitsX** sandbox | Real PayNow payouts | days (request today) | Vyshalini | ☐ |
| B6 | **Bridge** sandbox | ACH payouts + USD deposits | days (request today) | | ☐ |
| B7 | **Marqeta** sandbox | Corporate cards | 15 min | RuoHan | ☐ |
| B8 | **Midtrans** sandbox | QRIS (Indonesia) collections | 10 min | RuoHan | ☐ |
| B9 | **Omise** test keys | PromptPay (Thailand) collections | 10 min | RuoHan | ☐ |
| B10 | **PayZu** sandbox | Pix collections (optional) | 10 min | RuoHan | ☐ |
| C1 | **QuickNode** (Arc) + Streams | Live ledger · **$500 bounty** | 15 min | | ☐ |
| C2 | **Anthropic** API key | Invoice reading, AP agent | 5 min | | ☐ |
| C3 | **ElevenLabs** API key | Voice approvals · bounty perks | 5 min | | ☐ |
| C4 | **Gemini** prediction markets | Hedge suggestions · **$2,500 bounty** | 0–10 min | | ☐ |

---

## Part A: Core (Circle + Arc), do today

### A1. Install tools
- **Node.js 22+**: https://nodejs.org (check: `node -v`)
- **Docker Desktop**: https://www.docker.com/products/docker-desktop/ (start it; check: `docker info`)
- **Git**: https://git-scm.com

```bash
cd C:/Users/<you>/Documents/Sancus/app
```

```bash
npm install
```

```bash
cp .env.example .env.local
```

### A2. Local Supabase database
With Docker running, from `app/`:

```bash
npx supabase start
```

```bash
npx supabase migration up
```

The first run downloads images (a few minutes). It prints a block of values; copy them into `.env.local`:

| Printed as | `.env.local` key |
|---|---|
| `API_URL` (http://127.0.0.1:54321) | `NEXT_PUBLIC_SUPABASE_URL` |
| `PUBLISHABLE_KEY` (`sb_publishable_…`) | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| `SECRET_KEY` (`sb_secret_…`) | `SUPABASE_SECRET_KEY` |

Database UI: http://127.0.0.1:54323 · stop it later with `npx supabase stop`.

*(For a shared/hosted demo instead: create a free project at https://supabase.com/dashboard, then `npx supabase link --project-ref <ref>` and `npx supabase db push`. Keys are under Settings → API.)*

### A3. Circle Developer account + testnet API key
1. Sign up: https://console.circle.com
2. Make sure you're in **Testnet** (toggle at the top).
3. **API Keys → Create a key** (Standard key). Copy it once; it isn't shown again.
4. Paste into `.env.local`:
   ```
   CIRCLE_API_KEY=TEST_API_KEY:...
   ```

### A4. Circle entity secret (one command)
Your entity secret is a 32-byte key that authorizes your wallets. Circle never stores it. From `app/`:

```bash
node scripts/circle-entity-secret.mjs
```

It generates the secret, registers it with Circle, writes `CIRCLE_ENTITY_SECRET` into `.env.local`, and saves a **recovery file** in `app/circle-recovery/` (git-ignored). **Move the recovery file into a password manager.** If you lose both, you lose the wallets.

*(Manual alternative: https://developers.circle.com/wallets/dev-controlled/register-entity-secret)*

### A5. Create Arc testnet wallets (in the app)
```bash
npm run dev
```
(add `-- -p 3010` if port 3000 is busy)

1. Open http://localhost:3000 and sign in (or use the demo login, A8).
2. **Wallets → New wallet → Arc Testnet.** Create at least:
   - **Treasury** (the company's main USDC wallet)
   - **Settlement** (stands in for the payout partner, see A7)
3. Each wallet shows an Arc address (`0x…`). View it at https://explorer.testnet.arc.io

### A6. Faucet: free testnet USDC + EURC
1. Go to **https://faucet.circle.com**
2. Network: **Arc Testnet** · token: **USDC** · paste the **Treasury** wallet address → send.
3. Repeat for **EURC** (for the Swap page).
4. Refresh the app: the Treasury strip on **Pay** and the dashboard should show the balance.
5. Optional: deposit some USDC into **Gateway** from the dashboard to see the unified balance.

Faucet amounts are capped and rate-limited per address. If you hit the limit, use a teammate's request or wait. USDC on Arc is also the gas token, so the Treasury wallet needs a little USDC to send anything (unless Gas Station is set up, B3).

### A7. Settlement address (real USDC leg of Singapore payouts)
Copy the **Settlement** wallet's Arc address from A5 into `.env.local`:
```
SANCUS_SETTLEMENT_ADDRESS=0x...
```
Restart `npm run dev`. On **Pay**, choose the funded Treasury wallet under **Pay from**. Each payout now sends real USDC on Arc testnet and shows an explorer link. *(With StraitsX live, this becomes StraitsX's deposit address.)*

### A8. Demo login (skip sign-in)
Add to `.env.local`, then restart `npm run dev`:
```
SANCUS_DEMO_LOGIN=true
SANCUS_DEMO_EMAIL=demo@sancus.app
SANCUS_DEMO_PASSWORD=<any password, 8+ characters>
```
Opening the app now signs you in automatically and lands on **Pay**.

✅ **After Part A:** wallets, real Arc balances, Gateway, treasury summary, ledger and Singapore payouts (with a real USDC leg) all work.

---

## Part B: Partners & extra Circle features

### B1. ngrok: public URL for webhooks
Circle (and later QuickNode/partners) must reach your laptop.
1. Sign up + install: https://ngrok.com/download (free account; copy your authtoken from the dashboard)
2. Run (match your dev port):
   ```bash
   ngrok http 3000
   ```
3. Copy the `https://….ngrok-free.app` URL into `.env.local`:
   ```
   WEBHOOK_ENDPOINT_URL=https://<your-subdomain>.ngrok-free.app/api/circle/webhook
   ```
4. Circle Console → **Webhooks → Add endpoint** with the same URL; enable transaction notifications (and `onramp.deposit.settled` if using Add Funds).
5. Register Gateway webhooks for existing wallets:
   ```bash
   npm run webhooks:register
   ```
The free ngrok URL changes each restart; update both places when it does.

### B2. Circle Kit Key (sandbox): Swap, Earn, Add Funds
Circle Console → **Kit Keys** (sandbox environment) → create. Paste as:
```
KIT_KEY=KIT_KEY:<keyId>:<keySecret>
```
Keep `ONRAMP_API_BASE_URL` and `NEXT_PUBLIC_ONRAMP_WIDGET_BASE_URL` on the **sandbox** values from `.env.example` (otherwise Add Funds points at production). If Add Funds rejects the kit key, try your testnet API key instead (the public onramp package's docs describe an API-key format).

### B3. Circle Gas Station (no gas tokens for users)
Circle Console → **Gas Station** → create a policy for **Arc Testnet**. On EVM chains Gas Station sponsors **smart-contract-account (SCA)** wallets only, so create SCA wallets if you want sponsored gas. Docs: https://developers.circle.com/wallets/gas-station

### B4. Arc testnet RPC key (optional)
The app reads balances from `https://rpc.testnet.arc.network`, which is rate-limited without a key. If you see balance-read warnings, get a key (see Arc's docs: https://docs.arc.io) and set:
```
ARC_TESTNET_RPC_KEY=...
```

### B5. StraitsX sandbox: real PayNow / FAST payouts (request today)
- Fill in **https://straitsx.com/contact-sales**, and send the LinkedIn message to their Head of Commercial.
- Ask for a **business sandbox** with the **Payout API** (PayNow / FAST). Their sandbox mocks payout status and sends callbacks: https://docs.straitsx.com/docs/regular-payout
- When granted, add `STRAITSX_API_URL` and `STRAITSX_API_KEY` to `.env.local` and implement `lib/sancus/rails/straitsx.ts` (checklist §6.1).
- **Fallback:** the simulated provider already works.

### B6. Bridge sandbox: ACH payouts + USD deposits (request today)
- Email **support@bridge.xyz**: "Student team at the University Blockchain Hackathon (deadline Nov 20) requesting a developer sandbox account; we'd also like Pix and SPEI enabled in sandbox."
- Sandbox base URL: `https://api.sandbox.bridge.xyz/v0` · keys start with `sk-test`. Guide: https://apidocs.bridge.xyz/get-started/introduction/quick-start/setting-up-sandbox
- When granted, paste `BRIDGE_API_KEY=sk-test...` into `app/.env.local`.
- **Fallback:** simulated ACH adapter (checklist §6.3).

### B7. Marqeta sandbox: corporate cards
- Sign up for a Marqeta developer sandbox: https://www.marqeta.com/developers
- From the sandbox dashboard copy the **application token** and **admin access token**.
- Paste (currently into `rails-demo/.env`, later `app/.env.local`):
  ```
  MARQETA_BASE_URL=https://sandbox-api.marqeta.com/v3
  MARQETA_APPLICATION_TOKEN=...
  MARQETA_ADMIN_ACCESS_TOKEN=...
  ```
- Check it with `rails-demo`: `cd rails-demo && npm start` → open http://localhost:3000 → **Marqeta** → Run.

### B8. Midtrans sandbox: QRIS (Indonesia)
- Sign up: https://dashboard.sandbox.midtrans.com → Settings → **Access Keys** → copy the **Server Key** (sandbox).
- `MIDTRANS_SERVER_KEY=SB-Mid-server-...` · test payments with the Midtrans simulator. Docs: https://docs.midtrans.com/reference/qris

### B9. Omise test keys: PromptPay (Thailand)
- Sign up: https://dashboard.omise.co → switch to **Test mode** → Keys → copy the **secret key**.
- `OMISE_SECRET_KEY=skey_test_...` · mark charges paid/failed from the test dashboard. Docs: https://docs.omise.co/promptpay

### B10. PayZu sandbox: Pix (optional)
- Follow https://docs.payzu.com.br/docs/pix-processamento/sandbox to get a sandbox token.
- `PAYZU_SANDBOX_TOKEN=...` · sandbox charges auto-complete after ~10 s.

---

## Part C: Bounties & AI features

### C1. QuickNode: Arc endpoint + Streams ($500 bounty)
1. Sign up: https://www.quicknode.com (every complete submission gets a $49/mo plan perk; check the hackathon page).
2. Create an **Arc Testnet** endpoint. Optionally use its URL for balance reads (B4).
3. **Streams → New stream** on Arc Testnet; filter to your Treasury / Settlement addresses (or USDC `Transfer` events); destination = webhook `https://<ngrok>/api/sancus/webhooks/quicknode` (endpoint to be built, checklist §9).
Docs: https://www.quicknode.com/docs/arc/api-overview

### C2. Anthropic API key: invoice reading + AP agent
- https://console.anthropic.com → API Keys → create. `ANTHROPIC_API_KEY=sk-ant-...`
- Used by the invoice-extraction and agent endpoints (checklist §11, §14).

### C3. ElevenLabs API key: voice approvals (bounty perks)
- https://elevenlabs.io → Profile → **API Keys** → create. `ELEVENLABS_API_KEY=...`
- Use a stock voice; don't clone a real person's voice.

### C4. Gemini prediction markets ($2,500 bounty)
- **Market data is public, no key needed:** https://developer.gemini.com/prediction-markets/getting-started
- Trading needs an API key from the **Gemini sandbox exchange** (`api.sandbox.gemini.com`) and accepting the prediction-markets terms there. Only needed if we place sandbox hedges.

---

## Full `app/.env.local` template

```bash
# --- Supabase (A2) ---
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=

# --- Circle (A3, A4, B2) ---
CIRCLE_API_KEY=
CIRCLE_ENTITY_SECRET=
KIT_KEY=
ONRAMP_API_BASE_URL=https://api-test.circle.com
NEXT_PUBLIC_ONRAMP_WIDGET_BASE_URL=https://onramp-sandbox.arc.io

# --- Webhooks (B1) ---
WEBHOOK_ENDPOINT_URL=
# NEXT_PUBLIC_APP_URL=http://localhost:3000

# --- Arc (B4, optional) ---
ARC_TESTNET_RPC_KEY=

# --- Sancus payouts (A7) ---
SANCUS_USD_SGD_RATE=1.3400
SANCUS_FX_SPREAD_BPS=30
SANCUS_SETTLEMENT_ADDRESS=

# --- Demo login (A8) ---
SANCUS_DEMO_LOGIN=true
SANCUS_DEMO_EMAIL=demo@sancus.app
SANCUS_DEMO_PASSWORD=

# --- Partners (B5–B10), add as access arrives ---
STRAITSX_API_URL=
STRAITSX_API_KEY=
BRIDGE_API_KEY=
MARQETA_BASE_URL=https://sandbox-api.marqeta.com/v3
MARQETA_APPLICATION_TOKEN=
MARQETA_ADMIN_ACCESS_TOKEN=
MIDTRANS_SERVER_KEY=
OMISE_SECRET_KEY=
PAYZU_SANDBOX_TOKEN=

# --- AI & bounties (C2, C3) ---
ANTHROPIC_API_KEY=
ELEVENLABS_API_KEY=
```

After editing `.env.local`, always restart `npm run dev`.

## Verify everything works

| Check | How | Expected |
|---|---|---|
| Database | http://127.0.0.1:54323 | Tables `wallets`, `sancus_payouts`, `sancus_journals` exist |
| Circle keys | Wallets → New wallet → Arc Testnet | Wallet created with a `0x…` address |
| Faucet | Pay page → Treasury strip | Total shows your USDC |
| Gateway | Dashboard → deposit to Gateway | Gateway amount appears in Treasury "Total" breakdown |
| Real payout leg | Pay → pick Treasury wallet → send | Payout shows an "Arc tx" explorer link |
| Ledger | Pay → **Ledger CSV** | CSV with debit/credit rows; badge says "Ledger in sync" |
| Webhooks | Send USDC to Treasury from faucet | Balance updates without refreshing |
| Tests | `npm test` in `app/` | All pass |

## Troubleshooting
- **"No wallets yet" on Treasury** → do A5.
- **Wallet creation fails** → `CIRCLE_API_KEY` is a testnet key? Entity secret registered for *that* key? Restarted the dev server?
- **"Couldn't read wallet balance"** → public Arc RPC rate-limited; wait or add `ARC_TESTNET_RPC_KEY` (B4).
- **Port 3000 in use** → `npm run dev -- -p 3010`.
- **Supabase won't start** → Docker Desktop must be running; `npx supabase stop` then `npx supabase start`.
- **Lost the entity secret** → use the recovery file in the Circle Console to reset it.
