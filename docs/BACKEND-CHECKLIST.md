# Sancus Backend Build Checklist

*Every backend feature from the PRD and team decisions, with the endpoint it needs, its status and what "done" means. Last updated Nov 17, 2026. Deadline: **Nov 20, 12 PM CST** (Devpost).*

**Stack:** Next.js API routes in [`app/`](../app/) · Supabase (Postgres + auth) · Circle developer-controlled wallets, Gateway, Gas Station, Nanopayments on **Arc testnet** · partners behind adapters (StraitsX, Bridge, Marqeta, Midtrans, Omise).

**Legend**
- Status: ✅ done & tested · 🟡 partial / simulated · ⬜ not started
- Priority: **P0** = needed for the demo · **P1** = makes the demo strong / hits a prize · **P2** = stretch or pitch-only
- Owner: fill in your name when you take a row.

---

## 0. Demo-critical path (do these first, in order)

1. ⬜ Circle keys + entity secret in `.env.local`; create Arc testnet wallets; fund from faucet (§2)
2. ✅ Treasury summary endpoint (§2.3)
3. 🟡 Ledger entries for every money movement (§9): payouts done; cards, deposits, x402 still to add
4. ⬜ Policy engine + approvals (§3, §4)
5. ✅ Singapore PayNow payout, simulated (§6.1) → ⬜ StraitsX sandbox if access arrives
6. ⬜ Real USDC leg on Arc (`SANCUS_SETTLEMENT_ADDRESS`) (§6.1)
7. ⬜ Cards: issue + simulated purchase with hold (§8)
8. ⬜ x402 earning endpoint (§13)
9. ⬜ Seed / reset script for the demo company (§18)

---

## 1. Cross-cutting foundations

| ☐ | Feature | Endpoint / file | Status | Pri | Owner | Done when |
|---|---|---|---|---|---|---|
| ☐ | Env config documented | `app/.env.example` | ✅ | P0 | | Every var below is listed with a comment |
| ☐ | Auth (Supabase) on every route | `lib/api/with-auth.ts` | ✅ | P0 | | All `/api/sancus/*` routes return 401 when signed out |
| ☐ | Demo auto-login bypass | `GET /api/sancus/demo-login`, `proxy.ts` | ✅ | P0 | | Signed-out visit lands on dashboard when `SANCUS_DEMO_LOGIN=true` |
| ☐ | Idempotency on every money-moving POST | `Idempotency-Key` header | 🟡 (payouts only) | P0 | | Replaying any POST returns the original result, moves no money |
| ☐ | Consistent error shape `{ error, issues?, userMessage? }` | all routes | 🟡 | P1 | | Frontend shows field errors from `issues` |
| ☐ | Integer money everywhere (minor units) | `lib/sancus/money.ts` | ✅ | P0 | | No floats in DB columns or math for new tables |
| ☐ | Audit log of state changes | `sancus_events` table | ⬜ | P1 | | Every status change writes who/what/when |
| ☐ | Unit tests for each `lib/sancus/*` module | `tests/sancus-*.test.ts` | 🟡 | P0 | | `npm test` green before each push |
| ☐ | Rate limiting on public endpoints (x402, webhooks) | middleware | ⬜ | P2 | | 429 after N requests/min |

## 2. Treasury & wallets (Circle)

