// Sancus: US bank recipients for ACH off-ramp payouts.
//   POST → validate (ABA checksum, account format, optional address) and save; same account twice
//          returns the existing recipient. Full account numbers are never stored.
//   GET  → your saved recipients
import { NextResponse } from "next/server"
import { validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { normaliseRecipient, recipientInputSchema, toRecipientDto, validateRecipient, type AchRecipientRow } from "@/lib/sancus/ach"

export const GET = withAuth(async (_req, { user, supabase }) => {
  const { data, error } = await supabase
    .from("sancus_ach_recipients")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
  if (error) return NextResponse.json({ error: "Could not load recipients" }, { status: 500 })
  return NextResponse.json({ recipients: ((data ?? []) as AchRecipientRow[]).map(toRecipientDto) })
})

export const POST = withAuth(async (req, { user, supabase }) => {
  const parsed = await validateJsonBody(req, recipientInputSchema)
  if (!parsed.ok) return parsed.response
  const issues = validateRecipient(parsed.data)
  if (issues.length) return NextResponse.json({ valid: false, error: "Invalid US bank details", issues }, { status: 400 })

  const r = normaliseRecipient(parsed.data)
  const { data: existing } = await supabase
    .from("sancus_ach_recipients")
    .select("*")
    .eq("user_id", user.id)
    .eq("fingerprint", r.fingerprint)
    .maybeSingle()
  if (existing) return NextResponse.json({ valid: true, existing: true, recipient: toRecipientDto(existing as AchRecipientRow) })

  const { data, error } = await supabase
    .from("sancus_ach_recipients")
    .insert({
      user_id: user.id,
      name: r.name,
      routing_number: r.routingNumber,
      bank_name: r.bankName,
      account_last4: r.accountLast4,
      account_type: r.accountType,
      owner_type: r.ownerType,
      fingerprint: r.fingerprint,
      address: r.address,
    })
    .select("*")
    .single()
  if (error || !data) {
    console.error("Failed to save ACH recipient", error)
    return NextResponse.json({ error: "Could not save the recipient" }, { status: 500 })
  }
  return NextResponse.json({ valid: true, existing: false, recipient: toRecipientDto(data as AchRecipientRow) }, { status: 201 })
})
