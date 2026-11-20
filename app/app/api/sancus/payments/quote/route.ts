// Sancus: quote a USD ACH payout (mock). USDC → USD at 1:1 plus a flat ACH fee; the response
// also says what the spending policy would do and which settlement mode is active.
import { NextResponse } from "next/server"
import { validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { quoteInputSchema, serializeQuote, toRecipientDto } from "@/lib/sancus/ach"
import { prepareAch } from "@/lib/sancus/ach-api"
import { loadAccount } from "@/lib/sancus/accounts-server"
import { workspaceCompany } from "@/lib/sancus/workspace-server"

export const POST = withAuth(async (req, { user, supabase }) => {
  const parsed = await validateJsonBody(req, quoteInputSchema)
  if (!parsed.ok) return parsed.response
  const [account, companyId] = await Promise.all([loadAccount(supabase, user), workspaceCompany(req, supabase, user.id)])
  const prepared = await prepareAch(supabase, user.id, parsed.data, { account, companyId })
  if (!prepared.ok) return NextResponse.json(prepared.body, { status: prepared.status })
  return NextResponse.json({
    quote: serializeQuote(prepared.quote),
    recipient: toRecipientDto(prepared.recipient),
    policy: prepared.evaluation,
  })
})