| ☐ | Feature | Endpoint / file | Status | Pri | Owner | Done when |
|---|---|---|---|---|---|---|
| ☐ | 2.1 Create wallet set + wallets on `ARC-TESTNET` | `POST /api/wallet-set`, `POST /api/wallet` | ✅ upstream | P0 | | Wallet appears in dashboard with an Arc address |
| ☐ | Wallet balances (USDC/EURC) | `POST /api/wallet/balance` | ✅ upstream | P0 | | Matches faucet amount |
| ☐ | Same-chain USDC transfer | `POST /api/wallet/transfer` | ✅ upstream | P0 | | Returns Circle tx id + Arc tx hash |
| ☐ | Address validation | `POST /api/wallet/validate-address` | ✅ upstream | P1 | | Bad address rejected before send |
| ☐ | 2.2 Gateway unified balance | `POST /api/gateway/balance` | ✅ upstream | P0 | | Shows one USDC total across chains |
| ☐ | Gateway deposit | `POST /api/gateway/deposit` | ✅ upstream | P0 | | Deposit finalizes; webhook updates balance |
| ☐ | Gateway payout / mint on destination chain | `POST /api/payout` | ✅ upstream | P1 | | USDC minted on chosen chain from Gateway balance |
| ☐ | Gateway signer wallets | `POST /api/wallet/create-gateway-signers` | ✅ upstream | P1 | | Burn intents sign successfully |
| ☐ | Cross-chain bridge + rebalance | `/api/bridge/estimate`, `/api/bridge/rebalance`, `/api/bridge/monitor` | ✅ upstream | P2 | | Estimate returns fee; rebalance completes |
| ☐ | **2.3 Treasury summary** (available / reserved / in-flight / total + ledger check) | `GET /api/sancus/treasury` | ✅ (card holds to add with §8) | **P0** | | Sum of Circle wallets + Gateway − pending payouts; shown on Pay page; tested |
| ☐ | Gas Station policy for Arc testnet | Circle Console (no code) | ⬜ | P0 | | Transfers succeed from wallets with 0 native gas (use SCA wallets) |
| ☐ | Treasury / operator / agent wallet roles | `wallets.type` or new column | ⬜ | P1 | | Each company has one treasury, one operator, one agent wallet |
| ☐ | Circle webhooks (wallet + Gateway) | `POST /api/circle/webhook`, `/api/circle/gateway-webhook`, `/api/gateway/webhook/register` | ✅ upstream | P0 | | Needs public URL (ngrok); events dedupe on id |

## 3. Spending controls & policy engine

| ☐ | Feature | Endpoint / file | Status | Pri | Owner | Done when |
|---|---|---|---|---|---|---|
| ☐ | Policy model: per-user daily limit, per-payment limit, approval threshold, blocked recipients | `sancus_policies` table + `lib/sancus/policy.ts` | ⬜ | **P0** | | Unit tests: over-limit blocked, over-threshold → `PENDING_APPROVAL` |
| ☐ | Read / update policies (admins only) | `GET/PUT /api/sancus/policies` | ⬜ | P0 | | Non-admin gets 403 |
| ☐ | Enforce policy in payouts, cards, agent | called from §5, §8, §14 | ⬜ | P0 | | A payout over threshold waits for approval instead of sending |
| ☐ | `SancusTreasury.sol`: daily limits, threshold approvals, holds, pause | `contracts/` (Foundry) | ⬜ | P1 | | `forge test` passes: limit, approval, idempotent paymentId, hold/settle/release |
| ☐ | Deploy to Arc testnet + record address | `contracts/deployments/5042002.json` | ⬜ | P1 | | Address in `.env`; verified on explorer.testnet.arc.io |
| ☐ | Call contract via Circle contract-execution API (operator wallet) | `lib/sancus/treasury-contract.ts` | ⬜ | P1 | | Onchain pay/hold/settle from backend with no private key in code |

## 4. Approvals

| ☐ | Feature | Endpoint / file | Status | Pri | Owner | Done when |
|---|---|---|---|---|---|---|
| ☐ | Approval queue | `GET /api/sancus/approvals` | ⬜ | **P0** | | Lists payments in `PENDING_APPROVAL` for admins |
| ☐ | Approve / reject | `POST /api/sancus/approvals/:id/approve`, `/reject` | ⬜ | P0 | | Approve resumes the payout; reject → `REJECTED`, no money moves |
| ☐ | Passkey (Face ID / Touch ID) approval via Circle modular wallet | `lib/sancus/passkey.ts` | ⬜ | P1 | | Approval requires a WebAuthn signature from the admin's passkey |
| ☐ | Voice approval prompt (ElevenLabs) | `POST /api/sancus/approvals/:id/voice` | ⬜ | P2 | | Reads out "Approve S$5,000 to Lim Trading?" (ElevenLabs bounty) |

## 5. Payments core (router, quotes, state machine)

