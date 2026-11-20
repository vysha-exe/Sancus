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
import { amountToMinor, INVOICE_CURRENCIES, INVOICE_RAILS, toInvoiceDto, type InvoiceRow } from "@/lib/sancus/invoices"

const MAX_BYTES = 10 * 1024 * 1024
const BUCKET = "invoices"

const paymentDetailsSchema = z.object({
  bankName: z.string().trim().max(120).nullable().optional(),
  accountName: z.string().trim().max(160).nullable().optional(),
  accountNumber: z.string().trim().max(100).nullable().optional(),
  routingNumber: z.string().trim().max(20).nullable().optional(),
  accountType: z.enum(["CHECKING", "SAVINGS"]).nullable().optional(),
  swift: z.string().trim().max(34).nullable().optional(),
})
const manualSchema = z.object({
  supplierName: z.string().trim().min(1).max(120),
  invoiceNumber: z.string().trim().min(1).max(60),
  amount: z.number().positive().max(1_000_000_000),
  currency: z.enum(INVOICE_CURRENCIES),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rail: z.enum(INVOICE_RAILS),
  paymentDetails: paymentDetailsSchema.optional(),
})

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
  let manual: z.infer<typeof manualSchema> | null = null

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
    const parsed = await validateJsonBody(req, manualSchema)
    if (!parsed.ok) return parsed.response
    manual = parsed.data
    fileName = `manual-${parsed.data.invoiceNumber}.json`.replace(/[^\w.\-]+/g, "_")
    mimeType = "application/json"
  }

  const id = randomUUID()
  let extracted
  let storagePath: string | null
  if (manual) {
    extracted = {
      supplierName: manual.supplierName,
      invoiceNumber: manual.invoiceNumber,
      amount: manual.amount,
      currency: manual.currency,
      dueDate: manual.dueDate,
      rail: manual.rail,
      paymentDetails: {
        bankName: manual.paymentDetails?.bankName || null,
        accountName: manual.paymentDetails?.accountName || null,
        accountNumber: manual.paymentDetails?.accountNumber || null,
        routingNumber: manual.paymentDetails?.routingNumber || null,
        accountType: manual.paymentDetails?.accountType || null,
        swift: manual.paymentDetails?.swift || null,
      },
    }
    storagePath = null
  } else {
    try {
      const bytes = new Uint8Array(await file!.arrayBuffer())
      ;[extracted, storagePath] = await Promise.all([
        extractInvoiceFields({ fileName, mimeType, fileBytes: bytes }),
        storeFile(user.id, id, file!),
      ])
    } catch (error) {
      console.error("invoice parsing failed", error instanceof Error ? error.message : error)
      return NextResponse.json({ error: "Could not read that invoice. Check the file and try again." }, { status: 502 })
    }
  }

  const { data, error } = await supabase.from("sancus_invoices").insert({
    id,
    user_id: user.id,
    file_name: fileName,
    storage_path: storagePath,
    supplier_name: extracted.supplierName,
    invoice_number: extracted.invoiceNumber,
    amount_minor: extracted.amount === null ? null : amountToMinor(extracted.amount, extracted.currency ?? "USD"),
    currency: extracted.currency,
    due_date: extracted.dueDate,
    rail: extracted.rail,
    status: extracted.supplierName && extracted.amount !== null ? "READY" : "DRAFT",
    extracted,
  }).select("*").single()
  if (error || !data) {
    console.error("invoice insert", error)
    return NextResponse.json({ error: "Could not save the invoice" }, { status: 500 })
  }
  return NextResponse.json({ invoice: toInvoiceDto(data as InvoiceRow) }, { status: 201 })
})
