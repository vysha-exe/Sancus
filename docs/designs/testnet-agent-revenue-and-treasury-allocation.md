# Design: Testnet agent revenue and treasury allocation

Status: implementation plan
Mode: Builder

Related design: `docs/designs/branch-treasury-and-internal-transfers.md`

## Problem Statement

Make Sancus's treasury feel programmable in a hackathon demo. An outside agent should pay for a useful Sancus API through x402, that canonical USDC revenue should appear in the correct organization treasury, and an administrator should be able to allocate canonical USDC into EarnKit or use the separate internal `fUSDC` liquidity pool for fractional NVDA and GOOGL ERC-20 holdings.

## What Makes This Cool

The complete loop is visible and economically coherent:

1. An agent discovers a paid Sancus service.
2. Gateway pays the x402 charge with USDC.
3. The organization Gateway balance and activity feed update.
4. An administrator moves the received USDC into its Arc treasury wallet.
5. The administrator chooses canonical-USDC yield or an `fUSDC`-funded NVDA/GOOGL allocation.
6. Equity positions can be sold back into treasury USDC.

The demo therefore connects machine revenue, cross-chain liquidity, treasury accounting, DeFi yield, and tokenized assets without pretending to be production infrastructure.

## Constraints

- Testnet-only hackathon implementation; no mainnet roadmap is in scope.
- Reuse the existing Circle wallets, Gateway, x402, ledger, EarnKit, and treasury UI.
- NVDA and GOOGL must be real ERC-20 balances on Arc Testnet, not database-only positions.
- Equity allocation requires an explicit administrator action.
- Both buying and selling must be supported.
- Circle USDC and `fUSDC` are separate assets. Gateway, x402, and EarnKit use only canonical Circle USDC; internal settlement and stock trading use `fUSDC`.
- Do not build an AMM, brokerage, compliance system, production custody layer, or live securities-price integration.
- The environment already communicates testnet context; do not add repetitive asset disclaimers throughout the portfolio UI.
- The existing deployment pipeline covers distribution.

## Premises

- The best wedge is a closed revenue-to-allocation loop, not a broad asset marketplace.
- The company treasury should remain a Circle developer-controlled smart account. It is already the correct home for organization funds and contract interactions.
- The purchasing agent should use a dedicated EOA because Gateway nanopayments require EOA authorization. A capped testnet key is acceptable for this demo.
- The seller receives into a company-assigned Gateway EOA. The company smart account remains the operating treasury and receives USDC when Gateway liquidity is materialized on Arc.
- Gateway should be treated as company liquidity that is available to mint, not immediately spendable wallet cash. Today company-scoped treasury loading omits it entirely.
- EarnKit remains provider-neutral. The UI displays the vaults the service actually returns rather than promising a specific protocol.
- NVDA and GOOGL prices are configurable demo values controlled by the broker administrator.
- `fUSDC` already exists on Arc Testnet with six decimals and is controlled by the rail bot. The stock broker consumes its configured contract address directly.
- Sancus must never silently substitute `fUSDC` when a caller requests canonical USDC.

## Approaches Considered

### Approach A: Revenue-first programmable treasury

Finish company-scoped x402 accounting, demonstrate paid API access, then show canonical USDC entering EarnKit alongside the organization's separate `fUSDC`-funded equity portfolio. This was selected because it reuses the most existing code and produces the clearest end-to-end story without conflating the two tokens.

### Approach B: Yield-first treasury

Polish vault discovery and allocation before agent payments. This would deepen the treasury experience but make the demo less differentiated.

### Approach C: Full tokenized-asset platform

Integrate third-party equities, market data, eligibility, and compliance. Rejected because those systems add little to a testnet hackathon demo and obscure the core loop.

## Reference Implementation Leverage

Use the local Circle treasury reference selectively as an implementation source, not as the product architecture. Sancus's root-company and branch model remains authoritative.

Reuse or adapt these proven patterns:

