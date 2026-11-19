import { NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/api/with-auth"
import { loadAccount } from "@/lib/sancus/accounts-server"
import { getMarqetaCardDetails } from "@/lib/sancus/rails/marqeta"

const secretHeaders = {
  "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
}

export const POST = withAuth(async (req, { user, supabase }) => {
  const origin = req.headers.get("origin")
  if (origin && origin !== req.nextUrl.origin) {
    return NextResponse.json({ error: "Cross-site card detail requests are not allowed" }, { status: 403, headers: secretHeaders })
  }
  const parsedId = z.string().uuid().safeParse(req.nextUrl.pathname.split("/").at(-2))
  if (!parsedId.success) return NextResponse.json({ error: "A valid card ID is required" }, { status: 400, headers: secretHeaders })

  const account = await loadAccount(supabase, user)
  const manager = account.can("spending.manage")
  const cardholder = account.can("card.view")
  if (!manager && !cardholder) {
    return NextResponse.json({ error: "Your account cannot view card details" }, { status: 403, headers: secretHeaders })
  }

  let query = supabase
    .from("sancus_cards")
    .select("provider_card_token, simulated, status")
    .eq("id", parsedId.data)
    .neq("status", "TERMINATED")
  query = manager ? query.eq("user_id", user.id) : query.eq("employee_id", user.id)
  const { data: card, error } = await query.maybeSingle()
  if (error) return NextResponse.json({ error: "Could not load the card" }, { status: 500, headers: secretHeaders })
  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404, headers: secretHeaders })
  if (card.simulated) {
    return NextResponse.json({ error: "This simulated card has no usable sandbox credentials" }, { status: 409, headers: secretHeaders })
  }

  try {
    const details = await getMarqetaCardDetails(card.provider_card_token)
    return NextResponse.json({ details }, { headers: secretHeaders })
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Could not retrieve card details"
    return NextResponse.json({ error: message }, { status: 502, headers: secretHeaders })
  }
})
