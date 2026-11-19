import { NextResponse } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { toSancusCardDto, type SancusCardRow } from "@/lib/sancus/cards"
import { demoFallbacksEnabled } from "@/lib/sancus/demo-fallback"
import { requirePermission } from "@/lib/sancus/accounts-server"
import { resolveEmployeeFundingAccount } from "@/lib/sancus/spend-funding"
import {
  isMarqetaConfigured,
  issueMarqetaCard,
  setMarqetaCardState,
  simulatedMarqetaCard,
  updateMarqetaCardLimit,
} from "@/lib/sancus/rails/marqeta"

const currencies = ["USD", "CAD", "BRL", "GBP", "EUR", "SEK", "CHF", "SGD", "HKD", "JPY", "AUD", "IDR", "THB"] as const
const zeroDecimalCurrencies = new Set(["JPY"])

const schema = z.object({
  employeeId: z.string().uuid(),
  companyId: z.string().uuid(),
  employeeName: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(120),
  country: z.string().trim().min(2).max(80),
  currency: z.enum(currencies),
  monthlyLimit: z.number().positive().max(250_000_000),
})

const updateSchema = z.object({
  id: z.string().uuid(),
  monthlyLimit: z.number().positive().max(250_000_000).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
}).refine((value) => value.monthlyLimit !== undefined || value.status !== undefined, {
  message: "A monthly limit or status is required",
})

export const GET = withAuth(async (_req, { user, supabase }) => {
  const { data, error } = await supabase
    .from("sancus_cards")
    .select("*")
    .eq("user_id", user.id)
    .neq("status", "TERMINATED")
    .order("created_at", { ascending: false })
  if (error) return NextResponse.json({ error: "Could not load cards" }, { status: 500 })
  return NextResponse.json({ cards: ((data ?? []) as SancusCardRow[]).map(toSancusCardDto) })
})

export const DELETE = withAuth(async (req, { user, supabase }) => {
  const denied = await requirePermission(supabase, user, "spending.manage")
  if (denied) return denied
  const id = req.nextUrl.searchParams.get("id")
  const parsedId = z.string().uuid().safeParse(id)
  if (!parsedId.success) {
    return NextResponse.json({ error: "A valid card ID is required" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("sancus_cards")
    .update({ status: "TERMINATED", provider_status: "TERMINATED" })
    .eq("id", parsedId.data)
    .eq("user_id", user.id)
    .neq("status", "TERMINATED")
    .select("id")
    .maybeSingle()

  if (error) return NextResponse.json({ error: "Could not delete card" }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Card not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
})

export const PATCH = withAuth(async (req, { user, supabase }) => {
  const denied = await requirePermission(supabase, user, "spending.manage")
  if (denied) return denied
  const parsed = await validateJsonBody(req, updateSchema)
  if (!parsed.ok) return parsed.response

  const { data: current, error: readError } = await supabase
    .from("sancus_cards")
    .select("*")
    .eq("id", parsed.data.id)
    .eq("user_id", user.id)
    .neq("status", "TERMINATED")
    .maybeSingle()
  if (readError) return NextResponse.json({ error: "Could not load card" }, { status: 500 })
  if (!current) return NextResponse.json({ error: "Card not found" }, { status: 404 })

  const { monthlyLimit, status } = parsed.data
  const scale = zeroDecimalCurrencies.has(current.currency) ? 1 : 100
  const live = !current.simulated && isMarqetaConfigured()
  if (live && monthlyLimit !== undefined) {
    try {
      await updateMarqetaCardLimit({
        velocityControlToken: current.velocity_control_token,
        userToken: current.provider_user_token,
        label: current.label,
        currency: current.currency,
        monthlyLimit,
      })
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update Marqeta limit" }, { status: 502 })
    }
  }
  if (live && status) {
    try {
      await setMarqetaCardState({ cardToken: current.provider_card_token, state: status })
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update Marqeta card status" }, { status: 502 })
    }
  }

  const update: Record<string, unknown> = {}
  if (monthlyLimit !== undefined) update.monthly_limit_minor = Math.round(monthlyLimit * scale)
  if (status) {
    update.status = status
    update.provider_status = status
  }
  const { data, error } = await supabase
    .from("sancus_cards")
    .update(update)
    .eq("id", parsed.data.id)
    .eq("user_id", user.id)
    .select("*")
    .single()
  if (error || !data) return NextResponse.json({ error: "Could not update card" }, { status: 500 })
  return NextResponse.json({ card: toSancusCardDto(data as SancusCardRow) })
})

export const POST = withAuth(async (req, { user, supabase }) => {
  const denied = await requirePermission(supabase, user, "spending.manage")
  if (denied) return denied
  const idempotencyKey = req.headers.get("idempotency-key")?.trim()
  if (!idempotencyKey || idempotencyKey.length > 100) {
    return NextResponse.json({ error: "Missing Idempotency-Key header" }, { status: 400 })
  }
  const { data: replay } = await supabase
    .from("sancus_cards")
    .select("*")
    .eq("user_id", user.id)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle()
  if (replay) return NextResponse.json({ card: toSancusCardDto(replay as SancusCardRow), replayed: true })

  const parsed = await validateJsonBody(req, schema)
  if (!parsed.ok) return parsed.response

  let funding
  try {
    funding = await resolveEmployeeFundingAccount(supabase, {
      employeeId: parsed.data.employeeId,
      companyId: parsed.data.companyId,
      currency: parsed.data.currency,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not resolve the funding account" }, { status: 400 })
  }

  const names = parsed.data.employeeName.trim().split(/\s+/)
  const firstName = names.shift() || "Sancus"
  const lastName = names.join(" ") || "Cardholder"
  try {
    const issued = isMarqetaConfigured() && !demoFallbacksEnabled()
      ? await issueMarqetaCard({
          firstName,
          lastName,
          label: parsed.data.label,
          currency: parsed.data.currency,
          monthlyLimit: parsed.data.monthlyLimit,
        })
      : simulatedMarqetaCard(idempotencyKey)
    const scale = zeroDecimalCurrencies.has(parsed.data.currency) ? 1 : 100
    const { data, error } = await supabase.from("sancus_cards").insert({
      user_id: user.id,
      company_id: funding.companyId,
      funding_account_id: funding.accountId,
      idempotency_key: idempotencyKey,
      employee_id: parsed.data.employeeId,
      employee_name: parsed.data.employeeName,
      label: parsed.data.label,
      country: parsed.data.country,
      currency: parsed.data.currency,
      monthly_limit_minor: Math.round(parsed.data.monthlyLimit * scale),
      provider: "MARQETA",
      provider_user_token: issued.userToken,
      provider_card_token: issued.cardToken,
      velocity_control_token: issued.velocityControlToken,
      last_four: issued.lastFour,
      provider_status: issued.status,
      status: issued.status === "ACTIVE" ? "ACTIVE" : "SUSPENDED",
      simulated: issued.simulated,
    }).select("*").single()
    if (error || !data) {
      return NextResponse.json({ error: "The card was issued, but Sancus could not save it" }, { status: 500 })
    }
    return NextResponse.json({ card: toSancusCardDto(data as SancusCardRow) }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Card issuance failed" }, { status: 502 })
  }
})
