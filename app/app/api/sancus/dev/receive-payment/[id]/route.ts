import { NextResponse } from "next/server"
import { z } from "zod"
import { withAuth } from "@/lib/api/with-auth"
import { validateJsonBody } from "@/lib/api/validate"
import { finishDevRun, step, workflow, type DevRunStep } from "@/lib/sancus/dev-runs"
import { markSandboxPaid } from "@/lib/sancus/local-sandboxes"
import { refreshCollection, toApi, type CollectionRow } from "@/lib/sancus/rail-collections"

const schema = z.object({ action: z.enum(["REFRESH", "MARK_PAID"]).default("REFRESH"), runId: z.string().uuid().optional() })
const enabled = () => process.env.NODE_ENV !== "production" || process.env.SANCUS_ENABLE_DEV_ENDPOINTS === "true"

export const POST = withAuth(async (req, { user, supabase }) => {
  if (!enabled()) return NextResponse.json({ error: "Dev payment tools are disabled" }, { status: 404 })
  const id = req.nextUrl.pathname.split("/").pop()
  const validId = z.string().uuid().safeParse(id)
  if (!validId.success) return NextResponse.json({ error: "Invalid collection ID" }, { status: 400 })
  const parsed = await validateJsonBody(req, schema)
  if (!parsed.ok) return parsed.response
  const { data } = await supabase.from("sancus_rail_collections").select("*").eq("id", validId.data).eq("user_id", user.id).maybeSingle()
  if (!data) return NextResponse.json({ error: "Collection not found" }, { status: 404 })
  const steps: DevRunStep[] = []
  if (parsed.data.action === "MARK_PAID") {
    const marked = await markSandboxPaid(data.provider, data.provider_ref)
    if (!marked) return NextResponse.json({ error: "This provider must be completed in its own sandbox simulator; use Refresh afterward" }, { status: 409 })
    steps.push(step("providerSettlement", true, "Provider sandbox marked the charge paid"))
  }
  const collection = await refreshCollection(supabase, data as CollectionRow)
  steps.push(step("providerStatus", collection.status !== "FAILED" && collection.status !== "EXPIRED", `Collection is ${collection.status.toLowerCase()}`))
  if (collection.status === "MINTED") steps.push(step("cryptoMint", true, "Matching mock local token minted on Arc testnet"))
  else steps.push(step("cryptoMint", collection.status !== "FAILED", collection.error || "Waiting for provider settlement before Arc mint"))
  if (parsed.data.runId) {
    const status = collection.status === "MINTED" ? "PASSED" : collection.status === "FAILED" || collection.status === "EXPIRED" ? "FAILED" : "WAITING"
    await finishDevRun(supabase, parsed.data.runId, { status, steps, sourceRecordType: "RAIL_COLLECTION", sourceRecordId: collection.id, providerRef: collection.provider_ref, error: collection.error })
  }
  return NextResponse.json({ collection: toApi(collection), workflow: workflow(steps) })
})
