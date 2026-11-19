// Sancus invoices: mark one invoice PAID (sandbox: called when the user continues into the pay flow).
import { NextResponse } from "next/server"
import { withAuth } from "@/lib/api/with-auth"
import { toInvoiceDto, type InvoiceRow } from "@/lib/sancus/invoices"

export const POST = withAuth(async (req, { user, supabase }) => {
  const id = req.nextUrl.pathname.split("/").slice(-2, -1)[0]
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 })

  const { data: current, error: loadError } = await supabase.from("sancus_invoices").select("*").eq("id", id).eq("user_id", user.id).maybeSingle()
  if (loadError) {
    console.error("invoice pay load", loadError)
    return NextResponse.json({ error: "Could not load the invoice" }, { status: 500 })
  }
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const row = current as InvoiceRow
  if (row.status === "PAID") return NextResponse.json({ ok: true, invoice: toInvoiceDto(row) })
  if (row.amount_minor === null || !row.supplier_name) {
    return NextResponse.json({ error: "Confirm the supplier and amount before paying" }, { status: 400 })
  }

  const { data, error } = await supabase.from("sancus_invoices").update({ status: "PAID" }).eq("id", id).eq("user_id", user.id).select("*").maybeSingle()
  if (error || !data) {
    console.error("invoice pay", error)
    return NextResponse.json({ error: "Could not mark the invoice paid" }, { status: 500 })
  }
  return NextResponse.json({ ok: true, invoice: toInvoiceDto(data as InvoiceRow) })
})
