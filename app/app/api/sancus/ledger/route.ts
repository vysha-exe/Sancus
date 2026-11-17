// Sancus: ledger journals with their entries. `?format=csv` downloads a CSV.
import { NextResponse } from "next/server"
import { withAuth } from "@/lib/api/with-auth"
import { formatMinor, USDC_DECIMALS } from "@/lib/sancus/money"

type JournalRow = {
  id: string
  source_type: string
  source_id: string
  event: string
  memo: string | null
  created_at: string
  sancus_ledger_entries: { account: string; direction: "DEBIT" | "CREDIT"; amount_minor: number | string; currency: string }[]
}

export const GET = withAuth(async (req, { user, supabase }) => {
  const format = req.nextUrl.searchParams.get("format")
  const { data, error } = await supabase
    .from("sancus_journals")
    .select("id, source_type, source_id, event, memo, created_at, sancus_ledger_entries(account, direction, amount_minor, currency)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(format === "csv" ? 5000 : 200)

  if (error) {
    console.error("Failed to load ledger", error)
    return NextResponse.json({ error: "Could not load ledger" }, { status: 500 })
  }
  const journals = (data ?? []) as JournalRow[]

  if (format === "csv") {
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
    const lines = ["date,journal_id,source,source_id,event,memo,account,debit,credit,currency"]
    for (const j of journals) {
      for (const e of j.sancus_ledger_entries) {
        const amount = formatMinor(BigInt(e.amount_minor), USDC_DECIMALS)
        lines.push(
          [
            j.created_at,
            j.id,
            j.source_type,
            j.source_id,
            j.event,
            esc(j.memo ?? ""),
            e.account,
            e.direction === "DEBIT" ? amount : "",
            e.direction === "CREDIT" ? amount : "",
            e.currency,
          ].join(",")
        )
      }
    }
    return new NextResponse(lines.join("\n") + "\n", {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="sancus-ledger-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  }

  return NextResponse.json({
    journals: journals.map((j) => ({
      id: j.id,
      sourceType: j.source_type,
      sourceId: j.source_id,
      event: j.event,
      memo: j.memo,
      createdAt: j.created_at,
      entries: j.sancus_ledger_entries.map((e) => ({
        account: e.account,
        direction: e.direction,
        amountMinor: String(e.amount_minor),
        currency: e.currency,
      })),
    })),
  })
})
