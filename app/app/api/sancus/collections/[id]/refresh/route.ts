import { NextResponse } from "next/server"
import { withAuth } from "@/lib/api/with-auth"
import { refreshCollection, type CollectionRow } from "@/lib/sancus/collections"
import { toCollectionDto } from "@/lib/sancus/local-rails"

export const POST = withAuth(async (req, { user, supabase }) => {
  const id = req.nextUrl.pathname.split("/").at(-2)
  const { data } = await supabase.from("sancus_collections").select("*").eq("id", id).eq("user_id", user.id).maybeSingle()
  if (!data) return NextResponse.json({ error: "Collection not found" }, { status: 404 })
  try {
    const refreshed = await refreshCollection(supabase, data as CollectionRow)
    return NextResponse.json({ collection: toCollectionDto(refreshed) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not refresh collection" }, { status: 502 })
  }
})

