# Research: Chain choice and on/off-ramps

*Owner: vysha · Researched 2026-11-15 · Hackathon deadline: Nov 20, 12 PM CST*

Two questions:
1. Should Sancus use Circle's product suite (Arc) or Solana?
2. Which on/off-ramp should we use: Bridge, Coinbase, Gemini, or something else?

Anything marked **unverified** wasn't confirmed in official docs. Check it before relying on it.

---

## TL;DR

| Decision | Recommendation |
|---|---|
| **Chain** | **Move from Base Sepolia to Arc testnet** and enter **Best use of Arc** ($1,000/track, judged by Circle). Arc is EVM, so our Solidity, viem, wagmi and Foundry plan only needs a config change. |
| **Wallets** | **Circle developer-controlled wallets** as the treasury's operator/payout signer, with **Gas Station** for gas sponsorship. |
| **On-ramp** | **Bridge sandbox** (email for access **today**). Fallback: **Circle Mint sandbox**, a mock wire deposit that becomes USDC. |
| **Off-ramp (ACH)** | **Bridge sandbox** (external account + transfer). Otherwise simulate. |
| **Off-ramp (Pix)** | Bridge if it enables Pix in sandbox, otherwise **BlindPay** (development mode), otherwise simulate. |
| **Pay-in (Pix/QR)** | Already built by RuoHan in `rails-demo/` (PayZu Pix, Omise PromptPay, Midtrans QRIS). |
| **Cards** | Already built: **Marqeta sandbox** in `rails-demo/`. |
| **Coinbase** | Skip as a ramp. Its offramp is for users cashing out to their *own* bank, not paying suppliers. |
| **Gemini** | Skip as a ramp. It has no third-party payments or payout product. (The Gemini *prediction markets* bounty is a separate thing.) |

### Action items (time-sensitive)
- [ ] **Email support@bridge.xyz today** for a sandbox developer account. It isn't self-serve. Ask specifically for **Pix and SPEI routes in sandbox**, which need sales enablement.
- [ ] Sign up at the **Circle Developer Console** for a testnet API key (self-serve) → Wallets + Gas Station on `ARC-TESTNET`.
- [ ] Request a **Circle Mint sandbox** account as the on-ramp fallback (approval time unverified).
- [ ] Try **BlindPay** development signup for Pix payouts (self-serve status unverified).
- [ ] Get test USDC on Arc from https://faucet.circle.com.

---

## 1. Circle product suite vs. Solana

### Circle products that matter to us

| Product | What it does | Usable this week? | Use in Sancus |
|---|---|---|---|
| **Arc** (L1) | Circle's EVM chain; **USDC is the gas token**. Testnet chain ID `5042002`, RPC `https://rpc.testnet.arc.io`, explorer `explorer.testnet.arc.io`. Mainnet live since Sept 16, 2026. | ✅ Open | Deploy `SancusTreasury` here |
| **Wallets** (developer-controlled / user-controlled / modular) | API-managed wallets. Developer-controlled = we hold the keys (made for treasury and payouts). | ✅ Self-serve testnet key; all three types work on `ARC-TESTNET` | Operator/payout signer; optionally the company's wallet |
| **Gas Station** | Sponsors gas for Circle Wallets | ✅ Arc testnet supported | Users never handle gas |
| **CCTP V2** | Burns USDC on one chain and mints it on another. Arc = domain 26, Solana = domain 5. | ✅ Permissionless; Solana→Arc quickstart exists | "Fund your treasury from Base/Solana" |
| **Gateway** | One USDC balance across chains; nanopayments via x402 | ✅ Arc testnet + Solana devnet | Stretch: multi-chain deposits |
| **Circle Mint** | A business's own bank account ↔ USDC: mint and redeem. Rails: Fedwire, SWIFT, RTP, SEPA, SPEI, Pix (**no ACH**). Sandbox has mock wire and mock Pix. | ⚠️ Sandbox exists; signup speed **unverified** | On-ramp fallback |
| **CPN** (Circle Payments Network) | True third-party cross-border payouts (sandbox shows USDC→MXN over SPEI and a USD wire) | ❌ Invitation-only; not realistic by Nov 20 | Name it as the **production path** in the pitch |
| **StableFX** | Onchain stablecoin FX on Arc | ❌ KYB-gated | Mention as future FX engine |
| **Compliance Engine** | Transaction screening, allow/block lists | ❌ Beta, eligible customers only | Mention as future compliance |

