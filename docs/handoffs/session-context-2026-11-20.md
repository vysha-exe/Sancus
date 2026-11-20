# Session context: Sancus (UBC Hackathon 2026), Nov 17–20

Paste this into a new Claude session to pick up where we left off. Submission deadline: **Fri Nov 20, 12:00 PM CST** (Devpost). Finalists pitch in person Sat Nov 21.

---

## Ground rules for Claude

- **Never run `git commit` or `git push`.** Give the user copy-paste PowerShell commands instead. Run `git pull` before coding.
- **No "Co-Authored-By: Claude"** (or any attribution line) in commit messages. No extra notes at the start of commit messages.
- Don't edit research or checklist docs unless asked; build real features.
- Never print secrets. `.env.local` stays git-ignored; secrets go to Vercel, never to git.
- Never `git reset --hard`.
- Moving funds (even testnet) needs the user's explicit OK.
- Check claims against the code before telling the user something works; say what wasn't tested.

---

## The product

**Sancus**: a stablecoin account on Circle's **Arc** testnet. One USD balance (USDC) that pays people abroad, with an AI agent that has its own budget and never moves money without the user's confirmation.

- **Focus markets:** Brazil, Thailand, Indonesia, plus the US. **Singapore was removed** (payees, PayNow payouts, HQ).
- **Demo company:** Lion City Trading (HQ in the **US**, USD). Branches: Lion City Jakarta (ID), Jakarta Warehouse (ID), Lion City Bangkok (TH), Lion City New York (US), Brazil (BR).
- **Team:** Vyshalini Rajendran (Engineering Manager & Backend), RuoHan Chen (Product Manager & Backend), Riya Patel (UI/UX Designer), Shrish Kumar (QA & Reliability Engineer).
- **Hackathon entry:** main track **Agentic Payments and AI**, chain award **Best use of Arc**, bounty **ElevenLabs**.
- **Live:** https://sancus-peach.vercel.app · repo `vysha-exe/Sancus` (still **private**).

### Demo logins
- Business admin: `admin@gmail.com` (simple login). Acts as the funded owner `demo@sancus.app`, who holds the company's Circle wallets.
- Employee: `employee@gmail.com` (simple login), named Niran, at Lion City Bangkok.
- Branch admin (Ploy, Bangkok) and personal account ("Jayden", display name now "Vysha"): `/api/sancus/demo-login?as=branch|individual` (local; production needs `SANCUS_DEMO_LOGIN_ALLOW_PRODUCTION`).
- Demo Niran (`demo+employee@sancus.app`) is an employee at Lion City Bangkok, New York and Jakarta.
- Seeded people per branch (Dewi, Budi, Rizky at Jakarta; Agus, Siti at Warehouse; Somsak at Bangkok; Emily, Marcus at New York; Wei Jie, Aisha, Daniel at HQ).

---

## Tech stack (verified in code)

- **Chain:** Arc testnet, chain ID 5042002. USDC is gas.
- **Circle Developer-Controlled Wallets:** one wallet set per company; SCA **treasury + settlement wallet per company node** (settlement wallets were created for all nodes this session); personal treasury/settlement for individuals.
- **Circle App Kit** (+ Circle Wallets adapter): `kit.send`, `kit.unifiedBalance.*` (Gateway), `kit.swap` (USDC⇄EURC, UI card not mounted).
- **Circle Gateway:** unified balance; treasury = wallet USDC + Gateway USDC; x402 revenue lands here.
- **Circle Gateway Nanopayments / x402** (`@circle-fin/x402-batching`): agent pays with `GatewayClient`; Sancus sells `/api/x402/route-quote` with `BatchFacilitatorClient`; Arc testnet `eip155:5042002`; $0.01/call; agent daily cap $0.50; validity 7 days.
- **Not used:** Gas Station/Paymaster, CCTP (only template code), EarnKit/Onramp/Compliance (template leftovers).
- **Contracts (ours):** `SancusMockStablecoin` deployed as **fUSDC** (test settlement token, mint/burn by a rail bot) and mTHB/mIDR/mBRL. An fUSDC "transfer" = **burn from payer + mint to receiver** (two Arc txs). Budgets/limits are in the app/DB, not onchain.
- **Agent:** OpenAI **GPT-4o** (`OPENAI_AGENT_MODEL`), our own tool loop (`lib/sancus/agent/openai-runner.ts`), max 12 steps, NDJSON streaming. Proposals HMAC-signed, 10-min expiry, one allowlisted endpoint per kind, idempotent execute.
- **Voice:** ElevenLabs streaming TTS, Flash v2.5, default voice Sarah (`EXAVITQu4vr4xnSDxMaL`); browser Web Speech for listening.
- **Rails:** Pix via PayZu (sandbox/simulated), PromptPay + BI-FAST payouts via Xendit (**no Xendit key set anywhere → always simulated `SIM-XE-…`**), mock ACH, Marqeta cards (sandbox), Omise/Midtrans QR collections, Sancus QR (real Arc payment), NFC (Android PoC).
- **App:** Next.js 16, React 19, TypeScript, Supabase (Postgres + RLS + Auth), viem, Zod, Vitest, Vercel.
- **FX:** live ECB via Frankfurter (+ open.er-api fallback), 10-min cache. Note: the onchain leg of local-rail payouts still converts at **fixed** rates (`FIXED_USD_RATES`).

---

## What was built this session (all pushed unless noted)