| ☐ | Feature | Endpoint / file | Status | Pri | Owner | Done when |
|---|---|---|---|---|---|---|
| ☐ | Rail adapter interface (`quote / submit / status`) | `lib/sancus/rails/` | 🟡 (SG provider only) | P0 | | PayNow, onchain USDC, ACH, cards all implement it |
| ☐ | Multi-rail router: picks cheapest / fastest, explains why | `lib/sancus/router.ts` | 🟡 (PayNow vs FAST) | P1 | | Returns chosen rail + alternatives + one-line reason |
| ☐ | Generic quote across rails | `POST /api/sancus/payments/quote` | ⬜ | P1 | | Same request returns quotes for each supported rail |
| ☐ | Generic create / list / get / cancel | `POST/GET /api/sancus/payments`, `GET /api/sancus/payments/:id`, `POST /api/sancus/payments/:id/cancel` | ⬜ | P1 | | Cancel releases any hold; illegal transitions rejected |
| ☐ | State machine incl. `PENDING_APPROVAL`, `REJECTED`, `CANCELLED`, `REFUNDED` | `lib/sancus/payout-provider.ts` | 🟡 | P0 | | Tests cover every legal and illegal transition |
| ☐ | Recipients address book | `GET/POST /api/sancus/recipients` | ⬜ | P1 | | Saved suppliers prefill the Pay form |

## 6. Payout rails

### 6.1 Singapore (PayNow / FAST): main corridor
| ☐ | Feature | Endpoint / file | Status | Pri | Owner | Done when |
|---|---|---|---|---|---|---|
| ☐ | Recipient validation (mobile, UEN, bank + SWIFT) | `lib/sancus/paynow.ts` | ✅ | P0 | | 17 unit tests pass |
| ☐ | FX quote USDC→SGD (rate, spread, fee, 60s expiry) | `POST /api/sancus/payouts/quote` | 🟡 simulated rate | P0 | | Matches test values; replaced by partner quote when live |
| ☐ | Create / list payouts, idempotent | `POST/GET /api/sancus/payouts` | ✅ | P0 | | Tested: replay returns same payout |
| ☐ | Payout detail | `GET /api/sancus/payouts/:id` | ⬜ | P1 | | Returns one payout with timeline |
| ☐ | Simulated lifecycle + S$13.13 failure | `lib/sancus/payout-provider.ts` | ✅ | P0 | | Tested end to end in browser |
| ☐ | **Real USDC leg on Arc** | set `SANCUS_SETTLEMENT_ADDRESS`, pick wallet | 🟡 code done, untested | **P0** | | Payout shows a real Arc tx hash link |
| ☐ | StraitsX sandbox adapter (PayNow proxy / FAST, mocked status) | `lib/sancus/rails/straitsx.ts` | ⬜ (blocked on access) | P1 | | Payout gets a StraitsX ref; status from their API |
| ☐ | StraitsX callback | `POST /api/sancus/webhooks/straitsx` | ⬜ | P1 | | Signature verified; status updated; deduped |
| ☐ | Policy check before payout (§3) | in `POST /api/sancus/payouts` | ⬜ | P0 | | Over-threshold payout → approval queue |
| ☐ | Ledger entries on each step (§9) | in payout flow | ⬜ | P0 | | Debits/credits balance for every payout |

### 6.2 Onchain USDC
| ☐ | Feature | Endpoint / file | Status | Pri | Owner | Done when |
|---|---|---|---|---|---|---|
| ☐ | Pay a crypto vendor on Arc | via `POST /api/sancus/payments` (rail `USDC_ONCHAIN`) | 🟡 (upstream transfer exists) | P0 | | Real tx hash in Activity + ledger |
| ☐ | Attach invoice reference (Arc Memo contract) | `lib/sancus/memo.ts` | ⬜ | P2 | | Memo event carries invoice id; reconcile on `Transfer` event |

### 6.3 US ACH / wire (Bridge)
| ☐ | Feature | Endpoint / file | Status | Pri | Owner | Done when |
|---|---|---|---|---|---|---|
| ☐ | Bridge customer + KYB (sandbox) | `lib/sancus/rails/bridge.ts` | ⬜ (blocked on access) | P1 | | `simulate_kyc_approval` passes |
| ☐ | External account (ACH routing + account) | `POST /api/sancus/recipients` (type `US_BANK`) | ⬜ | P1 | | Stored and masked |
| ☐ | ACH payout transfer | rail `ACH` | ⬜ | P1 | | Bridge transfer created; status polled + webhook |
| ☐ | Bridge webhook | `POST /api/sancus/webhooks/bridge` | ⬜ | P1 | | Deduped, updates payment status |
| ☐ | Simulated fallback if no access by Nov 18 | `lib/sancus/rails/ach-sim.ts` | ⬜ | P0 | | ACH payment walks through statuses with `SIMULATED` badge |

