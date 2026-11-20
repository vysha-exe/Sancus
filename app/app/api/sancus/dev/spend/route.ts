// Provider-backed sandbox probe for issued employee cards and Pix access.
import { randomUUID, timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { createAdminContext, withAuth } from "@/lib/api/with-auth"
import { requirePermission } from "@/lib/sancus/accounts-server"
import { createDevRun, finishDevRun, sanitizeProviderPayload, step, workflow, type DevRunStep } from "@/lib/sancus/dev-runs"
import { toEmployeeCardPurchaseDto, type EmployeeCardPurchaseRow } from "@/lib/sancus/employee-spending"
import { toPixPaymentDto, type PixPaymentDbRow } from "@/lib/sancus/local-rails"
import { getMarqetaCardDetails, isMarqetaSandboxConfigured, simulateMarqetaAuthorization, simulateMarqetaClearing } from "@/lib/sancus/rails/marqeta"
import { isPayZuSandboxConfigured, mapPayZuStatus, payPix, resolvePixQr } from "@/lib/sancus/rails/payzu"
import { loadFundingAccount, releaseSpendFunds, reserveSpendFunds, settleSpendFunds } from "@/lib/sancus/spend-funding"

const schema = z.object({
  kind: z.enum(["CARD", "PIX"]), source: z.enum(["CARD", "SPENDING_METHOD"]), methodId: z.string().uuid(),
  merchantName: z.string().trim().min(1).max(120), amount: z.number().positive().max(250_000_000),
  qrPayload: z.string().trim().max(8_000).optional(),
  cardCredentials: z.object({
    pan: z.string().transform((value) => value.replace(/\D/g, "")).pipe(z.string().min(12).max(19)),
    expiration: z.string().transform((value) => value.replace(/\D/g, "")).pipe(z.string().length(4)),
    cvv: z.string().transform((value) => value.replace(/\D/g, "")).pipe(z.string().min(3).max(4)),
  }).optional(),
})
const enabled = () => process.env.NODE_ENV !== "production" || process.env.SANCUS_ENABLE_DEV_ENDPOINTS === "true"
const monthStart = () => { const value = new Date(); value.setUTCDate(1); value.setUTCHours(0, 0, 0, 0); return value.toISOString() }
const secureMatch = (entered: string, expected: string) => {
  const left = Buffer.from(entered)
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}

export const POST = withAuth(async (req, { user, supabase }) => {
  if (!enabled()) return NextResponse.json({ error: "Dev payment tools are disabled" }, { status: 404 })
  const denied = await requirePermission(supabase, user, "spending.manage")
  if (denied) return denied
  const parsed = await validateJsonBody(req, schema)
  if (!parsed.ok) return parsed.response
  const { kind, source, methodId, merchantName, amount, qrPayload, cardCredentials } = parsed.data
  if (kind === "CARD" && source !== "CARD") return NextResponse.json({ error: "A Marqeta sandbox card is required; generic card access cannot be authorized by the provider" }, { status: 400 })
  if (kind === "CARD" && !cardCredentials) return NextResponse.json({ error: "Enter the sandbox card number, expiry, and CVV" }, { status: 400 })
  if (kind === "PIX" && (source !== "SPENDING_METHOD" || !qrPayload)) return NextResponse.json({ error: "Pix tests require issued Pix access and a merchant Pix QR payload" }, { status: 400 })

  const { supabase: admin } = await createAdminContext()
  const table = source === "CARD" ? "sancus_cards" : "sancus_spending_methods"
  const { data: method, error: methodError } = await admin.from(table).select("*").eq("id", methodId).eq("user_id", user.id).maybeSingle()
  if (methodError) return NextResponse.json({ error: "Could not load the spending method" }, { status: 500 })
  if (!method) return NextResponse.json({ error: "Spending method not found for this business" }, { status: 404 })
  if (method.status !== "ACTIVE") return NextResponse.json({ error: `Declined: method is ${String(method.status).toLowerCase()}` }, { status: 403 })
  if (source === "SPENDING_METHOD" && method.method_type !== kind) return NextResponse.json({ error: `Selected method is ${method.method_type}, not ${kind}` }, { status: 400 })
  if (!method.company_id || !method.funding_account_id) {
    return NextResponse.json({ error: "This spending method predates bank funding. Reissue it from the employee's company." }, { status: 409 })
  }
  const fundingAccount = await loadFundingAccount(admin, { companyId: method.company_id, accountId: method.funding_account_id })

  const currency = String(method.currency)
  let effectiveAmount = amount
  let amountMinor = BigInt(Math.round(effectiveAmount * (currency === "JPY" ? 1 : 100)))
  const steps: DevRunStep[] = [step("issuedAccess", true, `${method.employee_name}'s active ${kind === "CARD" ? "card" : "Pix access"} resolved`)]
  const provider = kind === "CARD" ? "MARQETA" : "PAYZU"
  let run: { id: string } | null = null
  try {
    const createdRun = await createDevRun(admin, { userId: user.id, runType: `${kind}_SPEND`, provider, steps })
    run = createdRun
    const runId = createdRun.id
    if (kind === "CARD") {
      if (method.simulated || !method.provider_card_token) throw new Error("This is a demo card. Issue a real Marqeta sandbox card before running a provider test.")
      if (!isMarqetaSandboxConfigured()) throw new Error("Marqeta sandbox credentials or sandbox URL are not configured")
      const details = await getMarqetaCardDetails(method.provider_card_token)
      const panMatches = secureMatch(cardCredentials!.pan, details.pan.replace(/\D/g, ""))
      const expirationMatches = secureMatch(cardCredentials!.expiration, details.expiration.replace(/\D/g, ""))
      const cvvMatches = secureMatch(cardCredentials!.cvv, details.cvv.replace(/\D/g, ""))
      if (!panMatches || !expirationMatches || !cvvMatches) {
        steps.push(step("credentials", false, "Entered credentials did not match the selected sandbox card"))
        throw new Error("Declined: the card number, expiry, or CVV does not match the selected sandbox card")
      }
      steps.push(step("credentials", true, "Sandbox card credentials matched the selected issued card"))
      const { data: purchases, error: purchasesError } = await admin.from("sancus_card_purchases").select("amount_minor").eq("card_id", methodId).in("status", ["HELD", "SETTLED"]).gte("created_at", monthStart())
      if (purchasesError) throw new Error("Could not validate the card limit")
      const used = (purchases ?? []).reduce((sum, row) => sum + BigInt(row.amount_minor), 0n)
      if (used + amountMinor > BigInt(method.monthly_limit_minor)) throw new Error("Declined: test purchase exceeds the card's monthly limit")
      steps.push(step("limits", true, `Monthly limit accepted ${amount} ${currency}`))
      const authorization = await simulateMarqetaAuthorization({ cardToken: method.provider_card_token, amount, merchantName })
      steps.push(step("authorization", authorization.approved, authorization.approved ? "Marqeta sandbox authorization approved" : `Marqeta declined with ${authorization.responseCode || authorization.state}`))
      const { data: purchase, error: insertError } = await admin.from("sancus_card_purchases").insert({
        user_id: user.id, employee_id: method.employee_id, employee_name: method.employee_name, card_id: method.id,
        company_id: method.company_id, funding_account_id: method.funding_account_id,
        merchant_name: merchantName, amount_minor: amountMinor.toString(), currency,
        status: authorization.approved ? "HELD" : "DECLINED", decline_reason: authorization.approved ? null : authorization.responseCode || authorization.state,
        provider: "MARQETA", provider_transaction_id: authorization.token || null, provider_status: authorization.state,
        provider_payload: sanitizeProviderPayload(authorization.raw), simulated: false,
      }).select("*").single()
      if (insertError || !purchase) throw new Error(insertError?.message || "Could not save the Marqeta authorization")
      if (!authorization.approved) {
        await finishDevRun(admin, runId, { status: "FAILED", steps, sourceRecordType: "CARD_PURCHASE", sourceRecordId: purchase.id, providerRef: authorization.token, error: "Provider declined the authorization" })
        return NextResponse.json({ purchase: toEmployeeCardPurchaseDto(purchase as EmployeeCardPurchaseRow), workflow: workflow(steps), error: "Marqeta declined the authorization" }, { status: 409 })
      }
      let holdHash: string
      try {
        holdHash = await reserveSpendFunds(admin, {
          accountId: fundingAccount.id, amountMinor, ref: `card:${purchase.id}`,
          sourceType: "CARD_PURCHASE", sourceId: purchase.id,
        })
      } catch (error) {
        const reason = error instanceof Error ? error.message : "The issuing company has insufficient local funds"
        const { data: declined } = await admin.from("sancus_card_purchases").update({
          status: "DECLINED", decline_reason: reason, funding_status: "UNFUNDED",
        }).eq("id", purchase.id).select("*").single()
        steps.push(step("funding", false, reason))
        await finishDevRun(admin, runId, { status: "FAILED", steps, sourceRecordType: "CARD_PURCHASE", sourceRecordId: purchase.id, providerRef: authorization.token, error: reason })
        return NextResponse.json({ purchase: toEmployeeCardPurchaseDto((declined ?? purchase) as EmployeeCardPurchaseRow), workflow: workflow(steps), error: reason }, { status: 409 })
      }
      await admin.from("sancus_card_purchases").update({
        funding_status: "HELD", funding_amount_minor: amountMinor.toString(), funding_hold_tx_hash: holdHash,
      }).eq("id", purchase.id)
      steps.push(step("funding", true, `${method.employee_name}'s ${currency} company balance reserved the authorization`))
      const clearing = await simulateMarqetaClearing({ authorizationToken: authorization.token, amount })
      const settled = clearing.approved || /cleared|completion/i.test(clearing.state)
      steps.push(step("settlement", settled, settled ? "Marqeta sandbox clearing completed" : `Clearing stopped at ${clearing.state}`))
      let releaseHash: string | null = null
      if (!settled) {
        releaseHash = await releaseSpendFunds(admin, { ref: `card:${purchase.id}` })
        steps.push(step("fundingRelease", true, `${currency} authorization hold released to the issuing company`))
      } else {
        await settleSpendFunds(admin, { ref: `card:${purchase.id}` })
      }
      const { data: updated } = await admin.from("sancus_card_purchases").update({
        status: settled ? "SETTLED" : "RELEASED", settled_at: settled ? new Date().toISOString() : null,
        funding_status: settled ? "SETTLED" : "RELEASED", funding_release_tx_hash: releaseHash,
        provider_status: clearing.state, provider_payload: sanitizeProviderPayload({ authorization: authorization.raw, clearing: clearing.raw }),
      }).eq("id", purchase.id).select("*").single()
      await finishDevRun(admin, runId, { status: settled ? "PASSED" : "FAILED", steps, sourceRecordType: "CARD_PURCHASE", sourceRecordId: purchase.id, providerRef: authorization.token, error: settled ? null : `Clearing is ${clearing.state}` })
      return NextResponse.json({ purchase: toEmployeeCardPurchaseDto((updated ?? purchase) as EmployeeCardPurchaseRow), workflow: workflow(steps), runId }, { status: settled ? 201 : 409 })
    }

    if (!isPayZuSandboxConfigured()) throw new Error("PayZu sandbox credentials or sandbox URL are not configured")
    const resolved = await resolvePixQr(qrPayload!)
    const amountEditable = resolved.amountEditable === true
    if (!amountEditable) {
      const fixedAmount = Number(resolved.amount)
      if (!Number.isFinite(fixedAmount) || fixedAmount <= 0) throw new Error("The merchant QR has a fixed amount that PayZu could not read")
      effectiveAmount = fixedAmount
      amountMinor = BigInt(Math.round(fixedAmount * 100))
    }
    steps.push(step("qrScan", true, `PayZu resolved the merchant QR${resolved.name ? ` to ${resolved.name}` : ""}${amountEditable ? "; payer enters the amount" : `; fixed at R$ ${effectiveAmount.toFixed(2)}`}`))
    const { data: payments, error: paymentsError } = await admin.from("sancus_pix_payments").select("amount_brl_minor").eq("spending_method_id", methodId).in("status", ["PENDING", "SETTLED"]).gte("created_at", monthStart())
    if (paymentsError) throw new Error("Could not validate the Pix limit")
    const used = (payments ?? []).reduce((sum, row) => sum + BigInt(row.amount_brl_minor), 0n)
    if (used + amountMinor > BigInt(method.monthly_limit_minor)) throw new Error("Declined: test payment exceeds the Pix monthly limit")
    steps.push(step("limits", true, `Monthly limit accepted R$ ${effectiveAmount.toFixed(2)}`))
    const reference = `dev-${randomUUID()}`
    const holdHash = await reserveSpendFunds(admin, {
      accountId: fundingAccount.id, amountMinor, ref: `pix:${reference}`,
      sourceType: "PIX_PAYMENT", sourceId: reference,
    })
    steps.push(step("funding", true, `${method.employee_name}'s BRL company balance reserved the Pix payment`))
    let payment
    try {
      payment = await payPix({ amountBrl: effectiveAmount, reference, qrPayload, description: `Sancus Dev: ${merchantName}` })
    } catch (error) {
      await releaseSpendFunds(admin, { ref: `pix:${reference}` })
      throw error
    }
    const status = mapPayZuStatus(payment.status)
    steps.push(step("provider", status !== "FAILED" && status !== "CANCELLED", `PayZu sandbox payment is ${status.toLowerCase()}`))
    const releasesImmediately = status === "FAILED" || status === "CANCELLED" || status === "EXPIRED"
    const releaseHash = releasesImmediately
      ? await releaseSpendFunds(admin, { ref: `pix:${reference}` })
      : null
    if (status === "SETTLED") await settleSpendFunds(admin, { ref: `pix:${reference}` })
    if (releaseHash) steps.push(step("fundingRelease", true, "BRL Pix hold released to the issuing company"))
    const { data, error } = await admin.from("sancus_pix_payments").insert({
      user_id: user.id, idempotency_key: reference, purpose: "EMPLOYEE_SPEND", spending_method_id: method.id,
      company_id: method.company_id, funding_account_id: method.funding_account_id,
      employee_id: method.employee_id, employee_name: method.employee_name, recipient_name: resolved.name || merchantName,
      pix_method: "QR", pix_key_masked: "QR payload", amount_brl_minor: amountMinor.toString(),
      provider_transaction_id: payment.id, provider_status: payment.status || "PENDING", status,
      end_to_end_id: payment.endToEndId ?? null, provider_payload: sanitizeProviderPayload({ resolved, payment }), simulated: false,
      settled_at: status === "SETTLED" ? payment.paidAt || new Date().toISOString() : null,
      funding_status: status === "SETTLED" ? "SETTLED" : releasesImmediately ? "RELEASED" : "HELD",
      funding_amount_minor: amountMinor.toString(), funding_hold_tx_hash: holdHash, funding_release_tx_hash: releaseHash,
    }).select("*").single()
    if (error || !data) {
      if (!releasesImmediately && status !== "SETTLED") {
        await releaseSpendFunds(admin, { ref: `pix:${reference}` })
      }
      throw new Error(error?.message || "Could not save the PayZu sandbox payment")
    }
    const terminal = status === "SETTLED" ? "PASSED" : status === "FAILED" || status === "CANCELLED" || status === "EXPIRED" ? "FAILED" : "WAITING"
    await finishDevRun(admin, runId, { status: terminal, steps, sourceRecordType: "PIX_PAYMENT", sourceRecordId: data.id, providerRef: payment.id, error: terminal === "FAILED" ? status : null })
    return NextResponse.json({ payment: toPixPaymentDto(data as PixPaymentDbRow), workflow: workflow(steps), runId }, { status: terminal === "PASSED" ? 201 : 202 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sandbox spend failed"
    steps.push(step("provider", false, message))
    if (run) await finishDevRun(admin, run.id, { status: "FAILED", steps, error: message })
    return NextResponse.json({ error: message, workflow: workflow(steps), runId: run?.id }, { status: 502 })
  }
})
