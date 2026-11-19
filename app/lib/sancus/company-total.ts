import type { CompanyNode } from "@/lib/sancus/companies"
import { FIXED_USD_RATES } from "@/lib/sancus/fixed-rates"

export type CompanyTreasuryPositions = {
  fUsdcMinor: string
  equities: { valueMinor: string }[]
  yield: { valueMinor: string }[]
}

export type CompanyTotal = {
  currency: string
  totalMinor: string
  bankMinor: string
  walletMinor: string
  positionsMinor: string
  bankAccounts: number
  wallets: number
  companies: number
}

export type CompanyNodeTotal = {
  currency: string
  totalMinor: string
  bankMinor: string
  walletMinor: string
}

const RATE_SCALE = 1_000_000n
const REPORTING_SCALE = 1_000_000n

function scaledRate(currency: string): bigint | null {
  const rate = FIXED_USD_RATES[currency as keyof typeof FIXED_USD_RATES]
  return rate === undefined ? null : BigInt(Math.round(rate * Number(RATE_SCALE)))
}

function roundedDivide(value: bigint, divisor: bigint): bigint {
  if (divisor === 0n) return 0n
  const sign = value < 0n ? -1n : 1n
  const absolute = value < 0n ? -value : value
  return sign * ((absolute + divisor / 2n) / divisor)
}

/** Converts local bank cents into 6-decimal units of the reporting currency. */
export function localBankMinorToReportingMinor(
  minor: string,
  sourceCurrency: string,
  reportingCurrency: string,
): bigint {
  if (sourceCurrency === reportingCurrency) return BigInt(minor) * 10_000n
  const sourceRate = scaledRate(sourceCurrency)
  const reportingRate = scaledRate(reportingCurrency)
  if (sourceRate === null || reportingRate === null) return 0n
  return roundedDivide(BigInt(minor) * reportingRate * REPORTING_SCALE, 100n * sourceRate)
}

/** Converts 6-decimal USD/USDC value into 6-decimal reporting-currency value. */
export function usdMinorToReportingMinor(minor: string | bigint, reportingCurrency: string): bigint {
  const reportingRate = scaledRate(reportingCurrency)
  if (reportingRate === null) return 0n
  return roundedDivide(BigInt(minor) * reportingRate, RATE_SCALE)
}

/** Combines one company's local bank balance and own wallet liquidity in its local currency. */
export function calculateCompanyNodeTotal(node: CompanyNode): CompanyNodeTotal {
  const bankMinor = node.bankBalance
    ? localBankMinorToReportingMinor(node.bankBalance.balanceMinor, node.bankBalance.currency, node.currency)
    : 0n
  const walletMinor = usdMinorToReportingMinor(node.ownMinor, node.currency)

  return {
    currency: node.currency,
    totalMinor: (bankMinor + walletMinor).toString(),
    bankMinor: bankMinor.toString(),
    walletMinor: walletMinor.toString(),
  }
}

function flatten(root: CompanyNode): CompanyNode[] {
  return [root, ...root.children.flatMap(flatten)]
}

/**
 * Company-wide capital without double-counting rolled-up wallet totals.
 * Every node contributes its own bank account and own wallets; Treasury
 * positions are parent-only and are added once.
 */
export function calculateCompanyTotal(
  root: CompanyNode,
  positions: CompanyTreasuryPositions | null = null,
): CompanyTotal {
  const reportingCurrency = root.currency
  const nodes = flatten(root)
  const bankMinor = nodes.reduce((total, node) => {
    const bank = node.bankBalance
    return total + (bank
      ? localBankMinorToReportingMinor(bank.balanceMinor, bank.currency, reportingCurrency)
      : 0n)
  }, 0n)
  const walletUsdMinor = nodes.reduce((total, node) => total + BigInt(node.ownMinor), 0n)
  const walletMinor = usdMinorToReportingMinor(walletUsdMinor, reportingCurrency)
  const positionsUsdMinor = positions
    ? BigInt(positions.fUsdcMinor)
      + positions.equities.reduce((total, item) => total + BigInt(item.valueMinor), 0n)
      + positions.yield.reduce((total, item) => total + BigInt(item.valueMinor), 0n)
    : 0n
  const positionsMinor = usdMinorToReportingMinor(positionsUsdMinor, reportingCurrency)

  return {
    currency: reportingCurrency,
    totalMinor: (bankMinor + walletMinor + positionsMinor).toString(),
    bankMinor: bankMinor.toString(),
    walletMinor: walletMinor.toString(),
    positionsMinor: positionsMinor.toString(),
    bankAccounts: nodes.filter((node) => Boolean(node.bankBalance)).length,
    wallets: nodes.reduce((total, node) => total + node.wallets.length, 0),
    companies: nodes.length,
  }
}
