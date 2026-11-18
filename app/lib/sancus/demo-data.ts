/** Café Paulista Ltda demo model — numbers match docs/wireframes/README.md */

export const workspace = {
  name: "Café Paulista Ltda",
  country: "Brazil",
  homeCurrency: "BRL",
  balanceCurrency: "USD",
  actor: { firstName: "Admin", role: "Owner", initial: "A" },
  sandbox: true,
} as const

export const balance = {
  availableUsd: 6390.34,
  availableLabel: "$6,390.34",
  heldUsd: 398.86,
  heldLabel: "$398.86",
  pendingOutUsd: 2000,
  pendingOutLabel: "$2,000.00",
  pendingOutWho: "Northwind",
  meta: "$398.86 held for cards · $2,000.00 on its way to Northwind · backed 1:1 by USDC",
} as const

export const monthStats = {
  label: "November",
  moneyIn: "+$10,000.00",
  moneyOut: "−$3,210.80",
  fees: "$0.80",
  held: "$398.86",
} as const

export type Status = "Settled" | "Pending" | "Held" | "Failed"

export type Payment = {
  id: string
  who: string
  amount: string
  amountIn?: boolean
  meta: string
  rail: string
  status: Status
  simulated?: boolean
  href?: string
  /** Ledger columns for live rows (Activity table: when, by, they got, fee). */
  ledger?: { when: string; by: string; theyGot: string; fee: string; rail?: string }
}

export const approvals = [
  {
    id: "ana-grafica",
    who: "Ana → Gráfica Aurora",
    amount: "$592.05",
    amountUsd: 592.05,
    reason: "Over her $500 limit",
    detail: "Ana asked to pay Gráfica Aurora R$ 3.200,00 for print work.",
  },
  {
    id: "rafael-torrefacao",
    who: "Rafael → Torrefação Lisboa",
    amount: "$1,988.00",
    amountUsd: 1988,
    reason: "First payment to someone new",
    detail: "Rafael asked to pay Torrefação Lisboa € 1.840,00 for green coffee.",
  },
  {
    id: "agent-crop",
    who: "Payments agent → Crop imagery",
    amount: "$40.00",
    amountUsd: 40,
    reason: "Over its $50 weekly budget",
    detail: "The payments agent wants $40.00 for crop imagery via x402.",
  },
] as const

export const approvalsTotalLabel = "$2,620.05"

export const latestPayments: Payment[] = [
  {
    id: "padaria",
    who: "Padaria Bela Vista · Ana's Pix QR",
    amount: "−$10.00",
    meta: "R$ 54,12 · Today, 10:02",
    rail: "Pix",
    status: "Settled",
    simulated: true,
    href: "/activity",
  },
  {
    id: "juliana",
    who: "Juliana Costa",
    amount: "−$100.80",
    meta: "R$ 541,23 · Today, 9:41",
    rail: "Pix",
    status: "Settled",
    simulated: true,
    href: "/pay/done",
  },
  {
    id: "papelaria",
    who: "Papelaria Central · Ana's card 4021",
    amount: "−$100.00",
    meta: "Today, 9:12",
    rail: "Card",
    status: "Settled",
    simulated: true,
    href: "/spending",
  },
  {
    id: "northwind",
    who: "Northwind Supply Co.",
    amount: "−$2,000.00",
    meta: "Arrives Wednesday",
    rail: "ACH",
    status: "Pending",
    simulated: true,
    href: "/activity",
  },
  {
    id: "lumen",
    who: "Lumen Labs",
    amount: "−$1,000.00",
    meta: "Friday · ref 7c3e…a91f",
    rail: "USDC",
    status: "Settled",
    href: "/activity",
  },
]

export const ledger: Payment[] = [
  ...latestPayments,
  {
    id: "mercado",
    who: "Mercado Azul",
    amount: "+$10,000.00",
    amountIn: true,
    meta: "Friday",
    rail: "USDC",
    status: "Settled",
    href: "/receive",
  },
  {
    id: "pedro",
    who: "Pedro Alves",
    amount: "−$250.00",
    meta: "Last week",
    rail: "Pix",
    status: "Failed",
    simulated: true,
    href: "/activity",
  },
]

export const teamSpending = [
  { who: "Ana · card 4021", used: "R$ 541 of R$ 2.700", pct: 20 },
  { who: "Ana · Pix QR, Brazil", used: "R$ 54 of R$ 800", pct: 7 },
  { who: "Arya · QRIS, Indonesia", used: "Rp 0 of Rp 3.200.000", pct: 0 },
] as const