- Gateway signer creation, depositor delegation, balance reads, burn-intent submission, attestation polling, and destination mint execution.
- Separate standard-wallet and permissionless Gateway webhook endpoints, automatic address registration for newly created wallets, and a backfill script for existing addresses.
- Webhook deduplication and transaction-state transitions so Treasury refreshes from confirmed provider state rather than optimistic UI assumptions.
- Server-side wallet ownership validation and exclusion of Gateway signer wallets from ordinary spendable-wallet selection.
- EarnKit vault discovery, quotes, deposits, withdrawals, positions, error normalization, and activity indexing after replacing its personal-wallet resolver with Sancus parent-company authorization.
- Query-provider and balance-refresh patterns only where the Treasury page needs them; do not import the reference dashboard's global personal-wallet context.
- Existing tests for Gateway transfers, balance parsing, Earn formatting/errors, ownership, and transaction status as templates for Sancus-scoped tests.

Do not import its page shell, generic dashboard, personal wallet selector, or aggregated multi-wallet balance model. It has no parent-company-only Treasury boundary, x402 revenue attribution, dual USDC/fUSDC accounting, or ERC-20 equity broker. Those pieces must be implemented against Sancus's own account, company, ledger, and activity models.

## Recommended Approach

### 1. Establish Treasury as the root-company control plane

Add an administrator-only `/treasury` page and place **Treasury** directly after Home in the business navigation. This page always resolves the account's root company, even when the workspace switcher is currently focused on a child branch. It manages only the parent company's own capital, wallets, revenue, yield, and investments; it neither aggregates nor controls branch capital.

Fit the feature into the existing Sancus access and workspace model:

- Add `treasury` to `NavKey`, `navKeyForPath`, the administrator navigation, and `DEFAULT_NAV` in `app/lib/sancus/accounts.ts`, then update the account/path/navigation tests so authenticated and signed-out demo behavior stays consistent.
- Add a distinct `treasury.manage` permission and grant it only to the root business administrator account. Branch administrators continue to use their branch page and do not see parent treasury controls.
- Add the navigation item in `app/components/sancus-ui/app-shell.tsx`, preserving the existing personal/business visibility rules.
- Resolve the root company server-side from the authenticated account. The Treasury page and every Treasury query use this stable root key and never follow `ws.companyId` or the branch workspace cookie. Every mutation must verify that the selected wallet belongs directly to that root company; descendant wallets are out of scope.
- Create `app/app/(sancus)/treasury/page.tsx` and focused `treasury-*` components under `app/components/sancus-ui/` rather than expanding Home into an operational console.

The Treasury page has five sections:

1. **Liquidity overview** — canonical wallet USDC, Gateway USDC available to mint, `fUSDC` internal liquidity, reserved payouts, and in-flight money. These assets are never silently combined.
2. **Agent revenue** — parent-company x402 earnings, paid endpoint activity, and the action to move received Gateway USDC into the parent Arc treasury.
3. **Assets** — parent-company NVDA and GOOGL quantities, broker prices, quotes, and administrator-confirmed buy/sell controls funded only by its `fUSDC`.
4. **Yield** — parent-company EarnKit vault discovery, deposit, position, and withdrawal controls funded only by its canonical USDC.
5. **Treasury activity** — parent-company allocation, Gateway, revenue, and transfer events. Extend Activity with an explicit root-company scope and these event sources before linking to it; its current user-wide feed is not a correct treasury destination.

Keep the current pages focused:

- **Home** remains the monitoring dashboard. Its Global treasury card and company snapshot stay concise and gain a `Manage treasury` link to `/treasury`.
- **Branches** remains the only operational and capital view for each child node. Treasury does not reproduce, aggregate, fund, or rebalance branch balances.
- **Agents** remains the place to configure and observe buyer agents. Move the business-facing `X402Earnings` financial card into Treasury, leaving only an earnings summary/link on Agents if useful.
- **Dev** retains the repeatable agent-payment trigger because it is a demo/testing control, while the financial result appears in Treasury.