**Arc details to remember**
- Native USDC uses **18 decimals**. The ERC-20 interface at `0x3600…0000` uses **6 decimals**. Both reflect the same balance, so always call `decimals()`.
- viem, wagmi, Foundry and Hardhat all work.

### The Solana option
- Circle on Solana: USDC on devnet, CCTP V2 (with Fast Transfer), Gateway. **Circle Wallets on Solana are EOA-only** and can't drive a custom program.
- Treasury tooling: **Squads v4** already has roles, spending limits, time locks and sub-accounts (`@sqds/multisig`, audited). That's a good fit for our treasury.
- **Cost:** a rewrite. The Solidity contract would become Anchor/Rust (or Squads), and viem/wagmi would become Solana web3/kit. That's **2+ of our 4 days**.

### Scores (out of 5)

| | Fit with USDC banking | Prize / competition | Build effort (4 days) | Demo |
|---|---|---|---|---|
| **Arc** | **5**: USDC as gas, Circle's own chain, CPN/StableFX path | **4**: $1,000, Circle judges; treasury and payroll projects have won Arc tracks before (ArcFlow, HackMoney 2026) | **5**: config change | **5**: everything is in dollars |
| **Solana** | 3 | 4: $1,500, but likely the most crowded | **2**: full rewrite | 4 |
| **Base** | 3 | **0**: no chain prize | 5 | 3 |

**Verdict: Arc.** Its prize is $500 smaller, but the fit, build effort and judging audience (Circle) all favor it.

---

## 2. On/off-ramp providers