export const bills = [
  {
    who: "Torrefação Lisboa",
    amount: "€ 1.840,00",
    rail: "SEPA",
    meta: "Due Dec 5",
    status: "Approval" as const,
  },
  {
    who: "Café Oaxaca SA de CV",
    amount: "MX$ 18,500.00",
    rail: "SPEI",
    meta: "Due Dec 12",
    status: "Due" as const,
  },
] as const

export const agents = {
  budgetUsed: 12.4,
  budgetMax: 50,
  budgetLabel: "$12.40 of $50.00",
  earned: "+$1.20",
  resets: "Budget resets Monday",
} as const

export type Person = {
  id: string
  name: string
  initials: string
  role: string
  country: string
  method: string
  limit: string
  status?: string
}

export const people: Person[] = [
  {
    id: "maya",
    name: "Business admin",
    initials: "A",
    role: "Owner",
    country: "Brazil",
    method: "—",
    limit: "—",
  },
  {
    id: "rafael",
    name: "Rafael Lima",
    initials: "RL",
    role: "Finance",
    country: "Brazil",
    method: "Card 7310",
    limit: "R$ 5.000",
    status: "Frozen",
  },
  {
    id: "ana",
    name: "Ana Souza",
    initials: "AS",
    role: "Employee",
    country: "Brazil",
    method: "Card 4021 · Pix QR",
    limit: "R$ 2.700 / R$ 800",
  },
  {
    id: "arya",
    name: "Arya Putra",
    initials: "AP",
    role: "Employee",
    country: "Indonesia",
    method: "QRIS",
    limit: "Rp 3.200.000",
  },
  {
    id: "nida",
    name: "Nida Srisai",
    initials: "NS",
    role: "Employee",
    country: "Thailand",
    method: "PromptPay",
    limit: "฿ 15,000",
  },
  {
    id: "joao",
    name: "João Pereira",
    initials: "JP",
    role: "Viewer",
    country: "Brazil",
    method: "—",
    limit: "—",
    status: "Invited",
  },
]

export type Recipient = {
  id: string
  name: string
  initials: string
  kind: string
  detail: string
  rail: string
  country: string
  methods: { rail: string; detail: string; tag: string }[]
  history: string
  /**
   * Set for recipients the backend can actually pay (Singapore PayNow / FAST).
   * The Pay flow then uses live quotes and creates a real payout
   * (POST /api/sancus/payouts). Recipients without it stay demo-only.
   */
  payout?: {
    proxyType: "MOBILE" | "UEN" | "BANK"
    proxyValue: string
    bankCode?: string
    currency: "SGD"
  }
}

