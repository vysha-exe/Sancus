// Sancus agent: the agent's own x402 wallet. The agent pays for data (live route quotes, rates)
// with Circle Gateway nanopayments on Arc, from a wallet funded by the business, under a daily cap.
// Every purchase is recorded in sancus_agent_actions. Server only.

import type { SupabaseClient } from "@supabase/supabase-js"

export const AGENT_DAILY_CAP_MINOR = BigInt(Math.round(Number(process.env.AGENT_X402_DAILY_CAP_USDC || "0.50") * 1_000_000))
const DEPOSIT_USDC = process.env.AGENT_X402_DEPOSIT_USDC || "0.50"

export function agentWalletConfigured(): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(process.env.BUYER_PRIVATE_KEY?.trim() ?? "")
}

async function gatewayClient() {
  // Dynamic import keeps the Circle client out of every other route's bundle.
  const { GatewayClient } = await import("@circle-fin/x402-batching/client")
  return new GatewayClient({ chain: "arcTestnet", privateKey: process.env.BUYER_PRIVATE_KEY!.trim() as `0x${string}` })
}

export async function spentTodayMinor(supabase: SupabaseClient, userId: string): Promise<bigint> {
  const start = new Date()
  start.setUTCHours(0, 0, 0, 0)
  const { data } = await supabase
    .from("sancus_agent_actions")
    .select("cost_minor")
    .eq("user_id", userId)
    .eq("kind", "x402")
    .gte("created_at", start.toISOString())
  return (data ?? []).reduce((s, r) => s + BigInt(r.cost_minor as string | number), 0n)
}

export type AgentWalletStatus = {
  configured: boolean
  address: string | null
  walletUsdc: string | null
  gatewayUsdc: string | null
  spentTodayMinor: string
  dailyCapMinor: string
}

export async function agentWalletStatus(supabase: SupabaseClient, userId: string): Promise<AgentWalletStatus> {
  const spent = await spentTodayMinor(supabase, userId)
  const base = { spentTodayMinor: spent.toString(), dailyCapMinor: AGENT_DAILY_CAP_MINOR.toString() }
  if (!agentWalletConfigured()) return { configured: false, address: null, walletUsdc: null, gatewayUsdc: null, ...base }
  try {
    const gw = await gatewayClient()
    const b = await gw.getBalances()
    return { configured: true, address: gw.account.address, walletUsdc: b.wallet.formatted, gatewayUsdc: b.gateway.formattedAvailable, ...base }
  } catch {
    return { configured: true, address: null, walletUsdc: null, gatewayUsdc: null, ...base }
  }
}

export type PaidResult<T> = { ok: true; data: T; costMinor: bigint; costLabel: string } | { ok: false; error: string }

/** Pays an x402 endpoint once (topping up Gateway from the agent wallet if needed), within the daily cap. */
export async function payX402<T>(
  supabase: SupabaseClient,
  userId: string,
  companyId: string | null,
  url: string,
  summary: string
): Promise<PaidResult<T>> {
  if (!agentWalletConfigured()) return { ok: false, error: "The agent's wallet isn't set up (BUYER_PRIVATE_KEY)" }
  const spent = await spentTodayMinor(supabase, userId)
  if (spent >= AGENT_DAILY_CAP_MINOR) return { ok: false, error: `The agent hit its daily data budget of $${(Number(AGENT_DAILY_CAP_MINOR) / 1e6).toFixed(2)}` }
  try {
    const gw = await gatewayClient()
    const balances = await gw.getBalances()
    if (balances.gateway.available < 10_000n) {
      // Top up Circle Gateway once; after that every call is a gasless nanopayment.
      if (balances.wallet.balance < BigInt(Math.round(Number(DEPOSIT_USDC) * 1e6))) {
        return { ok: false, error: `The agent wallet ${gw.account.address} needs testnet USDC` }
      }
      await gw.deposit(DEPOSIT_USDC)
    }
    const res = await gw.pay(url)
    const costMinor = BigInt(Math.round(Number(res.formattedAmount) * 1e6))
    await supabase.from("sancus_agent_actions").insert({
      user_id: userId,
      company_id: companyId,
      kind: "x402",
      summary,
      cost_minor: costMinor.toString(),
      reference: res.transaction ? String(res.transaction) : null,
      detail: { url: new URL(url).pathname },
    })
    return { ok: true, data: res.data as T, costMinor, costLabel: `${res.formattedAmount} USDC` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "x402 payment failed" }
  }
}
