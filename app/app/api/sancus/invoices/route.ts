// Sancus invoices.
//   GET  → the signed-in user's invoices, newest first
//   POST → multipart (field "file") or JSON { fileName }. Stores the file (best effort) and an
//          invoice row, extracts supplier / amount / currency / due date, and returns it READY.
import { randomUUID } from "node:crypto"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { extractInvoiceFields } from "@/lib/sancus/invoice-extract"
import { amountToMinor, toInvoiceDto, type InvoiceRow } from "@/lib/sancus/invoices"

const MAX_BYTES = 10 * 1024 * 1024
const BUCKET = "invoices"

const jsonSchema = z.object({ fileName: z.string().trim().min(1).max(200), mimeType: z.string().max(100).optional() })

/** Best-effort binary upload with the service role. Returns the storage path, or null if skipped. */
async function storeFile(userId: string, invoiceId: string, file: File): Promise<string | null> {
  const url = (process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim())?.replace(/\/$/, "")
  const secret = process.env.SUPABASE_SECRET_KEY?.trim()
  if (!url || !secret) return null
  try {
    const admin = createAdminClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } })
    const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-120) || "invoice"
    const path = `${userId}/${invoiceId}/${safeName}`
    const { error } = await admin.storage.from(BUCKET).upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false })
    if (error) {
      console.error("invoice upload", error.message)
      return null
    }
    return path
  } catch (error) {
    console.error("invoice upload", error)
    return null
  }
}

export const GET = withAuth(async (_req, { user, supabase }) => {
  const { data, error } = await supabase.from("sancus_invoices").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100)
  if (error) {
    console.error("invoices list", error)
    return NextResponse.json({ error: "Could not load invoices" }, { status: 500 })
  }
  return NextResponse.json({ invoices: ((data ?? []) as InvoiceRow[]).map(toInvoiceDto) })
})

export const POST = withAuth(async (req, { user, supabase }) => {
  let fileName: string
  let mimeType: string | undefined
  let file: File | null = null

  if (req.headers.get("content-type")?.includes("multipart/form-data")) {
    let form: FormData
    try {
      form = await req.formData()
    } catch {
      return NextResponse.json({ error: "Invalid upload" }, { status: 400 })
    }
    const entry = form.get("file")
    if (!(entry instanceof File) || !entry.name) return NextResponse.json({ error: "Choose an invoice file" }, { status: 400 })
    if (entry.size > MAX_BYTES) return NextResponse.json({ error: "Invoices can be up to 10 MB" }, { status: 413 })
    file = entry
    fileName = entry.name.slice(0, 200)
    mimeType = entry.type || undefined
  } else {
    const parsed = await validateJsonBody(req, jsonSchema)
    if (!parsed.ok) return parsed.response
    fileName = parsed.data.fileName
    mimeType = parsed.data.mimeType
  }

  const id = randomUUID()
  const [extracted, storagePath] = await Promise.all([
    extractInvoiceFields({ fileName, mimeType }),
    file ? storeFile(user.id, id, file) : Promise.resolve(null),
  ])

  const { data, error } = await supabase.from("sancus_invoices").insert({
    id,
    user_id: user.id,
    file_name: fileName,
    storage_path: storagePath,
    supplier_name: extracted.supplierName,
    invoice_number: extracted.invoiceNumber,
    amount_minor: amountToMinor(extracted.amount, extracted.currency),
    currency: extracted.currency,
    due_date: extracted.dueDate,
    rail: extracted.rail,
    status: "READY",
    extracted,
  }).select("*").single()
  if (error || !data) {
    console.error("invoice insert", error)
    return NextResponse.json({ error: "Could not save the invoice" }, { status: 500 })
  }
  return NextResponse.json({ invoice: toInvoiceDto(data as InvoiceRow) }, { status: 201 })
})
