# Sancus: Initial Build Instructions

Step-by-step instructions to build the Sancus hackathon prototype from an empty repo. Work through the phases in order. Each phase ends with a **Done when** check. Hand this file to a teammate or a coding agent as the source of truth.

**Golden rules**
1. **Only USDC on testnet is real.** Every bank, local-rail, FX and card flow is simulated and must be labeled `SIMULATED` in the UI and API responses.
2. **The ledger is the source of truth for the app; the chain is the source of truth for USDC.** Reconcile the two; never let them silently disagree.
3. **Every money-moving request is idempotent.** Each takes an `idempotencyKey`; replaying it must not move money twice.
4. **Integer money only.** Store amounts as integer minor units (USDC: 6 decimals; fiat: 2). Never use floats.
5. **No real secrets or real customer data.** Testnet keys only; seed data is fictional.

---

## Phase 0: Decisions (5 minutes)

| Decision | Default | Notes |
|---|---|---|
| Chain | **Base Sepolia** (chain ID 84532) | The contracts are plain EVM. To compete for a Circle/Arc prize, switch to **Arc testnet** (chain ID 5042002, USDC is the gas token). Only `.env` changes. On Arc, read USDC's `decimals()` instead of assuming 6. |
| Backend language | **TypeScript** | The PRD allows Go or TS. TS keeps one language across web, core and scripts. |
| ORM | **Prisma** | Drizzle is fine too; pick one and stay with it. |
| Package manager | **pnpm** workspaces | |

---

## Phase 1: Scaffold the monorepo

```bash
pnpm init
mkdir -p apps packages
pnpm dlx create-next-app@latest apps/web --ts --tailwind --app --eslint --src-dir --import-alias "@/*"
mkdir -p packages/core/src packages/db
cd packages && forge init contracts --no-git && cd ..
```