Reuse and correct existing code rather than creating a parallel treasury stack:

- Preserve the existing personal/active-workspace behavior of `app/app/api/sancus/treasury/route.ts` because Home and Dev consume it. Add a separate authenticated root mode or `/api/sancus/treasury/root` endpoint with a root-specific DTO, backed by a root-keyed hook rather than changing `useLiveTreasury` semantics for existing pages.
- Make that root DTO include only wallets and transactions directly owned by the root company. It must not expand the root into descendant company IDs as the current aggregate company-scope helper does.
- Replace the data and action layer of `app/components/sancus-ui/gateway-card.tsx` for the Treasury module. The current personal card moves wallet USDC into Gateway; the Treasury flow needs the opposite Gateway-to-company-wallet burn/attestation/mint operation.
- Refactor `app/components/sancus-ui/x402-earnings.tsx` to accept the authorized root-company scope.
- Reuse the existing Earn APIs and presentation where practical, but add a company-wallet selector/action adapter and only the required query/balance providers. `EarnActionPanel` currently depends on personal `WalletSelect`, personal balances, `BalanceProvider`, and `QueryClientProvider`, so it cannot be mounted directly in the Sancus layout.
- Retire or adapt the older personal-only `app/components/sancus/treasury-summary.tsx`; do not mount two components that calculate different meanings for “available.”

### 2. Bootstrap every test wallet to a usable minimum

Add a server-only testnet liquidity distributor that runs after Sancus successfully creates and stores a wallet. Its job is to make new wallets visibly usable without masking which asset they actually hold.

- Maintain a configurable minimum of `$0.50` for each asset a wallet role requires rather than sending `$0.50` unconditionally on every request.
- Mint `0.50 fUSDC` to newly created company treasury and branch wallets through the existing rail-bot minter. This is the internal/stock-liquidity bootstrap.
- Transfer `0.50` canonical testnet USDC from a dedicated seeded distributor only to roles that require canonical USDC. If that distributor is empty, record and display `NEEDS_FUNDING`; never substitute `fUSDC`.
- Fund the dedicated x402 buyer EOA through its Gateway-specific funding path; an ordinary token transfer is not sufficient evidence that it can execute a Gateway payment.
- Check the chain's required gas asset independently and top it up only when the wallet cannot submit the transaction type its role needs.
- Define a role policy for treasury, branch, settlement, Gateway signer, agent buyer, and broker wallets so irrelevant wallets are not sprayed with every asset.
- Record each bootstrap attempt by `wallet_id + asset + target threshold` with `PENDING`, `CONFIRMED`, or `NEEDS_FUNDING` status and transaction hash. Concurrent wallet-creation requests resume the same attempt instead of paying twice.
- Expose only the parent company's wallet readiness in Treasury. Put the cross-wallet `Ready`, `Low`, or `Needs funding` audit and administrator-only `Top up test wallets` retry action in Dev or Settings, because it covers branch and infrastructure wallets outside Treasury's capital scope.
- Add a Dev/Settings audit action that checks all test wallets against the current role policy. Run it after creation and on demand, not continuously.

The `$0.50` balance is a readiness floor, not the budget for a demo flow. Broker liquidity, payout liquidity, and agent spending caps remain explicit larger allocations. The bootstrap service must be testnet-gated and must never be enabled by a production configuration.

### 3. Make x402 revenue company-scoped

Use the existing `/api/x402/route-quote` as the required paid service. It returns useful route, FX, fee, and arrival-time data without exposing private company information. Keep its price and description in the existing code-level endpoint list for the hackathon.

Bind this endpoint to one demo organization through validated testnet configuration:

- `SANCUS_X402_COMPANY_ID`
- `SANCUS_X402_RECEIVING_WALLET_ID`, which must identify that company's Arc Gateway EOA
- the existing endpoint price setting

Extend `sancus_x402_earnings` with:

