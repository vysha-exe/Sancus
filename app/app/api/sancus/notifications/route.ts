// Sancus: list notifications + mark all read.
import { NextResponse, type NextRequest } from "next/server"
import { withAuth } from "@/lib/api/with-auth"
import {
  bodyFromRow,
  categoryFromType,
  linkFromRow,
  priorityFromType,
  titleFromRow,
  type NotificationDto,
  type NtfCategory,
  type NtfPriority,
} from "@/lib/sancus/notifications"

type Row = {
  id: string
  user_id: string
  type: string
  payload: Record<string, unknown> | null
  read_at: string | null
  created_at: string
  company_id?: string | null
  category?: string | null
  priority?: string | null
  title?: string | null
  body?: string | null
  link?: string | null
  resolved_at?: string | null
}

function toDto(row: Row): NotificationDto {
  const payload = (row.payload ?? {}) as Record<string, unknown>
  const category = (row.category as NtfCategory) || categoryFromType(row.type)
  const priority = (row.priority as NtfPriority) || priorityFromType(row.type, payload)
  return {
    id: row.id,
    type: row.type,
    category,
    priority,
    title: row.title || titleFromRow(row.type, payload),
    body: row.body || bodyFromRow(row.type, payload),
    link: row.link ?? linkFromRow(row.type, payload),
    readAt: row.read_at,
    resolvedAt: row.resolved_at ?? null,
    createdAt: row.created_at,
    companyId: row.company_id ?? null,
  }
}

export const GET = withAuth(async (req: NextRequest, { user, supabase }) => {
  const filter = req.nextUrl.searchParams.get("filter") // all | action | alert | unread
  const { data, error } = await supabase
    .from("sancus_notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(80)

  if (error) {
    console.error("notifications list", error)
    return NextResponse.json({ error: "Could not load notifications" }, { status: 500 })
  }

  let items = ((data ?? []) as Row[]).map(toDto)
  if (filter === "unread") items = items.filter((n) => !n.readAt)
  if (filter === "action") items = items.filter((n) => n.priority === "action" && !n.resolvedAt)
  if (filter === "alert") items = items.filter((n) => n.priority === "alert")

  const unread = ((data ?? []) as Row[]).filter((r) => !r.read_at).length
  const needsYou = items.filter((n) => n.priority === "action" && !n.resolvedAt && !n.readAt).length

  return NextResponse.json({ notifications: items, unread, needsYou })
})

export const POST = withAuth(async (req: NextRequest, { user, supabase }) => {
  const body = await req.json().catch(() => ({}))
  if (body?.action !== "read_all") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  }
  const { error } = await supabase
    .from("sancus_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null)
  if (error) {
    console.error("notifications read_all", error)
    return NextResponse.json({ error: "Could not mark notifications read" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
})
