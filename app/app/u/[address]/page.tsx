"use client"

// Public "pay this person" page: what a personal "Show my QR" code opens when scanned.
// No sign-in; everything shown comes from the link itself (address, name, optional amount).

import { use, useState } from "react"

const ADDRESS = /^0x[0-9a-fA-F]{40}$/
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ""
}

export default function PersonalPayPage({
  params,
  searchParams,
}: {
  params: Promise<{ address: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { address: rawAddress } = use(params)
  const query = use(searchParams)
  const address = decodeURIComponent(rawAddress)
  const valid = ADDRESS.test(address)
  const name = first(query.name).trim().slice(0, 40) || "Sancus user"
  const amountNumber = Number.parseFloat(first(query.amount))
  const amount = Number.isFinite(amountNumber) && amountNumber > 0 && amountNumber < 1_000_000 ? amountNumber : 0
  const [copied, setCopied] = useState<string | null>(null)

  async function copy() {
    try {
      await navigator.clipboard.writeText(address)
      setCopied("Address copied")
    } catch {
      setCopied("Couldn't copy. Press and hold the address to copy it.")
    }
    window.setTimeout(() => setCopied(null), 2500)
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16, background: "#f1f3ef", color: "#12231f" }}>
      <section style={{ width: "min(100%, 520px)", display: "grid", gap: 24, padding: "32px 24px", border: "1px solid #ced7d1", borderRadius: 18, background: "white", boxShadow: "0 18px 60px rgba(20,45,38,.08)" }}>
        <div style={{ display: "grid", gap: 8 }}>
          <span style={{ fontFamily: "monospace", letterSpacing: ".14em", textTransform: "uppercase", color: "#267e70" }}>Sancus payment request</span>
          <h1 style={{ margin: 0, fontFamily: "serif", fontSize: 38 }}>{valid ? `Pay ${name}` : "Payment link"}</h1>
          {valid ? (
            <p style={{ margin: 0, color: "#63716d" }}>
              {amount ? "Send this amount in USDC on the Arc network." : "Send any amount in USDC on the Arc network."}
            </p>
          ) : null}
        </div>

        {!valid ? (
          <p role="alert" style={{ margin: 0, color: "#b54135" }}>
            This payment link isn&apos;t valid. Ask the person to share their QR again.
          </p>
        ) : (
          <>
            {amount ? (
              <div style={{ display: "grid", gap: 4, justifyItems: "center", padding: "16px 0", borderTop: "1px solid #e3e8e4", borderBottom: "1px solid #e3e8e4" }}>
                <span style={{ color: "#63716d" }}>Requested</span>
                <strong style={{ fontSize: 34 }}>{money.format(amount)}</strong>
                <span style={{ color: "#63716d" }}>USDC</span>
              </div>
            ) : null}

            <div style={{ display: "grid", gap: 10 }}>
              <span style={{ fontWeight: 700 }}>{name}&apos;s USDC address · Arc</span>
              <code style={{ padding: "12px 14px", borderRadius: 10, background: "#f1f3ef", overflowWrap: "anywhere", fontSize: 15 }}>{address}</code>
              <button type="button" onClick={copy} style={{ padding: "15px 20px", border: 0, borderRadius: 999, background: "#168777", color: "white", fontSize: 17, fontWeight: 700, cursor: "pointer" }}>
                Copy address
              </button>
              <span role="status" style={{ minHeight: 20, color: "#267e70", textAlign: "center" }}>
                {copied}
              </span>
            </div>

            <p style={{ margin: 0, color: "#63716d", fontSize: 14 }}>
              Paste the address into Sancus or any wallet that supports Arc. Only send USDC on Arc. Other coins or networks can be lost.
            </p>
            <a href="/pay" style={{ justifySelf: "center", color: "#168777", fontWeight: 700 }}>
              Have Sancus? Open it to pay
            </a>
          </>
        )}
      </section>
    </main>
  )
}