Create `pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Root `package.json` scripts:
```json
{
  "scripts": {
    "dev": "pnpm --filter web dev",
    "test": "pnpm -r test && pnpm contracts:test",
    "contracts:build": "cd packages/contracts && forge build",
    "contracts:test": "cd packages/contracts && forge test -vv",
    "contracts:deploy": "cd packages/contracts && forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast",
    "db:migrate": "pnpm --filter db prisma migrate dev",
    "db:seed": "pnpm --filter db seed"
  }
}
```

Install OpenZeppelin in the contracts package:
```bash
cd packages/contracts && forge install OpenZeppelin/openzeppelin-contracts --no-git
```

Local Postgres (Docker):
```bash
docker run -d --name sancus-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=sancus -p 5432:5432 postgres:16
```

**Done when:** `pnpm dev` serves the Next.js starter page, `forge build` succeeds, and Postgres accepts connections.

---

## Phase 2: Treasury smart contract (`packages/contracts`)

One contract per company: `SancusTreasury.sol`. It holds the company's USDC and enforces who can move it, how much, and with what approvals.

### Roles (OpenZeppelin `AccessControl`)
| Role | Who | Can |
|---|---|---|
| `ADMIN_ROLE` | Company owners | Set limits, add/remove signers, approve large payments, pause |
| `SPENDER_ROLE` | Finance staff wallets | Propose and execute payments within limits |
| `OPERATOR_ROLE` | Sancus backend key (testnet) | Create and settle **holds** for off-chain rails and cards |

### State
- `IERC20 usdc` (immutable)
- `mapping(address => uint256) dailyLimit` and `spentToday` with a day index for resets
- `uint256 approvalThreshold`: payments above this need an admin approval
- `mapping(bytes32 => Hold) holds`: `{ amount, status (None/Active/Settled/Released), createdAt }`
- `uint256 totalHeld`
- `mapping(bytes32 => bool) executed`: idempotency by `paymentId`
- `address settlementAccount`: where USDC goes when an off-chain payout "settles" (stands in for an off-ramp partner)

### Functions
| Function | Rules |
|---|---|
| `deposit(amount)` | Pulls USDC via `transferFrom`. Anyone can deposit. Emits `Deposited`. |
| `pay(paymentId, to, amount)` | `SPENDER_ROLE`; not already executed; `amount <= available()`; within the caller's daily limit; if `amount > approvalThreshold`, it must already be approved. Emits `Paid`. |
| `approve(paymentId)` | `ADMIN_ROLE`. Marks a large payment approved. Emits `Approved`. |
| `createHold(holdId, amount)` | `OPERATOR_ROLE`. Reserves funds for an off-chain payout or card authorization. `amount <= available()`. |
| `settleHold(holdId, amount)` | `OPERATOR_ROLE`. Transfers `amount` (≤ held) to `settlementAccount` and releases any remainder. Emits `HoldSettled`. |
| `releaseHold(holdId)` | `OPERATOR_ROLE`. Cancels a hold and frees the funds. Emits `HoldReleased`. |
| `available()` | `usdc.balanceOf(this) - totalHeld` |
| `pause()` / `unpause()` | `ADMIN_ROLE`. Kill switch. |

Use `SafeERC20`, `ReentrancyGuard`, `Pausable`. Write custom errors (`ExceedsDailyLimit`, `NeedsApproval`, `AlreadyExecuted`, `InsufficientAvailable`).

### Factory
`SancusTreasuryFactory.create(admin, operator, settlementAccount)` deploys one treasury per company and emits `TreasuryCreated(company, treasury)`.

### Tests (`forge test`)
- deposit → pay within limit succeeds
- pay over daily limit reverts; limit resets the next day (`vm.warp`)
- pay over threshold reverts until an admin approves
- the same `paymentId` twice reverts
- a hold reduces `available()`; settle moves funds; release restores them
- non-role callers revert; paused contract reverts

Use a `MockUSDC` (6 decimals) in tests.

### Deploy
`script/Deploy.s.sol` deploys the factory using `DEPLOYER_PRIVATE_KEY` and `RPC_URL`. Write the deployed address to `packages/contracts/deployments/<chainId>.json` so the backend can read it.

**Done when:** every test passes and the factory is deployed to the testnet, with its address recorded.

---

## Phase 3: Database (`packages/db`)

Prisma models (minimum):

```
Company          id, name, country, baseCurrency, treasuryAddress, createdAt
User             id, email, privyId, walletAddress
Membership       id, companyId, userId, role (OWNER | ADMIN | FINANCE | EMPLOYEE)
Recipient        id, companyId, name, type (WALLET | US_BANK | IBAN | PIX | SPEI), details (JSON), country, currency
Payment          id, companyId, idempotencyKey (unique per company), recipientId, rail,
                 amountUsdMinor, destCurrency, destAmountMinor, fxQuoteId, feeUsdMinor,
                 status, holdId, txHash, simulated (bool), createdBy, createdAt, updatedAt