export const recipients: Recipient[] = [
  {
    id: "lim-trading",
    name: "Lim Trading Pte Ltd",
    initials: "LT",
    kind: "Supplier",
    detail: "Supplier · Singapore · PayNow UEN 201912345K",
    rail: "PayNow",
    country: "Singapore",
    methods: [{ rail: "PayNow", detail: "UEN 201912345K", tag: "Default" }],
    history: "Live: paid through the Sancus backend",
    payout: { proxyType: "UEN", proxyValue: "201912345K", currency: "SGD" },
  },
  {
    id: "tan-logistics",
    name: "Tan Logistics",
    initials: "TL",
    kind: "Contractor",
    detail: "Contractor · Singapore · PayNow mobile •••• 4567",
    rail: "PayNow",
    country: "Singapore",
    methods: [{ rail: "PayNow", detail: "mobile •••• 4567", tag: "Default" }],
    history: "Live: paid through the Sancus backend",
    payout: { proxyType: "MOBILE", proxyValue: "+6591234567", currency: "SGD" },
  },
  {
    id: "juliana",
    name: "Juliana Costa",
    initials: "JC",
    kind: "Contractor",
    detail: "Contractor · Brazil · Pix key ju•••@gmail.com",
    rail: "Pix",
    country: "São Paulo, Brazil",
    methods: [
      { rail: "Pix", detail: "ju•••@gmail.com", tag: "Default" },
      { rail: "Wire", detail: "bank account ••• 2290", tag: "Backup" },
    ],
    history: "Last paid $100.80 · Today",
  },
  {
    id: "northwind",
    name: "Northwind Supply Co.",
    initials: "NS",
    kind: "Supplier",
    detail: "Supplier · United States · account ••• 8812",
    rail: "ACH",
    country: "United States",
    methods: [{ rail: "ACH", detail: "account ••• 8812", tag: "Default" }],
    history: "$2,000.00 on its way",
  },
  {
    id: "lumen",
    name: "Lumen Labs",
    initials: "LL",
    kind: "Supplier",
    detail: "Supplier · USDC address 0x91…2be4",
    rail: "USDC",
    country: "United States",
    methods: [{ rail: "USDC", detail: "0x91…2be4", tag: "Default" }],
    history: "Last paid $1,000.00 · Friday",
  },
  {
    id: "torrefacao",
    name: "Torrefação Lisboa",
    initials: "TL",
    kind: "Roaster",
    detail: "Roaster · Portugal · IBAN PT50 ••• 7731",
    rail: "SEPA",
    country: "Portugal",
    methods: [{ rail: "SEPA", detail: "IBAN PT50 ••• 7731", tag: "Default" }],
    history: "No payments yet",
  },
  {
    id: "oaxaca",
    name: "Café Oaxaca SA de CV",
    initials: "CO",
    kind: "Grower",
    detail: "Grower · Mexico · CLABE ••• 0453",
    rail: "SPEI",
    country: "Mexico",
    methods: [{ rail: "SPEI", detail: "CLABE ••• 0453", tag: "Default" }],
    history: "No payments yet",
  },
  {
    id: "ana-souza",
    name: "Ana Souza",
    initials: "AS",
    kind: "Team",
    detail: "Team · Employee · card ••• 4412",
    rail: "Card",
    country: "Brazil",
    methods: [{ rail: "Card", detail: "Sancus card ••• 4412", tag: "Default" }],
    history: "Last paid $240.00 · Monday",
  },
  {
    id: "rafael-lima",
    name: "Rafael Lima",
    initials: "RL",
    kind: "Team",
    detail: "Team · Finance · Pix key rafael•••@sancus.app",
    rail: "Pix",
    country: "Brazil",
    methods: [{ rail: "Pix", detail: "rafael•••@sancus.app", tag: "Default" }],
    history: "Last paid $1,200.00 · Friday",
  },
]

/** Juliana Pix quote used across Pay Amount / Review / Done */
export const julianaQuote = {
  recipientId: "juliana",
  usd: 100,
  feeUsd: 0.8,
  totalUsd: 100.8,
  brl: 541.23,
  brlLabel: "R$ 541,23",
  rate: 5.4123,
  rateLabel: "1 USD = 5.4123 BRL",
  feeLabel: "$0.80",
  totalLabel: "$100.80",
  usdLabel: "$100.00",
  rail: "Pix",
  arrival: "Seconds",
} as const

export const rails = [
  { id: "USDC", usedFor: "Businesses with a USDC account", speed: "Seconds", fee: "$0.00", status: "Live on testnet", simulated: false, on: true },
  { id: "ACH", usedFor: "US bank accounts", speed: "1–2 days", fee: "$0.00", status: "Simulated", simulated: true, on: true },
  { id: "Wire", usedFor: "Bank accounts anywhere", speed: "Same or next day", fee: "$3.50", status: "Simulated", simulated: true, on: true },
  { id: "Pix", usedFor: "Brazil, bank or QR", speed: "Seconds", fee: "$0.80", status: "Simulated", simulated: true, on: true },
  { id: "SEPA", usedFor: "Euro bank accounts", speed: "Same day", fee: "$0.80", status: "Simulated", simulated: true, on: true },
  { id: "SPEI", usedFor: "Mexico", speed: "Minutes", fee: "$0.80", status: "Simulated", simulated: true, on: true },
  { id: "QRIS", usedFor: "Receive from Indonesia", speed: "Seconds", fee: "$0.50", status: "Collection sandbox", simulated: true, on: true },
  { id: "PromptPay", usedFor: "Receive from Thailand", speed: "Seconds", fee: "$0.50", status: "Collection sandbox", simulated: true, on: true },
  { id: "Card", usedFor: "Team cards", speed: "Instant hold", fee: "$0.00", status: "Simulated", simulated: true, on: true },
] as const

export function getPerson(id: string): Person | undefined {
  return people.find((p) => p.id === id)
}

export function getRecipient(id: string): Recipient | undefined {
  return recipients.find((r) => r.id === id)
}
