export type ReceiveAccount = {
  companyId: string
  bankName: string
  accountName: string
  accountNumber: string
  accountType: string
  routingLabel: string
  routingValue: string
  currency: string
  balanceMinor: string
  postedMinor: string
  heldMinor: string
  provider: string
  simulated: boolean
}

type BankPreset = Pick<ReceiveAccount, "bankName" | "routingLabel" | "routingValue">

const BANK_BY_COUNTRY: Record<string, BankPreset> = {
  SG: { bankName: "DBS Bank", routingLabel: "Bank / branch code", routingValue: "7171-001" },
  ID: { bankName: "Bank Central Asia", routingLabel: "Bank code", routingValue: "014" },
  TH: { bankName: "Kasikornbank", routingLabel: "Bank code", routingValue: "004" },
  BR: { bankName: "Itaú Unibanco", routingLabel: "ISPB", routingValue: "60701190" },
  US: { bankName: "JPMorgan Chase", routingLabel: "Routing number", routingValue: "021000021" },
  GB: { bankName: "Barclays", routingLabel: "Sort code", routingValue: "20-00-00" },
  AU: { bankName: "Commonwealth Bank", routingLabel: "BSB", routingValue: "062-000" },
  MY: { bankName: "Maybank", routingLabel: "Bank code", routingValue: "MBBEMYKL" },
  PH: { bankName: "BDO Unibank", routingLabel: "SWIFT / BIC", routingValue: "BNORPHMM" },
  VN: { bankName: "Vietcombank", routingLabel: "SWIFT / BIC", routingValue: "BFTVVNVX" },
  HK: { bankName: "HSBC Hong Kong", routingLabel: "Clearing code", routingValue: "004" },
  JP: { bankName: "MUFG Bank", routingLabel: "Bank / branch code", routingValue: "0005-001" },
  KR: { bankName: "KB Kookmin Bank", routingLabel: "Bank code", routingValue: "004" },
  TW: { bankName: "CTBC Bank", routingLabel: "Bank code", routingValue: "822" },
  CN: { bankName: "Bank of China", routingLabel: "CNAPS code", routingValue: "104100000004" },
  IN: { bankName: "HDFC Bank", routingLabel: "IFSC", routingValue: "HDFC0000001" },
}

function deterministicAccountNumber(companyId: string) {
  const translated = companyId.replaceAll("-", "").toLowerCase().replace(/[a-f]/g, (letter) => String(letter.charCodeAt(0) - 96))
  return translated.replace(/\D/g, "").slice(0, 12).padEnd(12, "0")
}

/** Visible fallback while the receive-account migration is being applied. */
export function sandboxReceiveAccount(company: { id: string; name: string; country: string; currency: string }): ReceiveAccount {
  const preset = BANK_BY_COUNTRY[company.country] ?? {
    bankName: "Local operating bank",
    routingLabel: "SWIFT / BIC",
    routingValue: "SANCUS00",
  }
  return {
    companyId: company.id,
    bankName: preset.bankName,
    accountName: company.name,
    accountNumber: deterministicAccountNumber(company.id),
    accountType: "Operating account",
    routingLabel: preset.routingLabel,
    routingValue: preset.routingValue,
    currency: company.currency,
    balanceMinor: "0",
    postedMinor: "0",
    heldMinor: "0",
    provider: "Sancus sandbox",
    simulated: true,
  }
}
