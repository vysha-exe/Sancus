export function fundingTokenMinor(currency: string, paymentMinor: bigint): bigint {
  // Card/Pix ledgers use two-decimal local minor units. fUSDC uses six decimals.
  return currency === "USD" ? paymentMinor * 10_000n : paymentMinor
}
