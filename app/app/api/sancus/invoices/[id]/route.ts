// Sancus invoices: read or confirm one invoice.
//   GET   → the invoice
//   PATCH → save confirmed fields (supplier, number, amount, currency, due date, rail)
import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { amountToMinor, INVOICE_CURRENCIES, INVOICE_RAILS, minorToAmount, toInvoiceDto, type InvoiceRow } from "@/lib/sancus/invoices"

const patchSchema = z.object({
  supplierName: z.string().trim().min(1).max(120).optional(),
  invoiceNumber: z.string().trim().max(60).nullable().optional(),
  amount: z.number().positive().max(1_000_000_000).optional(),
  currency: z.enum(INVOICE_CURRENCIES).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date").nullable().optional(),
  rail: z.enum(INVOICE_RAILS).optional(),
})

function invoiceId(req: NextRequest) {
  const id = req.nextUrl.pathname.split("/").pop()
  return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null
}

export const GET = withAuth(async (req, { user, supabase }) => {
  const id = invoiceId(req)
  if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 })
  const { data, error } = await supabase.from("sancus_invoices").select("*").eq("id", id).eq("user_id", user.id).maybeSingle()
  if (error) {
    console.error("invoice get", error)
    return NextResponse.json({ error: "Could not load the invoice" }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ invoice: toInvoiceDto(data as InvoiceRow) })
})

export const PATCH = withAuth(async (req, { user, supabase }) => {
  const id = invoiceId(req)
  if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 })
  const parsed = await validateJsonBody(req, patchSchema)
  if (!parsed.ok) return parsed.response
  const input = parsed.data

  const { data: current, error: loadError } = await supabase.from("sancus_invoices").select("*").eq("id", id).eq("user_id", user.id).maybeSingle()
  if (loadError) {
    console.error("invoice patch load", loadError)
    return NextResponse.json({ error: "Could not load the invoice" }, { status: 500 })
  }
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const row = current as InvoiceRow
  if (row.status === "PAID") return NextResponse.json({ error: "This invoice is already paid" }, { status: 409 })

  const currency = input.currency ?? row.currency ?? "USD"
  const patch: Record<string, unknown> = { status: "READY" }
  if (input.supplierName !== undefined) patch.supplier_name = input.supplierName
  if (input.invoiceNumber !== undefined) patch.invoice_number = input.invoiceNumber || null
  if (input.currency !== undefined) patch.currency = input.currency
  if (input.amount !== undefined) patch.amount_minor = amountToMinor(input.amount, currency)
  else if (input.currency !== undefined && row.amount_minor !== null && input.currency !== row.currency) {
    // Currency changed without a new amount: keep the same decimal value in the new currency.
    patch.amount_minor = amountToMinor(minorToAmount(row.amount_minor, row.currency ?? "USD"), currency)
  }
  if (input.dueDate !== undefined) patch.due_date = input.dueDate
  if (input.rail !== undefined) patch.rail = input.rail

  const { data, error } = await supabase.from("sancus_invoices").update(patch).eq("id", id).eq("user_id", user.id).select("*").maybeSingle()
  if (error) {
    console.error("invoice patch", error)
    return NextResponse.json({ error: "Could not update the invoice" }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ invoice: toInvoiceDto(data as InvoiceRow) })
})