- `company_id`
- `wallet_id`
- `payment_fingerprint`, a SHA-256 hash of `network | payer lowercase | EIP-3009 nonce lowercase | asset lowercase | payTo lowercase | amount | HTTP method | pathname | sorted query parameters`
- a uniqueness constraint preventing duplicate credit on retries

The public paid route has no logged-in workspace, so `resolveSeller()` must load and validate this fixed organization/wallet binding rather than selecting the first wallet belonging to a configured user email. The wallet must belong to the configured company and have the `gateway_signer` role.

After settlement:

1. After signature verification, derive the fingerprint from the decoded EIP-3009 authorization and normalized request fields.
2. Atomically claim the unique fingerprint as `SETTLING` before calling the facilitator. A short lease identifies the worker; concurrent requests return or poll the claimed purchase instead of settling.
3. Compute and persist the route-quote input snapshot and response while the claim is held, but do not return it before payment succeeds.
4. Settle the exact authorization once, then atomically write `SETTLED` earning, revenue journal, Gateway transaction, and payer through one database function.
5. Mark the purchase `COMPLETED` and return its stored response. Retries return that response without another settlement or revenue credit.
6. A feasibility test must confirm that replaying the identical EIP-3009 nonce is rejected or returns the original settlement. If the process crashes in the uncertain post-settlement/pre-database window, reconciliation queries the facilitator by authorization identity before the lease can be reclaimed; this flow does not blindly resettle.
7. Invalidate or refresh the company treasury and activity queries.

### 4. Count Gateway funds in the organization treasury

Update company-scoped treasury loading to query Gateway balances for its assigned Gateway EOA addresses. Deduplicate shared addresses and continue excluding payout and signer-only wallets from ordinary onchain wallet balance totals.

The treasury response should expose `wallet USDC`, `Gateway USDC available to mint`, and `fUSDC` separately. Canonical wallet USDC is spendable by EarnKit, while `fUSDC` is spendable by the broker and internal settlement. The home page should show the new x402 earning in Latest payments and visibly increase the Gateway portion after the agent call.

Add a `Move to Arc treasury` action that reuses the existing Gateway burn/attestation/mint path:

1. The assigned Gateway EOA authorizes the burn intent.
2. Gateway produces the attestation.
3. The app executes `gatewayMint` to the company Arc smart account.
4. Before submission, persist a mint intent with its amount, destination, deterministic salt, signed burn-intent hash, and `REQUESTED` state.
5. Persist `ATTESTATION_PENDING`, `MINT_PENDING`, `CONFIRMED`, or `FAILED` with the Gateway transfer ID and mint transaction hash as they become available.
6. A retry resubmits the identical signed burn intent or resumes its stored transfer ID; it never creates a new salt. A feasibility test must confirm Gateway replay and mint idempotency before this action ships.
7. Refresh both balances only after confirmation.

The seller-side Gateway EOA is an existing Circle developer-controlled `gateway_signer` wallet, signed through the current Circle SDK path; no private key is exported into the app. One wallet may belong to only one company, enforced by a unique company assignment. The Dev action caps each mint to the lesser of the live Gateway balance and a configured testnet maximum.

### 5. Make the agent-payment demo repeatable

Add a developer-facing demo control that performs the existing flow:

1. Discover the paid endpoint.
2. Receive `402 Payment Required`.
3. Ensure the buyer EOA has a Gateway balance.
4. Sign and submit the payment.
5. Retry and display the purchased route quote.
6. Link directly to the resulting company Gateway revenue and activity.

Place the control on the existing Dev page and enable it only when an explicit testnet-demo environment flag is present. Add a server-enforced root-administrator/developer guard before exposing any buyer-key-backed action: the current `devqa` navigation flag is available to every account when enabled and is not an authorization boundary. Reuse the current buyer EOA and daily cap only behind that guard. The demo route remains fixed to Arc Testnet even though Gateway can unify balances funded elsewhere. Do not add production key-management work.

### 6. Deploy the equity contracts

Deploy three simple contracts to Arc Testnet, reusing the already-deployed `fUSDC` as settlement:

