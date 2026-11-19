import { NextResponse } from "next/server"
import { withAuth } from "@/lib/api/with-auth"
import { requirePermission } from "@/lib/sancus/accounts-server"
import { strictRailConfigured } from "@/lib/sancus/local-sandboxes"
import { railBotConfigured } from "@/lib/sancus/mock-tokens"
import { isMarqetaSandboxConfigured } from "@/lib/sancus/rails/marqeta"
import { isPayZuSandboxConfigured } from "@/lib/sancus/rails/payzu"

const enabled = () => process.env.NODE_ENV !== "production" || process.env.SANCUS_ENABLE_DEV_ENDPOINTS === "true"

export const GET = withAuth(async (_req, { user, supabase }) => {
  if (!enabled()) return NextResponse.json({ error: "Dev payment tools are disabled" }, { status: 404 })
  const denied = await requirePermission(supabase, user, "spending.manage")
  if (denied) return denied
  return NextResponse.json({
    providers: [
      { id: "marqeta", label: "Marqeta cards", ready: isMarqetaSandboxConfigured(), detail: "Sandbox credentials and URL" },
      { id: "payzu", label: "PayZu Pix", ready: isPayZuSandboxConfigured(), detail: "Sandbox token and URL" },
      { id: "midtrans", label: "Midtrans QRIS", ready: strictRailConfigured("QRIS"), detail: "Sandbox server key" },
      { id: "omise", label: "Omise PromptPay", ready: strictRailConfigured("PROMPTPAY"), detail: "Test secret key" },
      { id: "arc", label: "Arc mint bot", ready: railBotConfigured(), detail: "Testnet minter key" },
    ],
  })
})
