import type { SupabaseClient } from "@supabase/supabase-js"
import type { Address } from "viem"
import { FIXED_USD_RATES } from "./fixed-rates"
import {
  bankMinorFromTransportMinor,
  burnTransportToBank,
  executeFixedFx,
  mintTransportFromBank,
  quoteFixedFx,
  transportMinorFromBankMinor,
} from "./mock-fx"

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
  source_bank_account_id: string | null
  destination_bank_account_id: string | null
  source_bank_hold_reference: string | null
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
  source_token_mint_tx_hash: string | null
  fx_tx_hash: string | null
  fx_rate_version: number | string | null
  destination_token_burn_tx_hash: string | null
  simulated: boolean
  created_at: string
  updated_at: string
}

export type InternalTransferDto = ReturnType<typeof toInternalTransferDto>

export function fixedRate(currency: string): number {
  return FIXED_USD_RATES[currency as keyof typeof FIXED_USD_RATES] ?? 1
}

export function localMinorForUsdc(usdcMinor: bigint, currency: string): bigint {
  // Only USDC (HQ's wallet) keeps 6 decimals. USD is a branch bank account in cents like every other
  // local currency; returning USDC units for it credited a US branch 10,000x the amount.
  if (currency === "USDC") return usdcMinor
  const rateMicro = BigInt(Math.round(fixedRate(currency) * 1_000_000))
  // USDC has 6 decimals and local bank accounts / mock tokens have 2.
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
    sourceBankAccountId: row.source_bank_account_id,
    destinationBankAccountId: row.destination_bank_account_id,
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
    sourceTokenMintTxHash: row.source_token_mint_tx_hash,
    fxTxHash: row.fx_tx_hash,
    fxRateVersion: row.fx_rate_version == null ? null : String(row.fx_rate_version),
    destinationTokenBurnTxHash: row.destination_token_burn_tx_hash,
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
  let holdReference: string | null = row.source_bank_hold_reference
  let bankCaptured = Boolean(row.source_bank_account_id && row.burn_tx_hash)
  let sourceTokenMinted = Boolean(row.source_token_mint_tx_hash)
  let fxSettled = Boolean(row.fx_tx_hash)
  const sourceTokenMinor = row.source_bank_account_id
    ? transportMinorFromBankMinor(row.source_currency, BigInt(row.source_amount_minor))
    : BigInt(row.usdc_amount_minor)
  try {
    row = await save(supabase, row.id, { status: "SOURCE_RESERVED", failed_stage: null, failure_reason: null })

    if (row.source_bank_account_id && !row.burn_tx_hash) {
      try {
        holdReference = row.source_bank_hold_reference ?? `${ref}:bank-hold`
        const { error: holdError } = await supabase.rpc("sancus_bank_create_hold", {
          p_account_id: row.source_bank_account_id,
          p_amount_minor: String(row.source_amount_minor),
          p_reference: holdReference,
          p_source_type: "INTERNAL_TRANSFER",
          p_source_id: row.id,
        })
        if (holdError) throw new Error(holdError.message)
        const { error: captureError } = await supabase.rpc("sancus_bank_capture_hold", { p_reference: holdReference })
        if (captureError) throw new Error(captureError.message)
        bankCaptured = true
        row = await save(supabase, row.id, {
          status: "LOCAL_DEBITED",
          source_bank_hold_reference: holdReference,
          burn_tx_hash: holdReference,
        })
      } catch (error) {
        throw Object.assign(error instanceof Error ? error : new Error(String(error)), { stage: "LOCAL_DEBIT" })
      }
    }

    const expectedDestinationTokenMinor = quoteFixedFx(row.source_currency, row.destination_currency, sourceTokenMinor)
    const expectedDestinationBankMinor = row.destination_bank_account_id
      ? bankMinorFromTransportMinor(row.destination_currency, expectedDestinationTokenMinor)
      : expectedDestinationTokenMinor
    if (expectedDestinationBankMinor !== BigInt(row.destination_amount_minor)) {
      throw Object.assign(new Error("Stored destination amount does not match the fixed FX contract quote"), { stage: "FX_QUOTE" })
    }

    if (row.source_bank_account_id && !row.source_token_mint_tx_hash) {
      try {
        const hash = await mintTransportFromBank(
          row.source_currency,
          row.source_address as Address,
          BigInt(row.source_amount_minor),
          `${ref}:source-bank-onramp`
        )
        sourceTokenMinted = true
        row = await save(supabase, row.id, { source_token_mint_tx_hash: hash })
      } catch (error) {
        throw Object.assign(error instanceof Error ? error : new Error(String(error)), { stage: "SOURCE_TOKEN_MINT" })
      }
    }

    if (!row.fx_tx_hash) {
      row = await save(supabase, row.id, { status: "USDC_PENDING" })
      try {
        const converted = await executeFixedFx({
          sourceCurrency: row.source_currency,
          destinationCurrency: row.destination_currency,
          sourceHolder: row.source_address as Address,
          recipient: row.destination_address as Address,
          sourceTokenMinor,
          minDestinationTokenMinor: expectedDestinationTokenMinor,
          ref: `${ref}:fixed-fx`,
        })
        fxSettled = true
        row = await save(supabase, row.id, {
          status: "USDC_SETTLED",
          circle_transaction_id: converted.txHash,
          usdc_tx_hash: converted.txHash,
          fx_tx_hash: converted.txHash,
          fx_rate_version: converted.rateVersion.toString(),
        })
      } catch (error) {
        throw Object.assign(error instanceof Error ? error : new Error(String(error)), { stage: "FIXED_FX" })
      }
    }

    if (row.destination_bank_account_id && !row.destination_token_burn_tx_hash) {
      try {
        const hash = await burnTransportToBank(
          row.destination_currency,
          row.destination_address as Address,
          expectedDestinationTokenMinor,
          `${ref}:destination-bank-offramp`
        )
        row = await save(supabase, row.id, { destination_token_burn_tx_hash: hash })
      } catch (error) {
        throw Object.assign(error instanceof Error ? error : new Error(String(error)), { stage: "DESTINATION_TOKEN_BURN" })
      }
    }

    if (row.destination_bank_account_id && !row.mint_tx_hash) {
      try {
        const creditReference = `${ref}:bank-credit`
        const { error } = await supabase.rpc("sancus_bank_post_credit", {
          p_account_id: row.destination_bank_account_id,
          p_amount_minor: String(row.destination_amount_minor),
          p_entry_type: "INTERNAL_TRANSFER",
          p_source_type: "INTERNAL_TRANSFER",
          p_source_id: row.id,
          p_idempotency_key: creditReference,
        })
        if (error) throw new Error(error.message)
        row = await save(supabase, row.id, { status: "LOCAL_CREDITED", mint_tx_hash: creditReference })
      } catch (error) {
        throw Object.assign(error instanceof Error ? error : new Error(String(error)), { stage: "LOCAL_CREDIT" })
      }
    }

    return save(supabase, row.id, { status: "COMPLETED", failed_stage: null, failure_reason: null })
  } catch (error) {
    const stage = typeof error === "object" && error && "stage" in error ? String(error.stage) : "SETTLEMENT"
    const message = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500)
    // Before the FX conversion, unwind both the temporary token and bank debit. Once FX has
    // settled, keep the destination token available so a retry can finish redemption/credit.
    if (!fxSettled && sourceTokenMinted && row.source_bank_account_id) {
      try {
        await burnTransportToBank(
          row.source_currency,
          row.source_address as Address,
          sourceTokenMinor,
          `${ref}:failed-source-cleanup`
        )
      } catch {
        /* best-effort cleanup; the transfer remains failed below */
      }
    }
    if (!fxSettled && row.source_bank_account_id && holdReference) {
      try {
        if (bankCaptured) {
          await supabase.rpc("sancus_bank_post_credit", {
            p_account_id: row.source_bank_account_id,
            p_amount_minor: String(row.source_amount_minor),
            p_entry_type: "INTERNAL_TRANSFER_REVERSAL",
            p_source_type: "INTERNAL_TRANSFER",
            p_source_id: row.id,
            p_idempotency_key: `${ref}:bank-reversal`,
          })
        } else {
          await supabase.rpc("sancus_bank_release_hold", { p_reference: holdReference })
        }
      } catch {
        /* best-effort; still mark FAILED below */
      }
    }
    try {
      return await save(supabase, row.id, {
        status: !fxSettled && bankCaptured ? "REVERSED" : "FAILED",
        failed_stage: stage,
        failure_reason: message,
      })
    } catch {
      return { ...row, status: !fxSettled && bankCaptured ? "REVERSED" : "FAILED", failed_stage: stage, failure_reason: message }
    }
  }
}