- `MockEquityToken` instance for NVDA
- `MockEquityToken` instance for GOOGL
- `MockEquityBroker`; the configured `fUSDC` contract is its settlement token

Token requirements:

- ERC-20 compatible
- 18 decimals for fractional shares
- Broker-only mint and burn role
- Symbol and name suitable for natural display as NVDA and GOOGL

Broker requirements:

- Store `priceMicroUsdc`, the six-decimal `fUSDC` price of one whole 18-decimal share, for each supported token.
- Allow the administrator to update prices.
- `buy(asset, usdcAmount, minSharesOut)` transfers USDC in and mints `floor(usdcAmount * 10^18 / priceMicroUsdc)` shares.
- `sell(asset, shareAmount, minUsdcOut)` burns shares and transfers `floor(shareAmount * priceMicroUsdc / 10^18)` USDC out.
- Reject any trade whose computed output is zero; all rounding is down in favor of broker solvency.
- Emit price-update, buy, and sell events.
- Reject unsupported assets, zero amounts, insufficient USDC liquidity, and slippage failures.

Seed the broker with enough `fUSDC` to support several reversible demo sales. Shares are minted on purchase and burned on sale. This is a deterministic broker, not an AMM; there are no pools, fees, or price impact.

### 7. Execute trades from the company smart account

First run a feasibility spike proving the existing Circle smart account can approve `fUSDC`, call the broker, and return a confirmed receipt. Then add server routes that:

- Require the authenticated root business administrator and the `treasury.manage` permission.
- Resolve the root company from the administrator account and confirm the selected wallet belongs directly to that root company. Reject descendant branch wallets.
- Quote the configured broker price.
- Create an allocation intent before any transaction with a client idempotency key.
- Submit `fUSDC` approval and broker buy transactions through the existing Circle wallet execution path, skipping approval when allowance is already sufficient.
- Submit token approval and broker sell transactions through the same wallet.
- Track `QUOTED`, `APPROVAL_PENDING`, `TRADE_PENDING`, `CONFIRMED`, and `FAILED`, including both transaction hashes and the last observed Circle transaction state.
- Resume a pending intent instead of resubmitting it.
- Record confirmed quantity, price, and cash movement after reading the receipt.

Quotes read the broker price onchain, expire after 60 seconds, and use that exact price to calculate the minimum output. A stale quote must be refreshed before confirmation; the hackathon flow does not expose a separate slippage setting.

The database record supports fast UI history, while wallet balances and chain receipts remain the source of truth for holdings and settlement.

### 8. Add treasury allocation UI

Implement the Assets and Yield sections inside the new root-company Treasury page with three destinations:

- USDC yield
- NVDA
- GOOGL

The treasury header and allocation panel show canonical USDC and `fUSDC` as distinct balances. Canonical wallet/Gateway USDC feeds x402 and EarnKit; `fUSDC` feeds internal settlement and equities. Neither balance is included in the other.

For equities, show current onchain broker price, treasury token quantity, and broker-marked `fUSDC` value. The administrator selects an amount, reviews a quote, and confirms the trade. Selling uses the same panel in reverse. Cost basis, realized gains, and unrealized gains are intentionally omitted.

For yield, first prove one deposit and withdrawal from a company smart account. Then make the existing EarnKit wallet resolver company-aware: require a company administrator, verify the wallet belongs to that company, attach `company_id` to Earn transaction records, and scope position/activity queries to company wallets. Reuse the existing vault list, quote, deposit, withdrawal, and position components after that boundary is enforced. Vault protocol, APY, liquidity, warnings, and Circle Guarded metadata remain live service data. Any locally simulated reward accrual stays visually subordinate to actual vault balances.

### 9. Keep accounting boundaries explicit

