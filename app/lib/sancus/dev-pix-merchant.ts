export type DevMerchantPixQr = {
  id: string
  payload: string
  label: string
  merchantName: string | null
  status: string
  qrCodeType: string | null
  amountEditable: boolean
  fixedAmountBrlMinor: string | null
  createdAt: string
}

// Built-in PayZu sandbox merchant used by the Dev spending flow. PayZu resolves
// this valid Pix EMV code to the same fixed test merchant and amount each time.
export const BUILT_IN_PIX_MERCHANT: DevMerchantPixQr = {
  id: "builtin-payzu-sandbox-merchant",
  payload: "00020101021126420014br.gov.bcb.pix0120merchant@sancus.test5204000053039865802BR5920SANCUS TEST MERCHANT6009SAO PAULO6304FE34",
  label: "PayZu sandbox merchant",
  merchantName: "Morgana Batista",
  status: "ACTIVE",
  qrCodeType: "DYNAMIC",
  amountEditable: false,
  fixedAmountBrlMinor: "13931",
  createdAt: "2026-11-18T00:00:00.000Z",
}

export function withBuiltInPixMerchant(qrs: DevMerchantPixQr[]): DevMerchantPixQr[] {
  return [BUILT_IN_PIX_MERCHANT, ...qrs.filter((qr) => qr.payload !== BUILT_IN_PIX_MERCHANT.payload)]
}
