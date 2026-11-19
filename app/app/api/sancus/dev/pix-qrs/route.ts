import { NextResponse } from "next/server"
import { withAuth } from "@/lib/api/with-auth"
import { requirePermission } from "@/lib/sancus/accounts-server"

const enabled = () => process.env.NODE_ENV !== "production" || process.env.SANCUS_ENABLE_DEV_ENDPOINTS === "true"

type StoredPixQr = {
  id: string
  payload: string
  label: string
  status: string
  amountBrlMinor: string
  createdAt: string
  source: "COLLECTION" | "DEV_COLLECTION"
}

export const GET = withAuth(async (_req, { user, supabase }) => {
  if (!enabled()) return NextResponse.json({ error: "Dev payment tools are disabled" }, { status: 404 })
  const denied = await requirePermission(supabase, user, "spending.manage")
  if (denied) return denied

  const [collectionsResult, devCollectionsResult] = await Promise.all([
    supabase
      .from("sancus_collections")
      .select("id, company_id, reference, status, qr_payload, amount_local_minor, created_at")
      .eq("user_id", user.id)
      .eq("rail", "PIX")
      .not("qr_payload", "is", null)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("sancus_rail_collections")
      .select("id, destination_label, provider_ref, status, qr_payload, amount_minor, created_at")
      .eq("user_id", user.id)
      .eq("rail", "PIX")
      .not("qr_payload", "is", null)
      .order("created_at", { ascending: false })
      .limit(50),
  ])

  if (collectionsResult.error || devCollectionsResult.error) {
    return NextResponse.json({
      error: "Could not load stored Pix QR codes",
      detail: collectionsResult.error?.message ?? devCollectionsResult.error?.message,
    }, { status: 500 })
  }

  const companyIds = [...new Set((collectionsResult.data ?? []).map((row) => row.company_id).filter(Boolean))] as string[]
  const { data: companies, error: companiesError } = companyIds.length
    ? await supabase.from("sancus_companies").select("id, name").in("id", companyIds)
    : { data: [], error: null }
  if (companiesError) return NextResponse.json({ error: "Could not identify Pix QR branches" }, { status: 500 })
  const companyNames = new Map((companies ?? []).map((company) => [company.id, company.name]))

  const qrs: StoredPixQr[] = [
    ...(collectionsResult.data ?? []).map((row) => ({
      id: `collection:${row.id}`,
      payload: String(row.qr_payload),
      label: companyNames.get(row.company_id) ?? row.reference ?? "Stored Pix QR",
      status: String(row.status),
      amountBrlMinor: String(row.amount_local_minor),
      createdAt: String(row.created_at),
      source: "COLLECTION" as const,
    })),
    ...(devCollectionsResult.data ?? []).map((row) => ({
      id: `dev:${row.id}`,
      payload: String(row.qr_payload),
      label: row.destination_label ?? row.provider_ref ?? "Dev Pix QR",
      status: String(row.status),
      amountBrlMinor: String(row.amount_minor),
      createdAt: String(row.created_at),
      source: "DEV_COLLECTION" as const,
    })),
  ]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .filter((qr, index, all) => all.findIndex((candidate) => candidate.payload === qr.payload) === index)

  return NextResponse.json({ qrs })
})
