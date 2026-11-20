// Browser-safe NFC helpers (no Node crypto).

export const NFC_RECORD_TYPE = "application/vnd.sancus.nfc.cardpay"

function decodeBytes(data?: DataView | ArrayBuffer | null): Uint8Array | null {
  if (!data) return null
  if (data instanceof DataView) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  return new Uint8Array(data)
}

/** Pull a signed token out of Web NFC records (MIME or Text, including raw NDEF Text lang prefix). */
export function tokenFromNdefRecords(
  records: Array<{ recordType?: string; mediaType?: string; data?: DataView | ArrayBuffer }>
): string | null {
  for (const r of records) {
    const bytes = decodeBytes(r.data ?? null)
    if (!bytes?.length) continue

    const asUtf8 = new TextDecoder().decode(bytes).trim()
    const candidates = [asUtf8]

    // Native NDEF Text payload: status(1) + lang + body
    if (bytes.length > 3) {
      const langLen = bytes[0] & 0x3f
      if (langLen > 0 && langLen < 32 && 1 + langLen < bytes.length) {
        candidates.push(new TextDecoder().decode(bytes.slice(1 + langLen)).trim())
      }
    }

    for (const text of candidates) {
      if (!text) continue
      const cleaned = text.replace(/^sancus-nfc:/i, "").trim()
      if (cleaned.includes(".") && cleaned.split(".").length === 2) return cleaned
      try {
        const asJson = JSON.parse(cleaned) as { token?: string }
        if (asJson.token?.includes(".")) return asJson.token.trim()
      } catch {
        /* not json */
      }
    }
  }
  return null
}

export function nfcDeepLink(token: string): string {
  return `sancusnfc://host?d=${encodeURIComponent(token)}`
}

export function webNfcAvailable(): boolean {
  return typeof window !== "undefined" && "NDEFReader" in window
}

export type NdefReaderLike = {
  scan: (opts?: { signal?: AbortSignal }) => Promise<void>
  write: (message: { records: Array<{ recordType: string; mediaType?: string; data: string }> }) => Promise<void>
  onreading: ((event: { message: { records: Array<{ recordType?: string; mediaType?: string; data?: DataView }> } }) => void) | null
  onreadingerror: ((event: Event) => void) | null
}

export function createNdefReader(): NdefReaderLike | null {
  if (!webNfcAvailable()) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Ctor = (window as any).NDEFReader
  return new Ctor() as NdefReaderLike
}
