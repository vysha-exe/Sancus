# Sancus app

The Next.js app behind [Sancus](../README.md): a stablecoin account on Arc with local payouts, approvals, an x402-paying AI agent and an ElevenLabs voice call. Product overview, architecture, Arc contract addresses, the agent's safety limits and the ElevenLabs integration are documented in the [main README](../README.md).

## Run it

```bash
npm install
cp .env.example .env.local      # see the variables table in the main README
npx supabase db push            # or local: npx supabase start && npx supabase migration up
npm run dev                     # http://localhost:3000
npm test                        # Vitest suite
```

Step-by-step setup (Circle credentials, database, demo logins): [SANCUS-SETUP.md](SANCUS-SETUP.md).

## Where things are

| Path | What's there |
|---|---|
| `app/(sancus)/` | Sancus pages: home, pay (incl. scan a QR, US bank), activity, approvals, spending, branches, team, invoices, agents, receive, settings |
| `app/api/sancus/` | Sancus APIs: accounts and permissions, quotes, Xendit / Pix / ACH payouts, approvals, policies, agent (`agent/`, `agent/execute`, `agent/speak`) |
| `app/api/x402/` | The paid endpoint other agents buy route quotes from |
| `lib/sancus/accounts.ts` | Account types (Admin, Branch, Employee, Personal) and their permissions |
| `lib/sancus/agent/` | Agent tools, signed proposals, x402 buyer wallet, OpenAI runner |
| `lib/sancus/pay-flow.tsx`, `pay-quote.ts` | Pay flow state and USDC → local currency quotes |
| `lib/sancus/live-fx.ts` | Live ECB reference rates |
| `lib/sancus/company-wallets.ts` | Circle treasury and settlement wallets per company node |
| `components/sancus-ui/agent-*.tsx` | Agent console, voice call, shared conversation |
| `contracts/` | Arc Testnet contracts we deploy and use ([addresses](contracts/README.md)) |
| `supabase/migrations/` | Database schema and row-level security |
| `tests/` | Vitest tests |

## Upstream

This folder started from Circle's [arc-fintech](https://github.com/circlefin/arc-fintech) sample (auth, Circle wallets, Gateway, webhooks) and stays under the [Apache License 2.0](LICENSE). What we reused and what we built is listed in [UPSTREAM.md](UPSTREAM.md); the original sample's README is in the upstream repository.
