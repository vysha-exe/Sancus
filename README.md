# Sancus

**The stablecoin account for global business.**
*One account. Every rail. Every border.*

> Sancus was the Roman god of trust, oaths and contracts. Rome kept treaties between nations in his temple.
> Sancus, the product, is a business account where the rules are enforced by code.

Sancus is a crypto-native global business account. A company holds a USD balance backed by USDC and uses that one balance to receive payments, pay suppliers and contractors on any rail (USDC, ACH, wire, SEPA, Pix, SPEI), and fund employee corporate cards. The blockchain stays invisible: the user picks **who** to pay, **how much**, and Sancus picks the **rail**.

> ⚠️ **Hackathon prototype.** Uses testnet USDC only. All bank, local-rail, FX and card flows are **simulated** and clearly labeled in the UI. Nothing here handles real customer funds. Real banking, card issuing and cross-border payouts require licensed partners and regulatory compliance.

---

## Example

A Brazilian company receives **$50,000 USDC** from a customer. From the same balance it:

- pays a US supplier by **ACH**,
- pays a Brazilian contractor by **Pix** (in BRL, with an FX quote),
- sends **USDC** to another business onchain,
- funds an employee's **virtual card** with a $500 limit.

One dashboard, one ledger, one balance.

## Features

| Feature | What it does | Prototype status |
|---|---|---|
| Business accounts | Register a company, invite employees, assign roles | Built |
| USD treasury | Hold, deposit and withdraw USDC through a treasury contract | **Real (testnet)** |
| Crypto payments | Send and receive USDC to wallet addresses | **Real (testnet)** |
| Bank transfers | ACH, wire, SEPA | Simulated |
| Local payments | Pix (BR), SPEI (MX) | Simulated |
| Corporate cards | Virtual cards with limits, holds and settlement | Simulated |
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
          ┌────────────▼──┐  ┌────▼─────┐  ┌─▼──────────────────┐
          │ SancusTreasury│  │PostgreSQL│  │ Simulated rails    │
          │ (Solidity)    │  │          │  │ ACH · Wire · SEPA  │
          │ USDC, roles,  │  │          │  │ Pix · SPEI · Cards │
          │ limits, holds │  │          │  │ FX quotes          │
          └───────────────┘  └──────────┘  └────────────────────┘
               EVM testnet (Base Sepolia or Arc testnet)
```

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router) + Tailwind |
| Backend | TypeScript (Next.js route handlers + `packages/core`) |
| Database | PostgreSQL + Prisma |
| Smart contracts | Solidity + OpenZeppelin, Foundry |
| Chain | EVM testnet: **Base Sepolia** (default) or **Arc testnet** (Circle's USDC-native L1) |
| Wallets | Privy (email login + embedded wallets), wagmi, viem |
| Stablecoin | Testnet USDC (Circle faucet) |
| Fiat / cards / local rails | Adapter interfaces with simulated implementations (Bridge-, Rain-, Pix-, SPEI-style) |

## Repository layout

```
sancus/
├── apps/
│   └── web/                 # Next.js dashboard + API route handlers
├── packages/
│   ├── contracts/           # Foundry project: SancusTreasury.sol + tests + deploy scripts
│   ├── core/                # Router, ledger, policy engine, rail adapters (pure TS, unit-tested)
│   └── db/                  # Prisma schema, migrations, seed (demo Brazilian company)
├── BUILD.md                 # Step-by-step build instructions
├── .env.example
└── README.md
```

## Getting started

> The scaffold is created by following [BUILD.md](BUILD.md). Once it exists:

```bash
pnpm install
cp .env.example .env          # fill in RPC URL, keys, Privy app ID, DATABASE_URL
pnpm db:migrate && pnpm db:seed
pnpm contracts:deploy         # deploys SancusTreasury to the configured testnet
pnpm dev                      # http://localhost:3000
```

Get testnet USDC from the [Circle faucet](https://faucet.circle.com).

## Demo script

1. **Create an account:** register *Café Paulista Ltda* (Brazil) and deploy its treasury.
2. **Receive funds:** deposit 10,000 testnet USDC.
3. **Pay a crypto supplier:** send 1,000 USDC onchain; show the real transaction hash.
4. **Pay a US supplier:** 2,000 USD by ACH; show the simulated conversion and settlement timeline.
5. **Pay a local contractor:** Pix payout in BRL with the FX quote and the amount the recipient gets.
6. **Issue a card:** an employee card with a $500 limit; simulate a $100 purchase (hold → settle).
7. **Reconcile:** one dashboard with every payment, fee, pending hold and the available balance.

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

[MIT](LICENSE)