- **Accounts:** four account types (Admin, Branch, Employee, Individual) with per-type nav; agent for every type; seeded people + **"Who works where"** org chart on Branches; Team "Logins" list follows the branch switcher.
- **Singapore removed:** deleted 12 PayNow payouts + linked rows; HQ moved to US; payees now TH/ID/BR + US; Pay flow pays via Xendit (PromptPay/BI-FAST) and Pix with live quotes; Add payee supports Thai mobile, Indonesian bank, Pix key.
- **Agent:** OpenAI runner (teammate), per-account tools (`my_spending` for employees, personal payees for individuals, no pay tools without `money.send`), `open_page`, `request_payment_qr` ("make a QR to receive ฿25" opens Pay with QR › My code prefilled), page context sent with each request.
- **Voice:** "Ask Sancus" call button on every page; shared conversation between call and Agents chat; confirm cards in voice mode and call panel; conversation-start bug and missing-confirm bug fixed.
- **Pay by virtual card** (`/card`): self-issued cards for admins/branch admins/individuals (personal = personal balance), purchases settle onchain; **Tap with NFC** panel with Receive by NFC and Pay by NFC (optional amount + currency, "pay whatever they ask").
- **Pay with QR** (`/qr`): signed Sancus-to-Sancus codes (link `/qr?pay=…`), optional amount in USD/THB/IDR/BRL, payer prompted for amount on open codes, live rate, onchain transfer, recent QR payments; shared camera scanner (auto-starts; back camera on phones, webcam on laptops).
- **Process page:** each row lists **both** fUSDC legs (burn + mint) with Arc links; QR payments and personal card purchases now appear.
- **Settlement wallets:** every company node has its own Circle settlement wallet; payouts settle onchain to it.
- **README:** rewritten for UBC (submission table, architecture, Arc usage + addresses, agent decision loop + safety limits, ElevenLabs, real vs simulated, detailed tech stack).
- **Last commit pushed:** `951905a` (QR: shorter codes and smoother phone scanning; session refresh for API calls).

### Database migrations applied this session
- `20261120400000_sancus_qr_payments.sql` (table for Sancus QR payments)
- `20261120410000_sancus_fusdc_mint_hashes.sql` (`mint_tx_hash` on xendit/pix/ach/qr payments)
- Data changes: Singapore payouts deleted; HQ → US/USD; memberships moved to the funded company; settlement wallets created; Niran added to Lion City Jakarta.

---

## Open issues / next steps

- **Before going public:** rotate every key in `secrets/env.team` (Supabase service key, DB password, Circle API key + entity secret, Marqeta, Omise, Midtrans) and purge it from git history (or publish a fresh repo). `SANCUS-SETUP.md` still tells people to copy `secrets/env.team`. Then make the repo public (Devpost requires it).
- **Approvals/limits** aren't enforced on the Xendit and Pix payout routes (they are on ACH/treasury payouts).
- **Xendit:** add a test key (`XENDIT_SECRET_KEY`, `xnd_development_…`, Money-out write) locally and on Vercel to test the real sandbox.
- **Onchain leg FX:** switch `local-rail-onchain.ts` from fixed rates to live rates.
- **Admin Receive by NFC** auto-completes after 4 seconds (green "Payment succeeded" + beep). Remove it when the user says real NFC is working (`ADMIN_RECEIVE_AUTOCOMPLETE_MS` in `components/sancus-ui/nfc-panel.tsx`). Don't describe this as temporary in commit messages.
- **QR on phones:** new compact codes (old codes no longer scan); verify on a real phone after deploy.
- **Tests:** 4 failing (branch admins can now send money; one treasury-equities UI assertion). Lint has many pre-existing errors.
- **Process page:** QR payments show branch-transfer steps; could get QR-specific steps.
- Hide Dev QA / Process / Dev tabs before submission if not wanted in the demo.

---

## Video material (this session)

- **Demo script** (~3 min, Circle-heavy, no Xendit rails) and a **90-second pitch** with all four teammates in roles: Vyshalini (coffee importer paying Brazil), RuoHan (Bangkok café receiving by NFC), Riya (traveller paying by QR/tap), Shrish (friend scanning QR + "Ask Sancus").
- **Intro gag:** "Leather Jacket Keynote" parody (no NVIDIA logo or names on screen, no implied endorsement).
- **Don't claim:** onchain budgets, Gas Station/Paymaster/CCTP, x402 on non-Arc chains, live production payouts, "nine rails".

---

## Handy paths

- Agent: `app/app/api/sancus/agent/route.ts`, `app/lib/sancus/agent/tools.ts`, `proposals.ts`, `x402-wallet.ts`, `openai-runner.ts`
- Voice/call: `app/components/sancus-ui/agent-call.tsx`, `agent-shared.tsx`, `agent-console.tsx`, `app/app/api/sancus/agent/speak/route.ts`
- QR: `app/app/(sancus)/qr/page.tsx`, `app/components/sancus-ui/qr-scanner.tsx`, `app/lib/sancus/sancus-qr.ts`, `qr-server.ts`, `app/app/api/sancus/qr/*`
- Cards/NFC: `app/app/(sancus)/card/page.tsx`, `app/components/sancus-ui/nfc-panel.tsx`, `app/app/api/sancus/my-card/*`, `app/app/api/sancus/nfc/*`
- Pay flow: `app/lib/sancus/pay-flow.tsx`, `pay-quote.ts`, `custom-payees.ts`, `demo-data.ts`
- Accounts: `app/lib/sancus/accounts.ts`, `demo-accounts.ts`, `app/lib/api/with-auth.ts`, `app/proxy.ts`, `app/lib/supabase/api-session.ts`
- Process log: `app/lib/sancus/use-process-log.ts`, `app/components/sancus-ui/process-dashboard.tsx`
- Contracts: `app/contracts/README.md`
