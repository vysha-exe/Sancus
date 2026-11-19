// Sancus: countries offered for branches, with their default currency.
export type CountryOption = { code: string; name: string; currency: string; flag: string }

export const COUNTRIES: CountryOption[] = [
  { code: "ID", name: "Indonesia", currency: "IDR", flag: "🇮🇩" },
  { code: "TH", name: "Thailand", currency: "THB", flag: "🇹🇭" },
  { code: "MY", name: "Malaysia", currency: "MYR", flag: "🇲🇾" },
  { code: "PH", name: "Philippines", currency: "PHP", flag: "🇵🇭" },
  { code: "VN", name: "Vietnam", currency: "VND", flag: "🇻🇳" },
  { code: "HK", name: "Hong Kong", currency: "HKD", flag: "🇭🇰" },
  { code: "JP", name: "Japan", currency: "JPY", flag: "🇯🇵" },
  { code: "KR", name: "South Korea", currency: "KRW", flag: "🇰🇷" },
  { code: "TW", name: "Taiwan", currency: "TWD", flag: "🇹🇼" },
  { code: "CN", name: "China", currency: "CNY", flag: "🇨🇳" },
  { code: "IN", name: "India", currency: "INR", flag: "🇮🇳" },
  { code: "AU", name: "Australia", currency: "AUD", flag: "🇦🇺" },
  { code: "US", name: "United States", currency: "USD", flag: "🇺🇸" },
  { code: "GB", name: "United Kingdom", currency: "GBP", flag: "🇬🇧" },
  { code: "BR", name: "Brazil", currency: "BRL", flag: "🇧🇷" },
]

export function countryByCode(code: string): CountryOption | undefined {
  return COUNTRIES.find((c) => c.code === code.toUpperCase())
}