### 6.4 Other rails
| ☐ | Feature | Endpoint / file | Status | Pri | Owner | Done when |
|---|---|---|---|---|---|---|
| ☐ | SEPA, SPEI, Pix payouts (simulated) | `lib/sancus/rails/*-sim.ts` | ⬜ | P2 | | Show in router alternatives |
| ☐ | Visa Direct "pay to card" (simulated) | `lib/sancus/rails/visa-direct-sim.ts` | ⬜ | P2 | | Optional rail in router |

## 7. Collections & on-ramp (money in)

| ☐ | Feature | Endpoint / file | Status | Pri | Owner | Done when |
|---|---|---|---|---|---|---|
| ☐ | Port QRIS (Midtrans) charge from `rails-demo` | `POST /api/sancus/collections` (rail `QRIS`) | 🟡 (works in rails-demo) | P1 | | QR returned; Midtrans simulator pays it; status → paid |
| ☐ | Port PromptPay (Omise) charge | rail `PROMPTPAY` | 🟡 (rails-demo) | P1 | | Same as above via Omise test dashboard |
| ☐ | Port Pix (PayZu) charge | rail `PIX` | 🟡 (rails-demo) | P2 | | Auto-completes ~10s in PayZu sandbox |
| ☐ | Collection status | `GET /api/sancus/collections/:id/status` | 🟡 (rails-demo) | P1 | | Polls provider; ledger credit on paid |
| ☐ | Provider webhooks (Midtrans / Omise) | `POST /api/sancus/webhooks/{midtrans,omise}` | ⬜ | P2 | | Signature verified; deduped |
| ☐ | USD deposit → USDC (Bridge virtual account) | `POST /api/sancus/deposits/bridge` | ⬜ (blocked on access) | P1 | | `simulate_deposit` credits treasury |
| ☐ | Card / Apple Pay top-up (Circle Onramp Kit) | `POST /api/onramp/session` | 🟡 upstream, key untested | P2 | | Sandbox purchase settles into an Arc wallet |

## 8. Corporate cards (Marqeta)

| ☐ | Feature | Endpoint / file | Status | Pri | Owner | Done when |
|---|---|---|---|---|---|---|
| ☐ | Port Marqeta adapter from `rails-demo` | `lib/sancus/rails/marqeta.ts` | 🟡 (rails-demo) | P1 | | Uses `MARQETA_*` env in `app/` |
| ☐ | Issue virtual card to an employee with a limit | `POST /api/sancus/cards` | ⬜ | **P0** | | Card shows last 4 + limit |
| ☐ | List / freeze / change limit | `GET /api/sancus/cards`, `PATCH /api/sancus/cards/:id` | ⬜ | P1 | | Frozen card declines |
| ☐ | Simulate purchase → authorization hold → settle / release | `POST /api/sancus/cards/:id/simulate-purchase`, `POST /api/sancus/cards/authorizations/:id/settle` | ⬜ | P0 | | $100 approved (hold), $600 on $500 card declined |
| ☐ | Real-time auth decision (Marqeta Gateway JIT Funding) | `POST /api/sancus/webhooks/marqeta/jit` | ⬜ | P1 | | Policy engine decides approve/decline in < 2s |

## 9. Ledger & reconciliation

