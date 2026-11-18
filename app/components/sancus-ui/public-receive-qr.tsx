"use client"

import QRCode from "qrcode"
import { useEffect, useMemo, useState } from "react"
import type { CompanyNode } from "@/lib/sancus/companies"
import type { LocalRail } from "@/lib/sancus/local-sandboxes"
import { encodeReceiveCode, RECEIVE_RAILS } from "@/lib/sancus/receive-code"
import { useWorkspace } from "@/lib/sancus/use-workspace"

function flatten(nodes: CompanyNode[]): CompanyNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)])
}

export function PublicReceiveQr() {
  const workspace = useWorkspace()
  const [rail, setRail] = useState<LocalRail>("PIX")
  const [branchId, setBranchId] = useState("")
  const [qrUrl, setQrUrl] = useState("")
  const [copied, setCopied] = useState(false)
  const eligible = useMemo(
    () => flatten(workspace.tree).filter((node) => node.parentId !== null && node.currency === RECEIVE_RAILS[rail].currency),
    [rail, workspace.tree]
  )
  const branch = eligible.find((node) => node.id === branchId) ?? eligible[0] ?? null
  const payload = branch ? encodeReceiveCode({ rail, companyId: branch.id }) : ""

  useEffect(() => {
    let current = true
    if (!payload) return
    void QRCode.toDataURL(payload, { width: 240, margin: 1, errorCorrectionLevel: "M" }).then((url) => {
      if (current) setQrUrl(url)
    })
    return () => { current = false }
  }, [payload])

  async function copy() {
    if (!payload) return
    await navigator.clipboard.writeText(payload)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <section className="tile s12" aria-labelledby="public-receive-code">
      <div className="tile-head">
        <div>
          <h2 className="tile-title" id="public-receive-code">Branch receive QR</h2>
          <p className="body-s muted" style={{ margin: "4px 0 0" }}>
            Share this reusable code. The customer chooses how much to send after scanning it.
          </p>
        </div>
        <span className="sx-pill sx-pill--settled">No fixed amount</span>
      </div>

      <div className="grid" style={{ alignItems: "start", gap: 20 }}>
        <div className="s7" style={{ display: "grid", gap: 16 }}>
          <div className="filters" role="group" aria-label="Receive rail">
            {(Object.keys(RECEIVE_RAILS) as LocalRail[]).map((id) => (
              <button key={id} type="button" className="chip" aria-pressed={rail === id} onClick={() => { setRail(id); setBranchId("") }}>
                {RECEIVE_RAILS[id].label}
              </button>
            ))}
          </div>
          <label className="sx-field">
            <span className="sx-label">Business branch receiving this</span>
            <select className="sx-field__input" value={branch?.id ?? ""} onChange={(event) => setBranchId(event.target.value)} disabled={!eligible.length}>
              {!eligible.length ? <option value="">No {RECEIVE_RAILS[rail].currency} branch available</option> : null}
              {eligible.map((node) => <option key={node.id} value={node.id}>{node.name} · {node.currency}</option>)}
            </select>
            <span className="sx-field__help">Incoming payments are attributed to this branch and its local rail.</span>
          </label>
          <div className="tile-foot" style={{ justifyContent: "flex-start" }}>
            <button type="button" className="sx-btn sx-btn--secondary" onClick={copy} disabled={!payload}>
              {copied ? "Copied" : "Copy receive address"}
            </button>
          </div>
        </div>

        <aside className="tile s5" style={{ alignItems: "center", minHeight: 300, textAlign: "center" }} aria-live="polite">
          {qrUrl && branch ? (
            <>
              {/* Generated locally from the stable Sancus receive identity. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrUrl} alt={`${RECEIVE_RAILS[rail].label} receive code for ${branch.name}`} width={240} height={240} style={{ background: "white", borderRadius: 12, padding: 8 }} />
              <strong>{branch.name}</strong>
              <span className="body-s muted">{RECEIVE_RAILS[rail].label} · payer enters the amount</span>
            </>
          ) : (
            <div className="empty">Add a matching country branch to create its receive QR.</div>
          )}
        </aside>
      </div>
    </section>
  )
}
