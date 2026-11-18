// Sancus invoices: pull supplier / amount / currency / due date out of an upload.
// MVP reads the file *name* only: a deterministic mock always works, and when an LLM key is
// set (ANTHROPIC_API_KEY, else OPENAI_API_KEY) a short call refines it. Any LLM failure falls
// back to the mock so uploads never block.
import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import { INVOICE_CURRENCIES, INVOICE_RAILS } from "@/lib/sancus/invoices"

export type ExtractedInvoice = {
  supplierName: string
  invoiceNumber: string
  /** Decimal amount in `currency`. */
  amount: number
  currency: string
  /** YYYY-MM-DD */
  dueDate: string
  rail: string
}

const ANTHROPIC_MODEL = process.env.ANTHROPIC_INVOICE_MODEL?.trim() || "claude-opus-5-5"
const OPENAI_MODEL = process.env.OPENAI_INVOICE_MODEL?.trim() || "gpt-4o-mini"
const LLM_TIMEOUT_MS = 8000

const RAIL_BY_CURRENCY: Record<string, string> = { USD: "ACH", EUR: "SEPA", BRL: "PIX", IDR: "WIRE", THB: "WIRE" }
const GENERIC_NAME = /^(invoice|inv|scan|scanned|document|doc|img|image|photo|file|upload|uploaded|untitled|download|screenshot)\d*$/i

function addDays(days: number) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function hash(text: string) {
  let h = 0
  for (const ch of text) h = (h * 31 + ch.codePointAt(0)!) >>> 0
  return h
}

/** Deterministic extraction from a file name like `Gráfica-Aurora-3200-BRL.pdf`. */
export function mockExtractInvoice(fileName: string): ExtractedInvoice {
  const base = fileName.replace(/\.[a-z0-9]{2,5}$/i, "").trim()
  const tokens = base.split(/[\s_\-]+/).filter(Boolean)
  let currency: string | null = null
  let amount: number | null = null
  let invoiceNumber: string | null = null
  const words: string[] = []

  for (const token of tokens) {
    const upper = token.toUpperCase()
    if (!currency && (INVOICE_CURRENCIES as readonly string[]).includes(upper)) currency = upper
    else if (amount === null && /^[1-9]\d*([.,]\d{1,2})?$/.test(token) && !/^(19|20)\d\d$/.test(token)) amount = Number(token.replace(",", "."))
    else if (!invoiceNumber && /^(inv|invoice|ord|order|nf)[#:]?\d{2,}$/i.test(token)) invoiceNumber = upper
    else if (!GENERIC_NAME.test(token) && !/^\d+$/.test(token)) words.push(token)
  }

  const supplierName = words.length ? words.join(" ") : "Gráfica Aurora"
  const seed = hash(base || "invoice")
  const resolvedCurrency = currency ?? (amount === null && !words.length ? "BRL" : "USD")
  return {
    supplierName,
    invoiceNumber: invoiceNumber ?? `INV-${1000 + (seed % 9000)}`,
    amount: amount ?? (words.length ? 1000 + (seed % 40) * 50 : 3200),
    currency: resolvedCurrency,
    dueDate: addDays(14),
    rail: RAIL_BY_CURRENCY[resolvedCurrency] ?? "WIRE",
  }
}

const llmSchema = z.object({
  supplierName: z.string().trim().min(1).max(120).nullish(),
  invoiceNumber: z.string().trim().min(1).max(60).nullish(),
  amount: z.number().positive().max(1_000_000_000).nullish(),
  currency: z.enum(INVOICE_CURRENCIES).nullish(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  rail: z.enum(INVOICE_RAILS).nullish(),
})

const SYSTEM = [
  "You extract supplier invoice fields. You only see the uploaded file's NAME, not its contents.",
  "Reply with one JSON object and nothing else: {\"supplierName\", \"invoiceNumber\", \"amount\", \"currency\", \"dueDate\", \"rail\"}.",
  `currency is one of ${INVOICE_CURRENCIES.join(", ")}; rail is one of ${INVOICE_RAILS.join(", ")}; dueDate is YYYY-MM-DD; amount is a plain number.`,
  "Use only what the file name implies. Use null for any field you cannot infer. Never invent figures.",
].join("\n")

function parseLlmJson(text: string) {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  const parsed = llmSchema.safeParse(JSON.parse(match[0]))
  return parsed.success ? parsed.data : null
}

async function askAnthropic(userText: string): Promise<string> {
  const client = new Anthropic({ timeout: LLM_TIMEOUT_MS, maxRetries: 0 })
  const message = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 300,
    system: SYSTEM,
    messages: [{ role: "user", content: userText }],
  })
  return message.content.map((block) => (block.type === "text" ? block.text : "")).join("")
}

async function askOpenAi(userText: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY!.trim()}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_tokens: 300,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: userText }],
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}`)
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return body.choices?.[0]?.message?.content ?? ""
}

export async function extractInvoiceFields({ fileName, mimeType }: { fileName: string; mimeType?: string }): Promise<ExtractedInvoice> {
  const mock = mockExtractInvoice(fileName)
  const anthropic = Boolean(process.env.ANTHROPIC_API_KEY?.trim())
  const openai = Boolean(process.env.OPENAI_API_KEY?.trim())
  if (!anthropic && !openai) return mock

  try {
    const userText = `File name: ${fileName}${mimeType ? `\nMIME type: ${mimeType}` : ""}\nToday is ${new Date().toISOString().slice(0, 10)}.`
    const text = anthropic ? await askAnthropic(userText) : await askOpenAi(userText)
    const llm = parseLlmJson(text)
    if (!llm) return mock
    const currency = llm.currency ?? mock.currency
    return {
      supplierName: llm.supplierName ?? mock.supplierName,
      invoiceNumber: llm.invoiceNumber ?? mock.invoiceNumber,
      amount: llm.amount ?? mock.amount,
      currency,
      dueDate: llm.dueDate && !Number.isNaN(Date.parse(llm.dueDate)) ? llm.dueDate : mock.dueDate,
      rail: llm.rail ?? RAIL_BY_CURRENCY[currency] ?? mock.rail,
    }
  } catch (error) {
    console.error("invoice extract: LLM failed, using filename mock", error instanceof Error ? error.message : error)
    return mock
  }
}
