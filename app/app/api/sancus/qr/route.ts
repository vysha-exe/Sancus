// Sancus QR, receive side: GET your own "scan to pay me" code.
//   GET ?amount=500&currency=THB&note=Dinner → { url, receiver, currency, amount }
//   Without an amount the code is reusable (the payer types the amount); with one it lasts a day.
import { NextResponse } from "next/server"
import { withAuth } from "@/lib/api/with-auth"
import { loadAccount } from "@/lib/sancus/accounts-server"
import { personName, qrCompanyFor } from "@/lib/sancus/qr-server"
import { SANCUS_QR_CURRENCIES, signSancusQr, type SancusQrCurrency } from "@/lib/sancus/sancus-qr"
import { workspaceCompany } from "@/lib/sancus/workspace-server"

export const GET = withAuth(async (req, { user, supabase }) => {
  const account = await loadAccount(supabase, user)
  if (account.type === "EMPLOYEE") {
    return NextResponse.json({ error: "Employees can pay by QR but don't receive here; payments to you go through your company." }, { status: 403 })
  }
  const sp = req.nextUrl.searchParams
  const currency = (sp.get("currency") ?? "USD").toUpperCase() as SancusQrCurrency
  if (!SANCUS_QR_CURRENCIES.includes(currency)) return NextResponse.json({ error: "Currency must be USD, THB, IDR or BRL" }, { status: 400 })
  const rawAmount = sp.get("amount")
  const amount = rawAmount ? Number(rawAmount) : undefined
  if (amount !== undefined && !(Number.isFinite(amount) && amount > 0 && amount <= 1_000_000_000)) {
    return NextResponse.json({ error: "Enter a positive amount" }, { status: 400 })
  }
  const note = sp.get("note")?.trim().slice(0, 80) || undefined

  const companyId = qrCompanyFor(account, await workspaceCompany(req, supabase, user.id))
  const companyName = companyId ? account.scopes.find((s) => s.companyId === companyId)?.companyName : undefined
  const name = companyName ?? personName(user)
  const token = signSancusQr({ u: user.id, c: companyId, cur: currency, amt: amount, note })
  return NextResponse.json({
    url: `${req.nextUrl.origin}/qr?pay=${encodeURIComponent(token)}`,
    receiver: { name, kind: companyId ? "business" : "personal" },
    currency,
    amount: amount ?? null,
    note: note ?? null,
  })
})
