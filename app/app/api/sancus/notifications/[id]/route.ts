// Sancus: mark one notification read / unresolved.
import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"

const patchSchema = z.object({
  read: z.boolean().optional(),
})

export const PATCH = withAuth(async (req: NextRequest, { user, supabase }) => {
  const id = req.nextUrl.pathname.split("/").pop()
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 })
  }
  const parsed = await validateJsonBody(req, patchSchema)
  if (!parsed.ok) return parsed.response

  const patch: Record<string, string | null> = {}
  if (parsed.data.read === true) patch.read_at = new Date().toISOString()
  if (parsed.data.read === false) patch.read_at = null
  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("sancus_notifications")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, read_at")
    .maybeSingle()

  if (error) {
    console.error("notification patch", error)
    return NextResponse.json({ error: "Could not update notification" }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ id: data.id, readAt: data.read_at })
})