PaymentEvent     id, paymentId, fromStatus, toStatus, note, createdAt          -- audit trail
Approval         id, paymentId, approverId, decision, createdAt
FxQuote          id, fromCurrency, toCurrency, rate (string, decimal), expiresAt, simulated
Card             id, companyId, userId, last4, limitMinor, spentMinor, status (ACTIVE | FROZEN)
CardAuthorization id, cardId, merchant, amountMinor, status (HELD | SETTLED | RELEASED | DECLINED), holdId
Invoice          id, companyId, fileUrl, vendorName, amountMinor, currency, dueDate, paymentId
LedgerEntry      id, companyId, paymentId?, account, direction (DEBIT | CREDIT), amountMinor, currency, createdAt
```

**Ledger accounts** (double-entry; every money movement writes balanced entries):
`treasury:available`, `treasury:held`, `payouts:in_transit`, `fees:revenue`, `external:<rail>`.

Examples:
- Deposit 10,000: DEBIT `treasury:available` / CREDIT `external:usdc`
- Create hold for a Pix payout: DEBIT `treasury:held` / CREDIT `treasury:available`
- Settle the payout: DEBIT `external:pix` + DEBIT `fees:revenue` / CREDIT `treasury:held`

Add a check that the sum of debits equals the sum of credits for every `paymentId`.

**Seed** (`pnpm db:seed`): *Café Paulista Ltda* (BR, base BRL) with an owner, a finance user and an employee; recipients: a USDC vendor wallet, a US supplier (ACH), a Brazilian contractor (Pix key), a Mexican vendor (SPEI CLABE), a German vendor (IBAN).

**Done when:** migrations run cleanly and the seed creates the demo company.

---

## Phase 4: Core services (`packages/core`)

Pure TypeScript with no framework imports, so it's easy to unit-test (Vitest).

### 4.1 Rail adapter interface
```ts
interface RailAdapter {
  rail: Rail;                         // USDC_ONCHAIN | ACH | WIRE | SEPA | PIX | SPEI | CARD
  simulated: boolean;
  supports(recipient: Recipient): boolean;
  quote(req: PaymentRequest): Promise<RailQuote>;   // fee, fx, destAmount, eta
  submit(payment: Payment): Promise<SubmitResult>;  // returns external ref
  status(externalRef: string): Promise<RailStatus>;
}
```

Implementations:
| Adapter | Behavior |
|---|---|
| `UsdcOnchainAdapter` | **Real.** Calls `treasury.pay()` via viem; status comes from the tx receipt. |
| `AchSimAdapter` | Fee $0.50, ETA 1–2 business days, settles after a configurable delay (default 20s for demos). |
| `WireSimAdapter` | Fee $15, same day. |
| `SepaSimAdapter` | EUR, fee €0.30, 1 day. |
| `PixSimAdapter` | BRL, fee ~0.5%, near-instant. |
| `SpeiSimAdapter` | MXN, fee ~0.5%, near-instant. |
| `CardSimAdapter` | Authorization → hold → settle or release. |

Simulated adapters live in `adapters/sim/` and **always** return `simulated: true`. Put fees, ETAs and delays in one config file so the demo can tune them.

### 4.2 FX quotes (simulated)
`FxService.quote(from, to)` returns a rate from a static table plus small random jitter, valid for 60s. Store quotes; a payment must reference an unexpired quote. Use decimal strings or integer math, never floats.

### 4.3 Payment router
`route(request) → RouteDecision`:
1. Filter adapters with `supports(recipient)`.
2. Get a quote from each candidate.
3. Score: `cost + speedWeight × etaHours` (weights in config; the user can choose "cheapest" or "fastest").
4. Return the chosen rail **plus the alternatives and a one-line explanation** ("Pix: R$ arrives in seconds, 0.5% fee vs. wire $15").

### 4.4 Policy engine
Checks before any payment executes:
- the user's role allows paying (EMPLOYEE cannot, except via card)
- per-user daily limit and per-payment limit (mirrors the onchain limits)
- amount over the threshold → status `PENDING_APPROVAL`
- the recipient isn't blocked (simple allow/deny list; a placeholder for sanctions screening)

### 4.5 Payment state machine
```
DRAFT → PENDING_APPROVAL → APPROVED → HELD → SUBMITTED → SETTLED
                                  ↘ REJECTED       ↘ FAILED → (release hold)
                                                   ↘ CANCELLED → (release hold)
SETTLED → REFUNDED  (simulated rails only)
```
- Onchain USDC payments skip `HELD` (`APPROVED → SUBMITTED → SETTLED`).
- Off-chain rails: `createHold` onchain at `HELD`, `settleHold` at `SETTLED`, `releaseHold` on failure or cancel.
- Every transition writes a `PaymentEvent` and the matching `LedgerEntry` rows inside **one DB transaction**.
- Illegal transitions throw.

### 4.6 Reconciler
A job (run every 15s in dev, or on demand) that:
- reads treasury events (`Deposited`, `Paid`, `HoldSettled`, `HoldReleased`) via viem `getLogs`,
- matches them to `Payment` rows by `paymentId`/`holdId`,
- records deposits that arrived directly onchain,
- flags mismatches (ledger `treasury:available` ≠ onchain `available()`) on the dashboard.

### Unit tests (Vitest)
Router picks Pix for a BRL recipient and ACH for a US bank; policy blocks over-limit payments; illegal state transitions throw; the ledger balances for every flow; replaying an idempotency key returns the original payment.

**Done when:** `pnpm --filter core test` passes.

---

## Phase 5: API (`apps/web/src/app/api`)

Route handlers that call `packages/core`. Each POST requires an `Idempotency-Key` header.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/companies` | Create a company and deploy its treasury through the factory |
| GET | `/api/companies/:id/balance` | Onchain balance, held, available (ledger and chain side by side) |
| POST | `/api/recipients` | Add a recipient |
| POST | `/api/payments/quote` | Route and quote across rails (no money moves) |
| POST | `/api/payments` | Create a payment from a quote |
| POST | `/api/payments/:id/approve` | Admin approval (also calls `treasury.approve` when needed) |
| POST | `/api/payments/:id/cancel` | Cancel and release the hold |
| GET | `/api/payments` | List with filters (rail, status, date) |
| POST | `/api/cards` | Issue a virtual card with a limit |
| POST | `/api/cards/:id/authorize` | Simulate a purchase (hold) |
| POST | `/api/cards/:id/settle` | Settle or release an authorization |
| POST | `/api/invoices` | Upload an invoice (PDF/image) and prefill a payment |
| GET | `/api/ledger` | Ledger entries for the company |

