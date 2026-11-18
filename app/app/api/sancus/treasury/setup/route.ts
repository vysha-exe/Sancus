// Sancus: Arc treasury wallets for the signed-in account.
//
//   GET  → is Circle configured, which Sancus wallets exist
//   POST → create whatever's missing (idempotent). Also called automatically
//          on sign-up, demo login, email confirmation and first app visit.
// See lib/sancus/provision.ts for what gets created.
import { NextResponse } from "next/server"
import { withAuth } from "@/lib/api/with-auth"
import { circleConfigured, listTreasuryWallets, type WalletRow } from "@/lib/sancus/provision"
import { provisionTreasury } from "@/lib/sancus/provision-circle"

function summary(wallets: WalletRow[]) {
  const pick = (type: string) => wallets.find((w) => w.type === type) ?? null
  const view = (w: WalletRow | null) =>
    w
      ? { name: w.name, address: w.address, walletId: w.circle_wallet_id, explorer: `https://explorer.testnet.arc.io/address/${w.address}` }
      : null
  return { treasury: view(pick("treasury")), settlement: view(pick("payout")), faucet: "https://faucet.circle.com" }
}

export const GET = withAuth(async (_req, { user, supabase }) => {
  const wallets = await listTreasuryWallets(supabase, user.id)
  return NextResponse.json({ circleConfigured: circleConfigured(), ...summary(wallets) })
})

export const POST = withAuth(async (_req, { user, supabase }) => {
  const result = await provisionTreasury(supabase, user.id)
  if (result.ok) {
    return NextResponse.json(
      { circleConfigured: true, created: result.created, notes: result.notes, ...summary(result.wallets) },
      { status: result.created.length ? 201 : 200 }
    )
  }
  if (result.reason === "circle-not-configured") {
    return NextResponse.json(
      {
        circleConfigured: false,
        error: "Circle isn't set up yet",
        fix: "Add CIRCLE_API_KEY (console.circle.com → Testnet → API Keys) to app/.env.local, run `node scripts/circle-entity-secret.mjs`, then restart the app.",
        ...summary(result.wallets),
      },
      { status: 503 }
    )
  }
  console.error("Treasury setup failed", result.message)
  return NextResponse.json(
    { error: "Couldn't create the Circle wallets", reason: result.message, ...summary(result.wallets) },
    { status: 502 }
  )
})
