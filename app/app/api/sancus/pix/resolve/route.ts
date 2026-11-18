import { NextResponse } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { useDemoFallback } from "@/lib/sancus/demo-fallback"
import { resolvePixQr, simulatedPixQr } from "@/lib/sancus/rails/payzu"

export const POST = withAuth(async (req) => {
  const parsed = await validateJsonBody(req, z.object({ qrPayload: z.string().min(20).max(10_000) }))
  if (!parsed.ok) return parsed.response
  try {
    const result = useDemoFallback("PAYZU_SANDBOX_TOKEN")
      ? simulatedPixQr(parsed.data.qrPayload)
      : await resolvePixQr(parsed.data.qrPayload)
    return NextResponse.json({
      recipientName: result.name || "Pix recipient",
      recipientDocument: result.document || null,
      amount: result.amount ?? null,
      amountEditable: result.amountEditable ?? false,
      qrCodeType: result.qrCodeType || null,
      expiresIn: result.expiresIn ?? null,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not read Pix QR" }, { status: 502 })
  }
})

