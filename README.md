# Sancus

**One USDC balance to pay suppliers, staff and families across borders, with an AI agent that does the paperwork and never moves money without you.**

> Sancus was the Roman god of trust, oaths and contracts. Sancus, the product, is a stablecoin account where the rules are enforced by code.

Sancus is a stablecoin business account built on **Arc** and the **Circle** developer suite. A company (or a person) holds one USD balance in USDC, then pays people in **Thailand (PromptPay), Indonesia (BI-FAST) and Brazil (Pix)**, or US bank accounts by ACH, from that one balance. The user picks *who* and *how much*; Sancus quotes the live rate, picks the rail and settles. The blockchain stays invisible.

On top sits the **Sancus agent**: tell it, by text or by voice, what you want ("pay Siam Packaging 5,000 baht for invoice INV-88"). It looks things up, buys live route data with **x402 nanopayments** from its own budgeted wallet, and prepares every payment as a **signed card you confirm**. It can also open the right page and answer questions about the page you're on.

> ⚠️ **Hackathon prototype on testnets.** Circle wallets, Gateway and x402 run on Arc Testnet; payout and card partners run in their sandboxes or as clearly labeled simulations. No real customer funds. See [What's real and what's simulated](#whats-real-and-whats-simulated).

**Live app:** https://sancus-peach.vercel.app · **Demo logins:** in our Devpost submission

---

## Hackathon submission (UBC 2026)

| | |
|---|---|
| **Main track** | Agentic Payments and AI |
| **Chain award** | Best use of Arc |
| **Bounty** | Best Project built with ElevenLabs |
| **Required for the track** | [Agent decision loop and safety limits](#the-agent-decision-loop-and-safety-limits) |
| **Required for Arc** | [How Sancus uses Arc](#how-sancus-uses-arc) and [contract addresses](#contract-addresses-arc-testnet-chain-id-5042002) |
| **Required for ElevenLabs** | [Voice: how we use ElevenLabs](#voice-how-we-use-elevenlabs) |

### What did we build?
A multi-entity stablecoin account (global HQ, country branches, employees, and personal accounts) with local payouts, collections, cards, approvals, and an AI agent that can safely spend on the user's behalf.

### What problem does it solve?
A company with suppliers and staff in emerging markets juggles a bank account per country, slow and expensive wires, and opaque FX. Families sending money home have the same problem at a smaller scale. Sancus gives them one dollar balance, live FX quotes, and local rails that arrive in seconds, plus spending controls so a business can let employees and an AI agent act without handing over the keys.

### What makes it unique?
- **Both sides of agent payments:** the Sancus agent *pays* for data over x402 from a capped wallet, and Sancus *sells* its route quotes to other agents over x402 (revenue lands in the treasury).
- **The agent can't move money on its own:** every action is an HMAC-signed, expiring proposal bound to the user and the exact request; only the user's Confirm (tap or voice) runs it.
- **Voice that acts:** an "Ask Sancus" call on every page answers questions about the screen, navigates, and prepares payments you confirm by voice.
- **Accounts that match real companies:** HQ → branches → people, each with its own wallet, balance, limits and permissions.

---

## Architecture

```mermaid
flowchart LR
  subgraph Browser
    UI[Next.js app<br/>Home · Pay · Activity · Team · Branches · Agents]
    Call[Ask Sancus voice call<br/>Web Speech STT + audio]
  end

  subgraph Server[Next.js route handlers]
    Pay[Pay, quotes, payouts]
    Agent[Agent loop<br/>OpenAI + tools]
    Exec[Proposal executor<br/>HMAC check]
    Speak[TTS proxy]
    X402S[x402 paid endpoint<br/>/api/x402/route-quote]
    Ledger[Ledger, approvals, policies]
  end

  subgraph Circle[Circle on Arc Testnet]
    DCW[Developer-controlled wallets<br/>treasury + settlement per company]
    GW[Gateway unified balance]
    NANO[x402 batching / Nanopayments]
    USDC[(Arc USDC)]
  end

  subgraph Partners[Sandboxes / simulations]
    XEN[Xendit: PromptPay TH, BI-FAST ID]
    PIX[PayZu: Pix BR]
    ACH[Mock ACH rail]
    CARD[Marqeta cards]
    COL[Omise / Midtrans: QR collections]
  end

  DB[(Supabase Postgres<br/>RLS)]
  EL[ElevenLabs TTS]
  FX[ECB live FX]

  UI --> Pay --> DCW
  UI --> Agent
  Call --> Agent
  Call --> Speak --> EL
  Agent -->|signed proposal| UI
  UI -->|Confirm| Exec --> Pay
  Agent -->|buy quote| NANO --> X402S
  Pay --> XEN & PIX & ACH
  Pay --> FX
  DCW --> USDC
  GW --> USDC
  Server --> DB
  Ledger --> DB
```

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Supabase (Postgres + row-level security) · viem · Circle Developer-Controlled Wallets, Gateway, App Kit, x402 batching · OpenAI (agent) · ElevenLabs (voice) · Vercel.

The app started from Circle's [arc-fintech](https://github.com/circlefin/arc-fintech) sample (Apache-2.0) for auth, wallets and Gateway plumbing; everything under "Sancus" (accounts, payouts, agent, voice, x402, ledger, branches) was built during the hackathon. See [app/UPSTREAM.md](app/UPSTREAM.md).

---

## Features

| Area | What it does |
|---|---|
| **Account types** | Business admin (whole company), Branch admin (one branch), Employee (card + limits), Personal (no business). Each sees only what its permissions allow. |
| **Company tree** | Global HQ (US) with branches in Indonesia, Thailand, Brazil and the US. Each node has its own Circle treasury and settlement wallet; the org chart shows who works where. |
| **Pay** | Pick a payee, enter what they get or what you send; the quote converts from USDC at the live ECB rate. PromptPay (TH), BI-FAST (ID), Pix (BR), ACH (US). |
| **Scan a QR** | Camera or upload; reads EMVCo PromptPay, Pix and QRIS codes and pays them. |
| **Approvals and limits** | Per-payment and daily limits per person; employee payment requests and payments over a rule wait for an approver (US ACH and treasury payouts today; extending to the PromptPay, BI-FAST and Pix routes is next). |
| **Cards** | Employee virtual cards with monthly limits, holds and settlement. |
| **Collections** | Receive by local QR (PromptPay, QRIS, Pix). |
| **Ledger and activity** | Double-entry ledger; one activity feed across rails. |
| **Agent** | Text or voice; balances, payees, live quotes, x402 route quotes, payments, collections, limit changes, opening pages. |
| **Earning treasury** | Other agents pay $0.01 per call (x402) for Sancus route quotes. |

---

## How Sancus uses Arc

Arc is the settlement layer: USDC is both the balance and the gas token, so fees are predictable and nobody needs a second token.

1. **Treasury wallets on Arc.** Every company node gets Circle developer-controlled SCA wallets on Arc Testnet (a treasury and a settlement wallet) inside one wallet set per company.
2. **Payouts settle onchain.** Before the partner pays out locally, the payout moves the dollar amount on Arc from the paying node's treasury to a settlement wallet (the stand-in for the payout partner's deposit address). The transfer runs through Circle App Kit from the Circle wallet, in fUSDC (our test settlement token) when it's enabled, otherwise Arc USDC, and the Arc transaction hash shows in the Process log.
3. **Gateway unified balance.** Treasury deposits and the x402 revenue use Circle Gateway on Arc.
4. **x402 nanopayments on Arc.** The agent's buyer wallet pays per request through Circle's x402 batching facilitator; the paid endpoint verifies and settles on Arc.
5. **Local-currency tokens.** Collections mint matching mock local stablecoins (mTHB, mIDR, mBRL) on Arc into the branch wallet.

### Contract addresses (Arc Testnet, chain ID 5042002)

**Deployed by Sancus** (sources and deploy scripts in [app/contracts](app/contracts/README.md)):

| Contract | Address |
|---|---|
| Sancus Face USDC (fUSDC), test settlement token | `0x5ae6d882b075628ea839e57cf422172434f27e0c` |
| Sancus Mock Brazilian Real (mBRL) | `0xa4998745ede2f259f392ee4b71156badb5da8755` |
| Sancus Mock Indonesian Rupiah (mIDR) | `0xdca139d380fbd00c61b4ed696d8f81e659957ae6` |
| Sancus Mock Thai Baht (mTHB) | `0x00bf05794364ef67815094d7158a0270e555f944` |
| Mock Equity Broker (treasury stretch) | `0x92a9e4cfaa4d35dd1f27a28c1728bdf1d5719a04` |

**Circle / Arc contracts we use:**

| Contract | Address |
|---|---|
| Arc Testnet USDC | `0x3600000000000000000000000000000000000000` |
| Circle Gateway Wallet | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` |
| Circle Gateway Minter | `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B` |

Explorer: https://explorer.testnet.arc.io

---

## The agent: decision loop and safety limits

Code: [`app/api/sancus/agent/route.ts`](app/app/api/sancus/agent/route.ts), [`lib/sancus/agent/tools.ts`](app/lib/sancus/agent/tools.ts), [`lib/sancus/agent/proposals.ts`](app/lib/sancus/agent/proposals.ts), [`lib/sancus/agent/x402-wallet.ts`](app/lib/sancus/agent/x402-wallet.ts), [`app/api/sancus/agent/execute/route.ts`](app/app/api/sancus/agent/execute/route.ts).

### Decision loop

```
user message (text or voice) + the page they're on
        │
        ▼
1. Build context: account type, permissions, workspace, page text
2. LLM picks a tool ──► tool calls the app's own API as the user (their session)
        │                 • read: get_balances, list_recipients, quote_payment,
        │                   recent_activity, my_spending, list_people
        │                 • pay for data: buy_route_quote (x402, from the agent wallet)
        │                 • act: propose_payment, propose_collection, propose_limits, open_page
        ▼
3. Tool result goes back to the LLM; repeat (max 12 steps)
        │
        ▼
4. Reply (spoken in voice mode) + any proposal cards
        │
        ▼
5. User taps Confirm or says "confirm"  ──► executor verifies the signature ──► runs the one API call
```

Progress streams to the browser as each tool starts and finishes, so both the chat and the voice call show what it's doing.

### Safety limits

| Limit | How it's enforced |
|---|---|
| **No money moves without the user** | Tools that change anything only create a *proposal*. It's HMAC-signed (`AGENT_PROPOSAL_SECRET`), bound to the user id, the exact method, path and body, and **expires after 10 minutes**. The executor re-verifies all of it before running. |
| **Allowlisted endpoints** | Each proposal kind may call exactly one endpoint (payouts, Pix, ACH, collections, limits). A tampered proposal that points elsewhere is rejected. |
| **Same permissions as the user** | Tools call the app's APIs with the user's own session, so account permissions, spending policies, limits and approvals apply exactly as in the UI. Tools the account can't use aren't offered (e.g. no payment tools for employees). |
| **Budgeted data spending** | The agent pays for x402 data from its own wallet, not the treasury, under a **daily cap** enforced in code (`AGENT_X402_DAILY_CAP_USDC`, default $0.50); its instructions also limit it to 3 paid calls per request. Every payment is logged in Agent activity. |
| **Idempotent execution** | Confirming twice can't pay twice: each proposal executes with an idempotency key (`agent-<proposal id>`). |
| **Pause switch** | The agent can be paused from the Agents page; voice and chat stop accepting requests. |
| **Bounded loop** | At most 12 tool steps per request; errors come back as text, never as silent retries. |

---

## Voice: how we use ElevenLabs

Voice is how most people will use the agent: a hands-free call where Sancus listens, answers out loud, and acts on the page.

| Piece | What we use |
|---|---|
| **Text-to-speech** | ElevenLabs **streaming TTS** (`/v1/text-to-speech/{voice}/stream`) with **Flash v2.5** (`eleven_flash_v2_5`, ~100 ms) and text normalization on, so amounts and currencies are read naturally. Default voice: Sarah (American English). |
| **Low latency** | The reply is split into sentences that download in parallel and play back to back; fixed phrases ("Checking your balances", greetings) are pre-recorded on call start; the real answer interrupts any progress line. |
| **Key safety** | The API key stays on the server: the browser plays audio from our proxy ([`app/api/sancus/agent/speak/route.ts`](app/app/api/sancus/agent/speak/route.ts)). |
| **Listening** | Browser speech recognition (Chrome/Edge); "confirm", "cancel" and "end call" are handled locally. |

Where it shows up:
- **Ask Sancus** button at the top right of every page: a voice call that can answer questions about the page, open pages, and prepare payments you confirm by voice or tap ([`components/sancus-ui/agent-call.tsx`](app/components/sancus-ui/agent-call.tsx)).
- **Voice mode** on the Agents page, with confirm cards and live progress ([`components/sancus-ui/agent-console.tsx`](app/components/sancus-ui/agent-console.tsx)).

---

## What's real and what's simulated

| Part | Status |
|---|---|
| Circle developer-controlled wallets on Arc | **Real (testnet)** |
| Circle Gateway unified balance | **Real (testnet)** |
| x402 payments (agent pays, Sancus sells) | **Real (testnet)**, Circle x402 batching on Arc |
| Onchain leg of a payout (treasury → settlement) | **Real (testnet)** Arc transaction, in fUSDC when enabled, otherwise Arc USDC |
| Company balances | Arc testnet tokens; demo balances use **fUSDC**, our mintable test token (`SANCUS_FACE_USDC=false` switches back to Circle USDC), because faucet USDC is rate-limited |
| Live FX quotes | **Real** ECB reference rates (Frankfurter), cached 10 minutes |
| PromptPay (TH) and BI-FAST (ID) payouts | **Xendit test mode**; falls back to a labeled simulation when money-out isn't enabled |
| Pix (BR) payouts | **PayZu sandbox** when a key is set, otherwise a labeled simulation |
| US ACH | Mock rail with real onchain funding |
| Cards | **Marqeta sandbox** |
| QR collections | **Omise (PromptPay) and Midtrans (QRIS) sandboxes**, see `rails-demo/` |
| AI agent | **Real** (OpenAI) |
| Voice | **Real** (ElevenLabs) |

---

## Repository layout

```
sancus/
├── app/                        # The Next.js app (started from Circle arc-fintech, Apache-2.0)
│   ├── app/(sancus)/           #   Sancus pages: home, pay, activity, team, branches, agents, …
│   ├── app/api/sancus/         #   Sancus APIs: payouts, quotes, agent, approvals, accounts, …
│   ├── app/api/x402/           #   Paid endpoint sold to agents over x402
│   ├── lib/sancus/             #   Core: accounts & permissions, payouts, FX, ledger, agent, rails
│   ├── components/sancus-ui/   #   UI, incl. agent console and voice call
│   ├── contracts/              #   Arc Testnet contracts we deploy and use
│   ├── supabase/migrations/    #   Database schema
│   └── tests/                  #   Vitest suite
├── rails-demo/                 # Sandbox checks: Marqeta, Omise, Midtrans, PayZu
└── docs/                       # Architecture notes, research, brand, wireframes
```

---

## Running it locally

Requirements: Node.js 22+, a Supabase project (or Docker for local Supabase), a Circle testnet API key and entity secret.

```bash
cd app
npm install
cp .env.example .env.local      # fill in the values below
npx supabase db push            # or: npx supabase start && npx supabase migration up
npm run dev                     # http://localhost:3000
```

| Variables | Used for |
|---|---|
| `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`, `KIT_KEY` | Circle wallets, Gateway, App Kit |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | Database and auth |
| `OPENAI_API_KEY` (optional `OPENAI_AGENT_MODEL`) | The agent |
| `AGENT_PROPOSAL_SECRET` | Signing agent proposals |
| `BUYER_PRIVATE_KEY`, `AGENT_X402_DAILY_CAP_USDC` | The agent's x402 wallet and its daily cap |
| `SANCUS_X402_PAY_TO`, `SANCUS_X402_PRICE` | Where x402 revenue lands, and the price per call |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | Voice |
| `XENDIT_*`, `PAYZU_*`, `MARQETA_*`, `OMISE_*`, `MIDTRANS_*` | Partner sandboxes (optional; simulated without them) |

More detail: [app/SANCUS-SETUP.md](app/SANCUS-SETUP.md). Testnet USDC: https://faucet.circle.com (Arc Testnet). Run the tests with `npm test`.

---

## Demo walkthrough

1. **Business admin**: Home shows the company balance across HQ and branches; Branches shows the org chart.
2. **Pay** Siam Packaging ฿5,000 by PromptPay: live quote in USDC, review, pay; the processing page shows each leg.
3. **Ask Sancus** (top right): "pay Café do Sertão 2,000 reais for beans" → the agent quotes, prepares a card, you say "confirm".
4. **x402**: ask the agent for the cheapest route into Indonesia; it pays $0.01 from its capped wallet and shows what it spent.
5. **Employee**: card and limits; the agent answers "how much is left on my card?".
6. **Personal account**: scan a PromptPay QR and pay it.

---

## What we'd build next

- Live payout partners (Xendit money-out, a licensed Pix provider) and a real USDC on/off-ramp
- Approvals and limits on every rail, then enforced in a smart contract on Arc, not only in the app
- ElevenLabs Agents for full-duplex voice
- Treasury yield (tokenized T-bills) and payroll

## License

[MIT](LICENSE), except [`app/`](app/), which started from Circle's [arc-fintech](https://github.com/circlefin/arc-fintech) sample and stays under the [Apache License 2.0](app/LICENSE). See [app/UPSTREAM.md](app/UPSTREAM.md).