| ☐ | Feature | Endpoint / file | Status | Pri | Owner | Done when |
|---|---|---|---|---|---|---|
| ☐ | Double-entry ledger (journals + entries, posted atomically via `sancus_post_journal()`; balanced + idempotent) | `supabase/migrations/20261117130000_create_sancus_ledger.sql` | ✅ | **P0** | | DB rejects unbalanced journals; reposting an event is a no-op |
| ☐ | Balanced entries for payouts | `lib/sancus/ledger.ts` → `syncPayoutLedger()` | ✅ | P0 | | created → completed/failed tested in browser |
| ☐ | Balanced entries for cards, deposits, collections, x402 earnings | `lib/sancus/ledger.ts` | ⬜ | P0 | | Add a journal builder per flow + tests |
| ☐ | Ledger API + CSV export | `GET /api/sancus/ledger`, `GET /api/sancus/ledger?format=csv` | ✅ | P1 | | CSV downloads with debit/credit columns |
| ☐ | Reconciliation: ledger in-transit vs payouts in progress | in `GET /api/sancus/treasury` (`ledger.inSync`) | ✅ | P1 | | "Ledger in sync" badge; mismatch shows a warning |
| ☐ | Reconciliation: ledger funding vs onchain deposits | needs deposit journals (QuickNode / Circle webhooks) | ⬜ | P1 | | Onchain inflows post `funding:external` journals |
| ☐ | Live chain events via QuickNode Streams on Arc | `POST /api/sancus/webhooks/quicknode` | ⬜ | P1 | | Treasury transfers appear in ledger without polling (**QuickNode $500 bounty**) |

## 10. Business accounts & team

| ☐ | Feature | Endpoint / file | Status | Pri | Owner | Done when |
|---|---|---|---|---|---|---|
| ☐ | Company model (one per user for demo) | `sancus_companies` migration | ⬜ | P1 | | Demo company "Lion City Trading Pte Ltd" exists |
| ☐ | Members + roles (OWNER / ADMIN / FINANCE / EMPLOYEE) | `sancus_memberships` | ⬜ | P1 | | Role checked in policy engine + approvals |
| ☐ | Create / get company | `POST /api/sancus/companies`, `GET /api/sancus/companies/me` | ⬜ | P1 | | Onboarding creates company + wallets |
| ☐ | Invite member / change role | `POST /api/sancus/companies/members`, `PATCH /api/sancus/companies/members/:id` | ⬜ | P2 | | Invited user sees company on login |

## 11. Invoices

| ☐ | Feature | Endpoint / file | Status | Pri | Owner | Done when |
|---|---|---|---|---|---|---|
| ☐ | Upload invoice (PDF/image) to Supabase Storage | `POST /api/sancus/invoices` | ⬜ | P1 | | File stored, row created |
| ☐ | Extract vendor, amount, currency, due date (LLM) | `lib/sancus/invoice-extract.ts` | ⬜ | P1 | | Prefills Pay form; user confirms |
| ☐ | List / pay invoice | `GET /api/sancus/invoices`, `POST /api/sancus/invoices/:id/pay` | ⬜ | P1 | | Payment links back to invoice; invoice → paid |

## 12. Compliance

| ☐ | Feature | Endpoint / file | Status | Pri | Owner | Done when |
|---|---|---|---|---|---|---|
| ☐ | Address screening (Circle Compliance Engine) | `POST /api/compliance/screen`, `GET /api/compliance/logs` | ✅ upstream (engine access gated) | P1 | | Confirm behavior without engine access |
| ☐ | Screen recipient before every payout | in payments flow | ⬜ | P1 | | Blocked recipient → payout refused with reason |
| ☐ | Simple blocklist (stand-in for sanctions screening) | `sancus_policies.blocked_recipients` | ⬜ | P0 | | Tested in policy engine |

## 13. x402 earning treasury (agents pay us)

| ☐ | Feature | Endpoint / file | Status | Pri | Owner | Done when |
|---|---|---|---|---|---|---|
| ☐ | Paid "route quote" API (cheapest rail + FX for a corridor) | `GET /api/x402/route-quote?country=SG&amount=…` | ⬜ | **P1** | | Without payment → `402 Payment Required` with x402 terms |
| ☐ | Settle via Circle Nanopayments (Gateway) on Arc | `lib/sancus/x402.ts` | ⬜ | P1 | | Paid request returns quote; revenue lands in Gateway balance |
| ☐ | Earnings recorded in ledger + shown on dashboard | ledger account `revenue:x402` | ⬜ | P1 | | "Earned $X from N agent calls" |
| ☐ | Test client (agent that pays the endpoint) | `scripts/x402-client.mjs` | ⬜ | P1 | | Demo: run script, watch treasury go up |
| ☐ | List endpoint on x402 Bazaar | discovery metadata | ⬜ | P2 | | Appears in Bazaar discovery API |

## 14. AI accounts-payable agent

