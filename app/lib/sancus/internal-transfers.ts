import type { SupabaseClient } from "@supabase/supabase-js"
import type { Address } from "viem"
import { formatUnits } from "viem"
import { sendUsdcOnSameChainWithAppKit } from "@/lib/circle/app-kit-send"
import { FIXED_USD_RATES } from "./fixed-rates"
import { MOCK_TOKENS, railBurn, railMint, type LocalCurrency } from "./mock-tokens"

export type InternalTransferStatus =
  | "PENDING_APPROVAL"
  | "QUEUED"
  | "SOURCE_RESERVED"
  | "LOCAL_DEBITED"
  | "USDC_PENDING"
  | "USDC_SETTLED"
  | "LOCAL_CREDITED"
  | "COMPLETED"
  | "DECLINED"
  | "EXPIRED"
  | "FAILED"
  | "REVERSED"

export type InternalTransferRow = {
  id: string
  user_id: string
  root_company_id: string
  source_company_id: string
  destination_company_id: string
  idempotency_key: string
  memo: string | null
  source_currency: string
  destination_currency: string
  usdc_amount_minor: number | string
  source_amount_minor: number | string
  destination_amount_minor: number | string
  source_rate: string
  destination_rate: string
  source_wallet_id: string
  source_address: string
  destination_wallet_id: string
  destination_address: string
  source_bank_name: string | null
  source_bank_label: string | null
  source_bank_last4: string | null
  status: InternalTransferStatus
  approval_reason: string | null
  approved_by: string | null
  approved_at: string | null
  decided_at: string | null
  decided_note: string | null
  failed_stage: string | null
  failure_reason: string | null
  burn_tx_hash: string | null
  circle_transaction_id: string | null
  usdc_tx_hash: string | null
  mint_tx_hash: string | null
  simulated: boolean
  created_at: string
  updated_at: string
}

export type InternalTransferDto = ReturnType<typeof toInternalTransferDto>

const BANK_BY_COUNTRY: Record<string, string> = {
  ID: "Bank Central Asia",
  TH: "Kasikornbank",
  BR: "Itaú Unibanco",
  SG: "DBS Bank",
  PH: "BDO Unibank",
  MY: "Maybank",
}

export function branchBank(country: string, walletAddress: string) {
  return {
    name: BANK_BY_COUNTRY[country] ?? "Local operating bank",
    label: "Operating account",
    last4: walletAddress.slice(-4).toUpperCase(),
    simulated: true,
  }
}

export function isLocalCurrency(value: string): value is LocalCurrency {
  return value in MOCK_TOKENS
}

export function fixedRate(currency: string): number {
  return FIXED_USD_RATES[currency as keyof typeof FIXED_USD_RATES] ?? 1
}

export function localMinorForUsdc(usdcMinor: bigint, currency: string): bigint {
  if (currency === "USDC" || currency === "USD") return usdcMinor
  const rateMicro = BigInt(Math.round(fixedRate(currency) * 1_000_000))
  // USDC has 6 decimals and local mock tokens have 2.
  return (usdcMinor * rateMicro * 100n + 500_000_000_000n) / 1_000_000_000_000n
}

export function toInternalTransferDto(row: InternalTransferRow, names?: { source?: string; destination?: string }) {
  return {
    id: row.id,
    rootCompanyId: row.root_company_id,
    sourceCompanyId: row.source_company_id,
    destinationCompanyId: row.destination_company_id,
    sourceName: names?.source ?? "Source treasury",
    destinationName: names?.destination ?? "Destination treasury",
    memo: row.memo,
    sourceCurrency: row.source_currency,
    destinationCurrency: row.destination_currency,
    usdcAmountMinor: String(row.usdc_amount_minor),
    sourceAmountMinor: String(row.source_amount_minor),
    destinationAmountMinor: String(row.destination_amount_minor),
    sourceRate: row.source_rate,
    destinationRate: row.destination_rate,
    sourceWalletId: row.source_wallet_id,
    destinationWalletId: row.destination_wallet_id,
    sourceBank: row.source_bank_name
      ? { name: row.source_bank_name, label: row.source_bank_label, last4: row.source_bank_last4, simulated: true }
      : null,
    status: row.status,
    approvalReason: row.approval_reason,
    failureReason: row.failure_reason,
    failedStage: row.failed_stage,
    burnTxHash: row.burn_tx_hash,
    circleTransactionId: row.circle_transaction_id,
    usdcTxHash: row.usdc_tx_hash,
    mintTxHash: row.mint_tx_hash,
    simulated: row.simulated,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    decidedAt: row.decided_at,
  }
}

