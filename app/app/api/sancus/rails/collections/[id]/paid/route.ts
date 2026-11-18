// Sancus: "customer scanned it". Sandbox-only shortcut that marks a charge paid
// (Omise test mode: mark_as_paid; simulated Pix: immediate), then mints.
// Midtrans QRIS is paid from its own simulator page instead.
import { NextResponse } from "next/server"
import { withAuth } from "@/lib/api/with-auth"
import { idFromPath } from "@/lib/sancus/company-api"
import { markSandboxPaid } from "@/lib/sancus/local-sandboxes"
import { refreshCollection, toApi, type CollectionRow } from "@/lib/sancus/rail-collections"

export const POST = withAuth(async (req, { supabase }) => {
  const id = idFromPath(req.nextUrl.pathname, "collections")
  if (!id) return NextResponse.json({ error: "Invalid collection id" }, { status: 400 })
  const { data } = await supabase.from("sancus_rail_collections").select("*").eq("id", id).maybeSingle()
  let row = data as CollectionRow | null
  if (!row) return NextResponse.json({ error: "Collection not found" }, { status: 404 })

  if (row.status === "PENDING") {
    if (row.provider === "simulated") {
      const { data: upd } = await supabase
        .from("sancus_rail_collections")
        .update({ status: "PAID" })
        .eq("id", id)
        .eq("status", "PENDING")
        .select()
        .maybeSingle()
      row = (upd as CollectionRow | null) ?? row
    } else if (row.provider === "omise") {
      try {
        await markSandboxPaid(row.provider, row.provider_ref)
      } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "mark_as_paid failed" }, { status: 502 })
      }
    } else {
      return NextResponse.json(
        { error: "Pay this one from the sandbox simulator", simulatorUrl: row.simulator_url, qrImageUrl: row.qr_image_url },
        { status: 409 }
      )
    }
  }
  const updated = await refreshCollection(supabase, row)
  return NextResponse.json({ collection: toApi(updated) })
})
