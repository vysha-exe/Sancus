// Face USDC faucet + status for test settlements.
//   GET  → { enabled, token, balances[] }
//   POST → mint a large fUSDC balance to every treasury wallet for this user / workspace
import { NextResponse } from "next/server"
import { withAuth } from "@/lib/api/with-auth"
import { FACE_USDC_FAUCET_MINOR, faceUsdcAddress, faceUsdcEnabled, faceUsdcExplorer, getFaceUsdcBalance, mintFaceUsdc } from "@/lib/sancus/face-usdc"
import { workspaceCompany } from "@/lib/sancus/workspace-server"
import { displayMinor, USDC_DECIMALS } from "@/lib/sancus/money"

export const maxDuration = 120

export const GET = withAuth(async (req, { user, supabase }) => {
  const enabled = faceUsdcEnabled()
  const token = faceUsdcAddress()
  if (!enabled || !token) {
    return NextResponse.json({
      enabled: false,
      token: null,
      explorer: null,
      hint: "Run node scripts/deploy-mock-stablecoins.mjs and keep MOCK_RAIL_MINTER_KEY set.",
    })
  }

  const companyId = await workspaceCompany(req, supabase, user.id)
  let q = supabase.from("wallets").select("address, name, type, company_id").eq("user_id", user.id)
  // Personal / individual: only company_id-null treasuries. Business workspace: that company's wallets.
  q = companyId ? q.eq("company_id", companyId) : q.is("company_id", null)
  const { data } = await q.order("created_at", { ascending: true })
  const wallets = (data ?? []).filter((w) => w.type !== "payout")

  const balances = []
  for (const w of wallets) {
    try {
      const bal = await getFaceUsdcBalance(w.address as `0x${string}`)
      balances.push({
        address: w.address,
        name: w.name,
        balanceMinor: bal.toString(),
        balanceLabel: `$${displayMinor(bal, USDC_DECIMALS, "", 2)}`,
      })
    } catch {
      balances.push({ address: w.address, name: w.name, balanceMinor: null, balanceLabel: null })
    }
  }

  return NextResponse.json({
    enabled: true,
    token,
    symbol: "fUSDC",
    explorer: faceUsdcExplorer(),
    faucetMinor: FACE_USDC_FAUCET_MINOR.toString(),
    balances,
  })
})

export const POST = withAuth(async (req, { user, supabase }) => {
  if (!faceUsdcEnabled()) {
    return NextResponse.json({ error: "Face USDC isn't enabled (deploy fUSDC + MOCK_RAIL_MINTER_KEY)." }, { status: 503 })
  }

  const companyId = await workspaceCompany(req, supabase, user.id)
  let q = supabase.from("wallets").select("address, name, type").eq("user_id", user.id)
  q = companyId ? q.eq("company_id", companyId) : q.is("company_id", null)
  const { data } = await q.order("created_at", { ascending: true })
  const wallets = (data ?? []).filter((w) => w.type !== "payout" && w.address)

  if (!wallets.length) {
    return NextResponse.json({ error: "No treasury wallets to fund yet." }, { status: 400 })
  }

  const minted = []
  for (const w of wallets) {
    const hash = await mintFaceUsdc(w.address as `0x${string}`, FACE_USDC_FAUCET_MINOR, `sancus:face-usdc:faucet:${user.id}:${Date.now()}`)
    minted.push({
      address: w.address,
      name: w.name,
      amountLabel: `$${displayMinor(FACE_USDC_FAUCET_MINOR, USDC_DECIMALS, "", 2)}`,
      txHash: hash,
      explorer: `https://explorer.testnet.arc.io/tx/${hash}`,
    })
  }

  return NextResponse.json({ ok: true, minted })
})