async function save(
  supabase: SupabaseClient,
  id: string,
  values: Partial<InternalTransferRow>
): Promise<InternalTransferRow> {
  const { data, error } = await supabase
    .from("sancus_internal_transfers")
    .update(values)
    .eq("id", id)
    .select("*")
    .single()
  if (error || !data) throw new Error(error?.message ?? "Could not update the internal transfer")
  return data as InternalTransferRow
}

/**
 * Resume-safe hackathon settlement. Completed stages are identified by their
 * persisted transaction hashes, so retrying never deliberately repeats them.
 */
export async function executeInternalTransfer(
  supabase: SupabaseClient,
  input: InternalTransferRow
): Promise<InternalTransferRow> {
  let row = input
  if (row.status === "PENDING_APPROVAL" || row.status === "DECLINED" || row.status === "COMPLETED") return row

  const ref = `sancus:internal:${row.id}`
  try {
    row = await save(supabase, row.id, { status: "SOURCE_RESERVED", failed_stage: null, failure_reason: null })

    if (isLocalCurrency(row.source_currency) && !row.burn_tx_hash) {
      try {
        const hash = await railBurn(
          row.source_currency,
          row.source_address as Address,
          BigInt(row.source_amount_minor),
          `${ref}:debit`
        )
        row = await save(supabase, row.id, { status: "LOCAL_DEBITED", burn_tx_hash: hash })
      } catch (error) {
        throw Object.assign(error instanceof Error ? error : new Error(String(error)), { stage: "LOCAL_DEBIT" })
      }
    }

    if (!row.circle_transaction_id) {
      row = await save(supabase, row.id, { status: "USDC_PENDING" })
      try {
        const sent = await sendUsdcOnSameChainWithAppKit({
          sourceBlockchain: "ARC-TESTNET",
          sourceWalletAddress: row.source_address,
          recipientAddress: row.destination_address,
          amount: formatUnits(BigInt(row.usdc_amount_minor), 6),
          token: "USDC",
        })
        row = await save(supabase, row.id, {
          status: "USDC_SETTLED",
          circle_transaction_id: sent.txId,
          usdc_tx_hash: sent.txHash ?? null,
        })
      } catch (error) {
        throw Object.assign(error instanceof Error ? error : new Error(String(error)), { stage: "USDC_TRANSFER" })
      }
    }

    if (isLocalCurrency(row.destination_currency) && !row.mint_tx_hash) {
      try {
        const hash = await railMint(
          row.destination_currency,
          row.destination_address as Address,
          BigInt(row.destination_amount_minor),
          `${ref}:credit`
        )
        row = await save(supabase, row.id, { status: "LOCAL_CREDITED", mint_tx_hash: hash })
      } catch (error) {
        throw Object.assign(error instanceof Error ? error : new Error(String(error)), { stage: "LOCAL_CREDIT" })
      }
    }

    return save(supabase, row.id, { status: "COMPLETED", failed_stage: null, failure_reason: null })
  } catch (error) {
    const stage = typeof error === "object" && error && "stage" in error ? String(error.stage) : "SETTLEMENT"
    const message = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500)
    try {
      return await save(supabase, row.id, { status: "FAILED", failed_stage: stage, failure_reason: message })
    } catch {
      return { ...row, status: "FAILED", failed_stage: stage, failure_reason: message }
    }
  }
}
