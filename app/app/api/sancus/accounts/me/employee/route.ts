// Sancus: what an employee sees. Their branch, spending limits, virtual card and QR methods.
import { NextResponse } from "next/server"
import { createAdminContext, withAuth } from "@/lib/api/with-auth"
import { loadAccount } from "@/lib/sancus/accounts-server"
import { toEmployeeCardPurchaseDto, type EmployeeCardPurchaseRow } from "@/lib/sancus/employee-spending"
import { toPixPaymentDto } from "@/lib/sancus/local-rails"
import { toXenditPayoutDto, type XenditPayoutRow } from "@/lib/sancus/xendit-payouts"

export const GET = withAuth(async (_req, { user, supabase }) => {
  const account = await loadAccount(supabase, user)
  if (account.type !== "EMPLOYEE") return NextResponse.json({ error: "Employee login required" }, { status: 403 })
  const { supabase: admin } = await createAdminContext()
  const start = new Date()
  start.setUTCDate(1)
  start.setUTCHours(0, 0, 0, 0)
  const [{ data: memberships }, { data: methods }, { data: cards }, { data: cardPurchases }, { data: pixPayments }, { data: localPayments }] = await Promise.all([
    admin
      .from("sancus_memberships")
      .select("id, company_id, role, per_payment_limit_minor, daily_limit_minor")
      .eq("user_id", user.id)
      .eq("status", "ACTIVE"),
    admin
      .from("sancus_spending_methods")
      .select("id, company_id, method_type, provider, label, currency, monthly_limit_minor, status, created_at")
      .eq("employee_id", user.id)
      .neq("status", "REVOKED")
      .order("created_at", { ascending: true }),
    admin
      .from("sancus_cards")
      .select("id, company_id, label, currency, monthly_limit_minor, last_four, status, simulated, created_at")
      .eq("employee_id", user.id)
      .neq("status", "TERMINATED")
      .order("created_at", { ascending: true }),
    admin
      .from("sancus_card_purchases")
      .select("*")
      .eq("employee_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30),
    admin
      .from("sancus_pix_payments")
      .select("*")
      .eq("employee_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30),
    admin
      .from("sancus_xendit_payouts")
      .select("*")
      .eq("employee_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30),
  ])
  const activeCardPurchases = (cardPurchases ?? []).filter((purchase) =>
    ["HELD", "SETTLED"].includes(purchase.status) && new Date(purchase.created_at ?? purchase.authorized_at) >= start
  )
  const activePixPayments = (pixPayments ?? []).filter((payment) =>
    ["PENDING", "SETTLED"].includes(payment.status) && new Date(payment.created_at) >= start
  )
  const activeLocalPayments = (localPayments ?? []).filter((payment) =>
    ["PENDING", "COMPLIANCE_REVIEW", "SETTLED"].includes(payment.status) && new Date(payment.created_at) >= start
  )
  const scope = account.scopes[0] ?? null
  const m = memberships?.[0]
  return NextResponse.json({
    account: account.toJSON(),
    firstName: (user.user_metadata?.first_name as string | undefined) ?? user.email?.split("@")[0] ?? "there",
    company: scope ? { id: scope.companyId, name: scope.companyName, country: scope.country, role: scope.role } : null,
    limits: {
      perPaymentMinor: m?.per_payment_limit_minor != null ? String(m.per_payment_limit_minor) : null,
      dailyMinor: m?.daily_limit_minor != null ? String(m.daily_limit_minor) : null,
    },
    methods: [
      ...(cards ?? []).map((card) => ({
        id: card.id,
        companyId: card.company_id,
        type: "CARD" as const,
        provider: "MARQETA",
        label: card.label,
        currency: card.currency,
        monthlyLimitMinor: String(card.monthly_limit_minor),
        usedMinor: activeCardPurchases.filter((purchase) => purchase.card_id === card.id).reduce((sum, purchase) => sum + BigInt(purchase.amount_minor), 0n).toString(),
        status: card.status,
        simulated: Boolean(card.simulated),
        source: "CARD" as const,
        lastFour: card.last_four,
      })),
      ...(methods ?? []).map((x) => ({
      id: x.id,
      companyId: x.company_id,
      type: x.method_type,
      provider: x.provider,
      label: x.label,
      currency: x.currency,
      monthlyLimitMinor: String(x.monthly_limit_minor),
      usedMinor: (x.method_type === "PIX"
        ? activePixPayments.filter((payment) => payment.spending_method_id === x.id).reduce((sum, payment) => sum + BigInt(payment.amount_brl_minor), 0n)
        : x.method_type === "PROMPTPAY" || x.method_type === "QRIS"
          ? activeLocalPayments.filter((payment) => payment.spending_method_id === x.id).reduce((sum, payment) => sum + BigInt(payment.amount_minor), 0n)
          : activeCardPurchases.filter((purchase) => purchase.spending_method_id === x.id).reduce((sum, purchase) => sum + BigInt(purchase.amount_minor), 0n)
      ).toString(),
      status: x.status,
      source: "SPENDING_METHOD" as const,
      lastFour: null,
    })),
    ],
    cardPurchases: ((cardPurchases ?? []) as EmployeeCardPurchaseRow[]).map(toEmployeeCardPurchaseDto),
    pixPayments: (pixPayments ?? []).map(toPixPaymentDto),
    localPayments: ((localPayments ?? []) as XenditPayoutRow[]).map(toXenditPayoutDto),
  })
})