- x402 settlement posts debit `gateway_usdc` and credit `service_revenue`.
- Gateway mint posts debit `wallet_usdc` and credit `gateway_usdc`.
- Equity and vault positions stay outside the accounting ledger; their onchain balances are authoritative. The ledger records only their historical cash flow against an `asset_allocation` clearing account, so broker price changes and vault yield cannot corrupt an accounting asset balance.
- Equity entry posts debit `asset_allocation_fusdc` and credit `wallet_fusdc`; exit reverses those accounts. Vault entry posts debit `asset_allocation_usdc` and credit `wallet_usdc`; withdrawal reverses those accounts. No gain/loss accounting is attempted.
- Portfolio value must not be double-counted in `available to move`; wallet USDC is spendable cash, while Gateway USDC is shown separately as available to mint.
- Broker prices determine displayed equity value for the demo.
- Chain balances and confirmed receipts are authoritative. Database intents and journals are the indexed history; refresh and reconciliation correct stale indexed state.

## Failure States

- A new wallet cannot be bootstrapped: keep the wallet, mark the missing asset `NEEDS_FUNDING`, and allow an idempotent administrator retry. Do not recreate the wallet or replace canonical USDC with `fUSDC`.
- The canonical-USDC distributor is depleted: show the exact affected wallet roles and funder balance in Treasury while allowing fUSDC-only internal flows to continue.
- x402 settles but the database write fails: persist or recover by payment fingerprint and never create a second earning for the same authorization.
- Gateway balance is temporarily unavailable: retain the last displayed breakdown and show that live liquidity could not be refreshed.
- Gateway mint is interrupted: resume polling the stored transfer ID and mint transaction instead of starting again.
- Broker liquidity is insufficient: disable sell confirmation and explain that USDC buyback liquidity is missing.
- Circle wallet execution is pending: show a pending allocation and do not update holdings until the receipt succeeds.
- EarnKit returns no matching vault: keep yield available as an empty state without inventing a protocol.
- Price changes before submission: enforce `minSharesOut` or `minUsdcOut` and request confirmation again.
- A reset is compensating rather than destructive: sell holdings, withdraw vault positions, restore broker prices and USDC liquidity, archive prior demo intents, and replenish the buyer. Historical onchain transactions remain visible.

## Contract Deployment

Keep contracts in a dedicated testnet package with unit tests for price math, permissions, slippage, liquidity failure, and buy/sell reversibility. A repeatable deployment script validates Arc Testnet chain ID, validates the configured `fUSDC` address, deploys both equity tokens and the broker from a dedicated testnet deployer, grants the broker mint/burn roles, seeds broker `fUSDC`, and writes addresses to deployment output. Application environment variables select those addresses; startup validation rejects missing addresses or a non-Arc-Testnet chain. Broker price administration remains a deployer-only script rather than a product UI.

## Existing `fUSDC` Integration Correction

The incoming implementation currently makes `getUsdcBalance()` return `fUSDC` on Arc whenever the feature is enabled and intercepts generic Arc `USDC` sends to burn/mint `fUSDC`. That implicit substitution violates the internal/stock-only boundary and would hide canonical USDC from treasury, Gateway, and Earn flows.

Before adding the broker:

- Restore `getUsdcBalance()` to canonical Circle USDC only.
- Add an explicit asset-aware balance path for `fUSDC`.
- Require callers to request `fUSDC` explicitly; never infer it from the Arc chain alone.
- Record `fUSDC` transactions with their own ledger asset code instead of `USDC`.
- Keep x402's canonical token address, Gateway token configuration, and EarnKit asset unchanged.
- Preserve the rail-bot faucet and burn/mint settlement behavior only for internal and stock-liquidity flows.

## Data Access

- x402 purchases and earnings are service-write-only. Only authenticated company owners and administrators may read them; direct client inserts and updates are denied.
- Gateway mint intents, allocation intents, and Earn transactions may be created only through authenticated server routes after company-role validation.
- The root business administrator may read and mutate Treasury rows only for the root company. Branch-only administrators cannot call Treasury allocation routes; branch capital continues through branch-scoped pages and APIs.
- Wallet/company foreign keys and the unique Gateway-wallet assignment prevent a balance from being attributed to multiple companies.
- Service credentials are used only inside server routes and reconciliation jobs.

