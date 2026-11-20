// Browser-safe: pulls the token out of a scanned Sancus pay link (see sancus-qr.ts).

/** The token inside a scanned Sancus link (or a bare token), else null. */
export function parseSancusQrUrl(text: string): string | null {
  const t = text.trim()
  try {
    const url = new URL(t)
    const pay = url.searchParams.get("pay")
    return url.pathname.replace(/\/$/, "") === "/qr" && pay ? pay : null
  } catch {
    return /^[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}$/.test(t) ? t : null
  }
}
