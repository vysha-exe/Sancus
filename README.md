# Sancus

**The stablecoin account for global business.**
*One account. Every rail. Every border.*

> Sancus was the Roman god of trust, oaths and contracts. Rome kept treaties between nations in his temple.
> Sancus, the product, is a business account where the rules are enforced by code.

Sancus is a stablecoin business account for companies trading across **Asia**. A company holds a USD balance backed by USDC and uses that one balance to receive payments, pay suppliers on local rails (PayNow, QRIS, PromptPay, plus ACH/wire for the US), and fund employee corporate cards. The blockchain stays invisible: the user picks **who** to pay, **how much**, and Sancus picks the **rail**.

**Built on [Arc](https://docs.arc.io) (Circle's stablecoin L1) and the Circle developer suite:** developer-controlled wallets, Gateway (one USDC balance across chains), Gas Station and Nanopayments (x402).

> ⚠️ **Hackathon prototype.** Uses testnet USDC only. All bank, local-rail, FX and card flows are **simulated** and clearly labeled in the UI. Nothing here handles real customer funds. Real banking, card issuing and cross-border payouts require licensed partners and regulatory compliance.

---

## Example

A Singapore trading company receives **$50,000 USDC** from a customer. From the same balance it:

- pays a Singapore supplier in **SGD by PayNow** (USDC → SGD through a licensed partner, with an FX quote),
- collects from Indonesian and Thai buyers by **QRIS** and **PromptPay**,
- pays a US vendor by **ACH**,
- sends **USDC** to another business onchain,
- funds an employee's **virtual card** with a $500 limit.

One dashboard, one ledger, one balance.

## Features

| Feature | What it does | Prototype status |
|---|---|---|
| Business accounts | Register a company, invite employees, assign roles | Built |
| USD treasury | USDC held in Circle developer-controlled wallets + a Gateway unified balance on Arc | **Real (testnet)** |
| Crypto payments | Send and receive USDC to wallet addresses | **Real (testnet)** |
| Singapore payouts | USDC → SGD via PayNow / FAST (StraitsX-style partner) | Sandbox or simulated |
| Asia collections | QRIS (ID), PromptPay (TH) charges | **Real sandboxes** (`rails-demo/`) |
| Bank transfers | ACH, wire (US) via Bridge-style partner | Sandbox or simulated |
| Corporate cards | Virtual cards with limits, holds and settlement | **Marqeta sandbox** (`rails-demo/`) |
| Earning treasury *(x402)* | Agents pay per call for Sancus routing quotes; revenue lands in the Gateway balance | Built (testnet) |
| Payment routing | Picks the best rail by destination, currency, fee and speed | Built |
| Spending controls | Employee budgets, per-payment limits, approvals | Built (onchain + app) |
| Invoice payments | Upload an invoice and pay the supplier | Built |
| Unified ledger | Double-entry ledger reconciling onchain and simulated payments | Built |
| Event hedging *(stretch)* | Suggest prediction-market hedges for FX / macro risk | Stretch |
| Tokenized stock treasury *(stretch)* | Hold part of the treasury in tokenized stocks | Stretch |

## Architecture

```
                    ┌──────────────────────────────┐
                    │   Next.js dashboard (web)    │
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────▼───────────────┐
                    │  API + core services (TS)    │
                    │  • Payment router            │
                    │  • Ledger (double-entry)     │
                    │  • Policy / approvals        │
                    │  • Rail adapters             │
                    └──┬──────────┬──────────┬─────┘
                       │          │          │
          ┌────────────▼──────┐ ┌─▼────────┐ ┌▼───────────────────────┐
          │ Circle suite (Arc)│ │PostgreSQL│ │ Payment partners        │
          │ • Dev wallets     │ │          │ │ PayNow (StraitsX-style) │
          │ • Gateway balance │ │          │ │ QRIS · PromptPay        │
          │ • Gas Station     │ │          │ │ ACH (Bridge-style)      │
          │ • Nanopayments    │ │          │ │ Cards (Marqeta)         │
          │ SancusTreasury.sol│ │          │ │ FX quotes               │
          │ (limits, holds)   │ │          │ │                         │
          └───────────────────┘ └──────────┘ └─────────────────────────┘
                         Arc testnet (chain ID 5042002)
```

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router) + Tailwind, starting from Circle's [arc-fintech](https://github.com/circlefin/arc-fintech) sample (Apache-2.0) |
| Backend | TypeScript (Next.js route handlers + `packages/core`) |
| Database | PostgreSQL (Supabase, as in arc-fintech) |
| Chain | **Arc testnet**: Circle's L1, USDC is the gas token |
| Wallets | Circle developer-controlled wallets (treasury, payout signer, AP agent); passkey (modular) wallets for admin approvals |
| Balance | Circle Gateway: one USDC balance across Arc and other testnets; mint on whichever chain a payout partner needs |
| Gas | Circle Gas Station (no gas tokens for users) |
| Smart contracts | Solidity + OpenZeppelin, Foundry: spending limits, approvals, holds |
| Agent payments | Circle Nanopayments / x402 (earnings settle into the Gateway balance) |
| Stablecoin | Testnet USDC and EURC (faucet.circle.com) |
| Fiat / cards / local rails | Adapter interface; real sandboxes where available (`rails-demo/`), simulated otherwise |