| Provider | On-ramp | Off-ramp to *third parties* | Rails | Chains | Sandbox access | Fit |
|---|---|---|---|---|---|---|
| **Bridge** (Stripe) | ✅ Virtual accounts (fiat→USDC) | ✅ External accounts + transfers, or liquidation addresses | ACH, wire, SEPA; **Pix, SPEI via sales** | Base, Solana, ETH, Polygon, Arbitrum…; **Arc unconfirmed** | Email support@bridge.xyz; keys `sk-test…`; `simulate_kyc_approval`, `simulate_deposit` | ⭐ **Best match** |
| **Circle Mint** | ✅ Wire/Pix → USDC (business's own bank) | ⚠️ Payouts to the business's **own** bank accounts | Fedwire, SWIFT, RTP, SEPA, SPEI, Pix (**no ACH**) | Circle ecosystem | Sandbox with mock wire/Pix; speed unverified | Good fallback for on-ramp |
| **Circle CPN** | – | ✅ True cross-border payouts | SPEI, wire (Pix undocumented) | ETH-Sepolia in sandbox | ❌ Invitation-only | Production path only |
| **BlindPay** | ✅ ACH pay-in (~30s in dev) | ✅ Payouts | Pix, SPEI, ACH, wire, RTP, SEPA | Base Sepolia, Solana devnet | Dev mode auto-approves KYC; dev may use **USDB not USDC** (sources conflict) | Best documented **Pix payout** sandbox |
| **Coinbase CDP** | ✅ Onramp (end-user flow) | ❌ Offramp only to the *user's own* bank/Coinbase account; Payments API transfers support only Fedwire, SWIFT, SEPA | No ACH/Pix/SPEI payouts | Base, Solana | Self-serve CDP key; payments sandbox has fake deposits | Wrong shape for supplier payouts |
| **Gemini** | ❌ | ❌ | Exchange API withdrawals; UK/EU institutional USD rails | – | – | No fitting product |
| **Bitso Business** | – | ✅ Payouts | SPEI, Pix, PSE, CVU | – | Sandbox exists; access likely via sales | LatAm option if others fail |

### Why ramps don't block the Arc decision
The ramp report noted that Bridge and BlindPay clearly support Base but **not Arc**. That doesn't block us:
- **Bridge's sandbox moves no real testnet funds;** deposits and payouts are simulated by API, so the destination chain doesn't matter in the demo.
- **Production path:** the ramp delivers USDC on Base, then **CCTP moves it to Arc** (Arc is CCTP domain 26). Or use Circle Mint, which is Circle-native. Say this in the pitch.

### Demo flow with Bridge (all sandbox)
1. `POST /customers` (business), then simulate KYC approval.
2. **Deposit USD → USDC treasury:** `POST /customers/{id}/virtual_accounts` (USD → USDC, destination = treasury address), then `simulate_deposit`.
3. **Pay a US supplier by ACH:** `POST /customers/{id}/external_accounts` (routing and account number), then `POST /transfers` (source USDC, destination `payment_rail: ach`).
4. **Pay a Brazilian contractor by Pix:** create a Pix external account (EVP keys must be lowercase), then `POST /transfers` with destination `pix`. Minimum ~10–20 BRL; settles in ~5 min.
5. Register a webhook, but **also poll**, since sandbox webhooks may not fire.

Sandbox base URL: `https://api.sandbox.bridge.xyz/v0`

### How this maps to our code
Keep every provider behind one interface, so a missing sandbox key falls back to simulation without touching the UI:

```ts
interface RampProvider {
  name: "bridge" | "circle-mint" | "blindpay" | "sim";
  onramp(req: { amountUsd: bigint; destAddress: string }): Promise<RampResult>;
  payout(req: { amountUsd: bigint; recipient: Recipient; rail: Rail }): Promise<RampResult>;
  status(ref: string): Promise<RampStatus>;
}
```

The adapters in RuoHan's `rails-demo/` (Marqeta cards, PayZu Pix, Omise PromptPay, Midtrans QRIS) can follow the same pattern. Note that those local-rail adapters create **pay-in charges** (collecting money), which complements the payout providers above.

---

## Still unverified
- Bridge fees, sandbox Pix/SPEI behavior, sandbox access turnaround, Arc support
- Circle Mint sandbox signup speed; Mint chain support beyond ETH
- BlindPay: USDC vs USDB in development; self-serve signup
- Coinbase CDP Payments eligibility
- Pix support in CPN

## Sources
**Circle / Arc**
- https://developers.circle.com/
- https://developers.circle.com/wallets/supported-blockchains
- https://docs.arc.io/arc/references/connect-to-arc
- https://docs.arc.network/arc/references/contract-addresses
- https://developers.circle.com/cctp/concepts/supported-chains-and-domains
- https://developers.circle.com/cctp/quickstarts/transfer-usdc-solana-to-arc
- https://developers.circle.com/gateway/references/supported-blockchains
- https://developers.circle.com/cpn/quickstarts/integrate-with-cpn-ofi
- https://developers.circle.com/circle-mint/quickstarts/getting-started
- https://developers.circle.com/circle-mint/references/supported-payment-rails.md
- https://developers.circle.com/circle-mint/quickstarts/mint-and-redeem.md
- https://www.circle.com/pressroom/circle-launches-arc-mainnet-an-economic-operating-system-for-the-internet
- https://www.arc.io/blog/meet-the-arc-track-winners-from-the-hackmoney-2026-hackathon-and-what-we-learned

**Solana**
- https://squads.xyz/blog/spending-limits
- https://typedoc.squads.so/
- https://solana.com/docs/tokens/extensions

**Ramps**
- https://apidocs.bridge.xyz/get-started/introduction/quick-start/setting-up-sandbox.md
- https://apidocs.bridge.xyz/get-started/guides/move-money/brl_pix_integration_guide.md
- https://apidocs.bridge.xyz/get-started/guides/move-money/mxn-spei-integration-guide
- https://apidocs.bridge.xyz/docs/blockchains
- https://docs.cdp.coinbase.com/onramp/offramp/offramp-integration-guide.md
- https://docs.cdp.coinbase.com/payments/transfers/quickstart.md
- https://docs.cdp.coinbase.com/onramp/additional-resources/faq
- https://www.gemini.com/blog/gemini-now-offers-withdrawal-support-via-api-across-multiple-chains-for-usdc
- https://www.gemini.com/blog/usd-rails-launching-for-uk-and-eu-institutions
- https://blindpay.com/docs/getting-started/quick-start
- https://bitso.com/business/payouts
