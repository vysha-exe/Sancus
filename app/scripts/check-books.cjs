// Sancus: read-only check of both money books (testnet QA). Run from app/ (or anywhere):
//   node scripts/check-books.cjs [hours]     (default: last 3 hours)
// 1. Bank book: each branch's local operating account (sancus_bank_entries / sancus_bank_holds).
//    Internal transfers, QR collections and branch payout holds land here. Not in the Settings CSV.
// 2. USDC ledger: sancus_journals, what Settings → Download CSV exports (per user). Every journal
//    must have debits = credits.
// Uses SUPABASE_SECRET_KEY from .env.local; only reads.
const path = require("path").resolve(__dirname, "..")
const fs = require("fs")
const { createClient } = require(require.resolve("@supabase/supabase-js", { paths: [path] }))
const env = Object.fromEntries(fs.readFileSync(path + "/.env.local", "utf8").split("\n").filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]))
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })
const since = new Date(Date.now() - (Number(process.argv[2] || 3)) * 3600e3).toISOString()
;(async () => {
  const { data: cos } = await db.from("sancus_companies").select("id,name")
  const name = Object.fromEntries((cos || []).map(c => [c.id, c.name]))
  const t = s => s.slice(11, 19)
  console.log("== Bank book (sancus_bank_entries) — local-currency operating accounts, NOT in the CSV")
  const { data: be } = await db.from("sancus_bank_entries").select("*").gte("created_at", since).order("created_at")
  for (const e of be || []) console.log(t(e.created_at), name[e.company_id], e.direction, e.amount_minor, e.currency, "→ bal", e.balance_after_minor, e.entry_type, e.source_type || "")
  console.log("== Bank holds (sancus_bank_holds)")
  const { data: bh } = await db.from("sancus_bank_holds").select("*").gte("created_at", since).order("created_at")
  for (const h of bh || []) console.log(t(h.created_at), name[h.company_id], h.amount_minor, h.currency, h.status, h.source_type || "")
  console.log("== USDC ledger (sancus_journals) — what Settings → Download CSV exports, per user")
  const { data: js } = await db.from("sancus_journals").select("created_at,user_id,source_type,event,memo,sancus_ledger_entries(account,direction,amount_minor)").gte("created_at", since).order("created_at")
  for (const j of js || []) {
    const d = j.sancus_ledger_entries.filter(e => e.direction === "DEBIT").reduce((s, e) => s + BigInt(e.amount_minor), 0n)
    const c = j.sancus_ledger_entries.filter(e => e.direction === "CREDIT").reduce((s, e) => s + BigInt(e.amount_minor), 0n)
    console.log(t(j.created_at), j.source_type, j.event, j.memo || "", "debits", d, "credits", c, d === c ? "OK" : "UNBALANCED", "user", j.user_id.slice(0, 8))
  }
})()