Authentication: verify the Privy token on the server; read the user's `Membership.role` for authorization.

**Done when:** you can run the full demo flow with `curl` or a REST client.

---

## Phase 6: Frontend (`apps/web`)

Pages (Next.js App Router + Tailwind):

| Route | Contents |
|---|---|
| `/` | Landing: logo, *"The stablecoin account for global business"*, sign-in |
| `/onboarding` | Company name, country, invite teammates → deploys the treasury |
| `/dashboard` | Balance card (available / held / total), deposit address with QR, recent activity, reconciliation status |
| `/pay` | **Main flow.** Pick a recipient → enter amount → see the router's choice and alternatives (fee, FX, recipient amount, ETA) → confirm |
| `/payments/:id` | Status timeline built from `PaymentEvent`, tx hash link for onchain, `SIMULATED` badge for off-chain |
| `/approvals` | Queue for admins |
| `/cards` | Issue cards, set limits, freeze, "Simulate purchase" button |
| `/invoices` | Upload, extract vendor and amount, pay |
| `/ledger` | Ledger table with CSV export |
| `/settings/team` | Roles and limits |

UI rules:
- Show amounts in USD (and the recipient's currency where relevant). Hide chain jargon except the tx hash link.
- Every simulated item gets a visible `SIMULATED` badge.
- Use Privy for email login with an embedded wallet; use wagmi/viem for the deposit flow.

**Done when:** the full demo script in the README works end to end in the browser.

---

## Phase 7: Stretch goals (only after Phase 6 is solid)

1. **Event hedging:** on the dashboard, show "Your BRL payouts are exposed to the Fed decision" and match it to a real prediction-market event (e.g. Gemini's public prediction-markets API). Read-only suggestions plus a simulated hedge purchase.
2. **Tokenized stock treasury:** allow a portion of the treasury in mock tokenized-stock ERC-20s with a price feed; show the allocation on the dashboard.
3. **Batch payouts:** pay several invoices in one approval.
4. **Live sandbox:** replace one simulated adapter with a real provider sandbox.
5. **Multi-chain deposits:** accept USDC from another testnet via Circle CCTP.

---

## Environment variables

See `.env.example`. Required for Phase 2 onward: `RPC_URL`, `CHAIN_ID`, `USDC_ADDRESS`, `DEPLOYER_PRIVATE_KEY`, `OPERATOR_PRIVATE_KEY`, `DATABASE_URL`, `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_SECRET`.

Check testnet USDC addresses in Circle's docs (Base Sepolia) or `docs.arc.io` (Arc) before deploying.

---

## Definition of done (demo-ready)

- [ ] A company is created and its treasury deployed on the testnet
- [ ] A 10,000 USDC deposit shows up in the dashboard after reconciliation
- [ ] A 1,000 USDC onchain payment shows a real tx hash
- [ ] An ACH payment goes HELD → SUBMITTED → SETTLED with a SIMULATED badge
- [ ] A Pix payout shows the FX quote and the BRL amount received
- [ ] A payment over the threshold waits for admin approval
- [ ] A card with a $500 limit authorizes $100, then settles; a $600 purchase is declined
- [ ] The ledger balances, and ledger `available` matches onchain `available()`
- [ ] Replaying any POST with the same idempotency key doesn't move money twice
- [ ] All contract and core tests pass

## Suggested split for a team of 3–4

| Person | Owns |
|---|---|
| A | Contracts + deploy + reconciler |
| B | Core: router, policy, state machine, ledger, sim adapters |
| C | Frontend: dashboard, pay flow, cards |
| D (optional) | API wiring, Privy auth, invoices, pitch and demo video |