| ☐ | Feature | Endpoint / file | Status | Pri | Owner | Done when |
|---|---|---|---|---|---|---|
| ☐ | Agent wallet (Circle dev wallet) with spending caps from policy | §2 + §3 | ⬜ | P1 | | Agent can't exceed its cap even if prompted |
| ☐ | Run agent: read unpaid invoices → propose / execute payouts within policy | `POST /api/sancus/agent/run` | ⬜ | P1 | | Logs each decision with reasoning |
| ☐ | Agent buys data over x402 (e.g. FX or verification) | `lib/sancus/agent-x402-client.ts` | ⬜ | P2 | | Paid call from agent wallet, capped |
| ☐ | Agent activity feed | `GET /api/sancus/agent/log` | ⬜ | P2 | | Shown in dashboard |

## 15. Stretch & pitch-only

| ☐ | Feature | Endpoint / file | Status | Pri | Owner | Done when |
|---|---|---|---|---|---|---|
| ☐ | ERC-8004 vendor identity / reputation gating (Arc registries) | `lib/sancus/erc8004.ts` | ⬜ | P2 | | Payout to unregistered vendor needs extra approval |
| ☐ | AuthCaptureEscrow holds (Circle Arc sample) | contracts | ⬜ | P2 | | PO authorized → captured on delivery |
| ☐ | Gemini prediction-market hedge suggestions (FX/macro) | `GET /api/sancus/hedges` | ⬜ | P2 | | Reads public Gemini markets; suggests a hedge (Gemini bounty) |
| ☐ | Yield on idle treasury (EarnKit) | `/api/earn/*` | ✅ upstream | P2 | | Sweep idle USDC into a vault |
| ☐ | Tokenized-stock treasury allocation | pitch slide only | ⬜ | P2 | | Slide in deck |

## 16. Demo data & ops

| ☐ | Feature | Endpoint / file | Status | Pri | Owner | Done when |
|---|---|---|---|---|---|---|
| ☐ | Seed: demo company, recipients, policies, a few past payouts | `supabase/seed.sql` or `scripts/seed.mjs` | ⬜ | **P0** | | Fresh DB looks like a real company in one command |
| ☐ | Dev-only reset | `POST /api/sancus/dev/reset` (non-production only) | ⬜ | P1 | | Resets demo data between rehearsals |
| ☐ | Hosted demo (Vercel + Supabase cloud) | deploy | ⬜ | P1 | | Judges can open a URL; demo login on, testnet only |
| ☐ | Public webhook URL (ngrok or deployed) | `WEBHOOK_ENDPOINT_URL` | ⬜ | P0 | | Circle/QuickNode/partner webhooks reach the app |

---

## Credentials still needed

| Credential | For | Status |
|---|---|---|
| `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET` | Wallets, Gateway, transfers | ⬜ each dev: console.circle.com |
| `KIT_KEY` (sandbox) | Swap, Earn, Onramp Kit | ⬜ |
| `SANCUS_SETTLEMENT_ADDRESS` | Real USDC leg of SG payouts | ⬜ any Arc testnet address we control |
| StraitsX sandbox key | Real PayNow payouts | ⬜ outreach sent? |
| Bridge sandbox key (`sk-test…`) | ACH + USD deposits | ⬜ email support@bridge.xyz |
| `MARQETA_*`, `MIDTRANS_SERVER_KEY`, `OMISE_SECRET_KEY`, `PAYZU_SANDBOX_TOKEN` | Cards + collections | 🟡 RuoHan has some in `rails-demo/.env` |
| QuickNode Streams account (Arc) | Live ledger (bounty) | ⬜ |
| LLM API key | Invoice extraction, AP agent | ⬜ |

## Definition of done (demo-ready)

- [ ] Signed-out visit → dashboard (demo login)
- [ ] Treasury shows a real Arc USDC balance and a Gateway balance
- [ ] Pay S$2,000 by PayNow → real Arc tx hash for the USDC leg → Delivered
- [ ] A S$15,000 payout waits for admin approval, then completes after approval
- [ ] Card with $500 limit: $100 approved (hold → settle), $600 declined
- [ ] QRIS or PromptPay collection paid in sandbox → ledger credit
- [ ] An agent pays the x402 route-quote endpoint → treasury earnings go up
- [ ] Ledger balances and matches the onchain balance
- [ ] `npm test` green, `next build` passes, no secrets in git
