import { afterEach, describe, expect, it, vi } from "vitest"
import { extractInvoiceFields, mockExtractInvoice } from "@/lib/sancus/invoice-extract"

const originalKey = process.env.OPENAI_API_KEY

afterEach(() => {
  vi.unstubAllGlobals()
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY
  else process.env.OPENAI_API_KEY = originalKey
})

describe("invoice extraction", () => {
  it("keeps deterministic filename extraction for legacy callers", async () => {
    const invoice = await extractInvoiceFields({ fileName: "Aurora-3200-BRL.pdf" })
    expect(invoice).toEqual(mockExtractInvoice("Aurora-3200-BRL.pdf"))
  })

  it("sends actual image bytes to OpenAI and validates payment fields", async () => {
    process.env.OPENAI_API_KEY = "test-key"
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output: [{ content: [{ type: "output_text", text: JSON.stringify({
        supplierName: "Northstar Office Supplies Pte. Ltd.",
        invoiceNumber: "NOS-2026-1184",
        amount: 2654.15,
        currency: "USD",
        dueDate: "2026-12-02",
        rail: "WIRE",
        paymentDetails: { bankName: "DBS Bank", accountName: "Northstar Office Supplies Pte. Ltd.", accountNumber: "018-492771-3", swift: "DBSSSGSG" },
      }) }] }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }))
    vi.stubGlobal("fetch", fetchMock)

    const invoice = await extractInvoiceFields({ fileName: "invoice.png", mimeType: "image/png", fileBytes: new Uint8Array([1, 2, 3]) })

    expect(invoice.amount).toBe(2654.15)
    expect(invoice.paymentDetails.swift).toBe("DBSSSGSG")
    const request = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string) as { input: { content: { type: string; image_url?: string }[] }[] }
    expect(request.input[0]!.content[1]).toMatchObject({ type: "input_image", image_url: "data:image/png;base64,AQID" })
  })

  it("leaves absent model fields blank instead of inventing them", async () => {
    process.env.OPENAI_API_KEY = "test-key"
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output: [{ content: [{ type: "output_text", text: JSON.stringify({ supplierName: "Visible Supplier", paymentDetails: {} }) }] }],
    }), { status: 200, headers: { "Content-Type": "application/json" } })))

    const invoice = await extractInvoiceFields({ fileName: "invoice.png", mimeType: "image/png", fileBytes: new Uint8Array([1]) })
    expect(invoice).toMatchObject({ supplierName: "Visible Supplier", invoiceNumber: null, amount: null, currency: null, dueDate: null, rail: null })
  })
})