## Repository layout

```
sancus/
├── app/                     # Next.js + Supabase app (from Circle's arc-fintech, Apache-2.0)
│   ├── app/                 #   pages + API routes (wallets, Gateway, payouts, webhooks…)
│   ├── lib/circle/          #   Circle wallets, Gateway, App Kit, EarnKit clients
│   ├── supabase/            #   database migrations
│   └── SANCUS-SETUP.md      #   how to run it locally
├── rails-demo/              # Sandbox checks: Marqeta cards, QRIS, PromptPay, Pix
├── contracts/               # (planned) SancusTreasury.sol: limits, approvals, holds
├── docs/
│   ├── brand/               # Logo, tokens, components
│   └── research/            # Chain, ramp and building-block research
├── BUILD.md                 # Build plan
├── .env.example
└── README.md
```

## Getting started

**The app lives in [`app/`](app/).** Follow [app/SANCUS-SETUP.md](app/SANCUS-SETUP.md) to run it locally (Circle API key, entity secret, Supabase, `npm run dev`).

> The commands below are from the original plan in [BUILD.md](BUILD.md) and will change as the contracts and core packages are added:

```bash
pnpm install
cp .env.example .env          # fill in RPC URL, keys, Privy app ID, DATABASE_URL
pnpm db:migrate && pnpm db:seed
pnpm contracts:deploy         # deploys SancusTreasury to the configured testnet
pnpm dev                      # http://localhost:3000
```

Get testnet USDC from the [Circle faucet](https://faucet.circle.com).

## Engineering reports

- [Admin route performance investigation](docs/ADMIN-ROUTE-PERFORMANCE-REPORT.md): repeated workspace requests, the client cache fix, verification evidence, and remaining first-load work.

## Demo script

1. **Create an account:** register *Lion City Trading Pte Ltd* (Singapore); Sancus creates its Circle wallets.
2. **Receive funds:** deposit 10,000 testnet USDC into the Gateway balance (from Arc or another testnet).
3. **Pay a crypto supplier:** send 1,000 USDC onchain on Arc; show the real transaction hash.
4. **Pay a Singapore supplier:** S$2,000 by PayNow; show the FX quote, the USDC → SGD conversion and the payout status.
5. **Approve a large payment:** a payment over the threshold waits for an admin to approve with a passkey.
6. **Issue a card:** an employee card with a $500 limit; simulate a $100 purchase (hold → settle).
7. **Earn:** an outside agent pays for a Sancus routing quote over x402; the revenue lands in the treasury.
8. **Reconcile:** one dashboard with every payment, fee, pending hold and the available balance.

## Competitive positioning

- **Brex / Ramp:** spend management and cards, built on traditional banking.
- **Slash Global:** stablecoin-powered business banking and cards.
- **Sancus:** a stablecoin treasury with an **extensible payment orchestration engine** that routes each payment across crypto, bank, local and card rails to optimize cost, FX and settlement speed, with spending rules enforced onchain.

## Roadmap

- Live partner integrations: fiat on/off-ramp, ACH/wire, Pix/SPEI payouts, stablecoin-backed cards
- Treasury yield (tokenized T-bills) and business financing
- Payroll and accounts payable automation
- Multi-currency balances and FX optimization
- Prediction-market hedging for FX and macro events

## License

[MIT](LICENSE), except [`app/`](app/), which started from Circle's [arc-fintech](https://github.com/circlefin/arc-fintech) sample and stays under the [Apache License 2.0](app/LICENSE). See [app/UPSTREAM.md](app/UPSTREAM.md).