## Success Criteria

Must-have:

- A root business administrator has a dedicated Treasury tab that manages only the parent company's capital; branch-only administrators cannot access it.
- Home summarizes treasury health and links to Treasury without duplicating allocation controls.
- Every newly created test wallet is audited against its role policy, receives its required `$0.50` readiness floor when funding is available, and visibly reports missing funding without duplicate transfers.
- An external test agent can pay the protected endpoint through x402 and receive the response.
- The payment is attributed to the selected demo organization exactly once.
- The Treasury page shows Gateway revenue separately from spendable wallet USDC and internal `fUSDC`; Home shows a compact summary.
- An administrator can mint that Gateway balance into the company Arc treasury once without duplicate burns.
- An administrator can buy and sell fractional NVDA with company `fUSDC`.
- The NVDA ERC-20 balance is visible onchain and in the treasury portfolio.
- Canonical USDC and `fUSDC` balances remain independently visible and are never summed as the same onchain asset.
- The demo can be repeated without manual database edits; repeated runs intentionally accumulate additional x402 revenue rather than erasing immutable payment history.

Stretch:

- Add GOOGL through the same broker.
- Deposit into and withdraw from an available EarnKit vault using a company wallet.

## Demo Sequence

1. Open the parent company's Treasury tab and show its own USDC, Gateway USDC, and `fUSDC` liquidity.
2. Launch the demo agent against the paid route-quote service.
3. Show service discovery and the `402` response.
4. Complete the Gateway nanopayment and reveal the purchased result.
5. Return to Treasury to show the company-scoped Gateway revenue and treasury activity.
6. Move the received Gateway USDC into the Arc treasury wallet.
7. Allocate part of the company's `fUSDC` liquidity to NVDA or GOOGL.
8. Show the ERC-20 balance and updated portfolio.
9. If time remains, allocate another portion into an EarnKit vault.
10. Optionally sell shares back to USDC to demonstrate reversibility.

## Open Questions

No blocking product decisions remain. Contract addresses, initial prices, and seed liquidity can be selected during implementation and stored as testnet configuration.

The must-have cut line is: company-scoped x402 revenue, Gateway-to-wallet mint, and one equity buy/sell loop. GOOGL and company-scoped Earn follow only after that loop works end to end.

## Next Steps

1. Add the root-only Treasury navigation key, permission, route, and page shell; link the existing Home summary to it.
2. Add the idempotent wallet bootstrap service, role policies, `$0.50` readiness thresholds, and Treasury funding-health audit.
3. Make treasury scope resolve only the authenticated root company and return its canonical USDC, Gateway USDC, and `fUSDC` as explicit assets without descendant aggregation.
4. Add company and settlement identity to x402 configuration and earnings, then move the company earnings presentation from Agents into Treasury.
5. Include company Gateway balances in treasury loading and implement resumable Gateway-to-wallet minting in the Treasury Agent revenue section.
6. Verify the existing paid route-quote flow end to end with exactly-once recording.
7. Prove one Circle smart-account approval and broker-shaped contract call.
8. Implement, test, deploy, and seed the NVDA token and broker contracts, then add idempotent quote, buy, sell, and portfolio controls to Treasury Assets.
9. Add GOOGL using the same token and broker path.
10. Make the existing Earn routes and components company-aware, then expose deposit/withdrawal in Treasury Yield if time remains.
11. Finish treasury-scoped activity, reconciliation, and the compensating reset workflow.

## What I Noticed About How You Think

- You narrowed the operating constraint directly: “these are all on testnet with no plan for mainnet cuz this is a hackathon.” That removes a large amount of irrelevant production work.
- You chose real ERC-20 tokens over database-only holdings, which preserves the part of the demo that is actually worth proving.
- You preferred administrator-confirmed allocation instead of automatic investing, keeping the product legible while still showing agent-generated revenue.
- You asked for both buying and selling, which turns the equity feature into a coherent treasury allocation rather than a one-way visual effect.
