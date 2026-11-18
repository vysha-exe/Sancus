"use client"

import { useEffect, useState } from "react"

type Readiness = {
  fallback: boolean
  providers: { marqeta: boolean; payzu: boolean }
  stageReady: boolean
}

export function DemoReadiness() {
  const [readiness, setReadiness] = useState<Readiness | null>(null)

  useEffect(() => {
    void fetch("/api/sancus/demo-readiness", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((body) => setReadiness(body))
      .catch(() => {})
  }, [])

  if (!readiness) return null
  return (
    <div className="tile-foot" style={{ justifyContent: "flex-start", flexWrap: "wrap" }} aria-label="Demo provider readiness">
      <span className={`sx-pill${readiness.providers.marqeta && !readiness.fallback ? " sx-pill--settled" : " sx-pill--simulated"}`}>
        Marqeta {readiness.providers.marqeta && !readiness.fallback ? "sandbox ready" : "simulated"}
      </span>
      <span className={`sx-pill${readiness.providers.payzu && !readiness.fallback ? " sx-pill--settled" : " sx-pill--simulated"}`}>
        PayZu {readiness.providers.payzu && !readiness.fallback ? "sandbox ready" : "simulated"}
      </span>
    </div>
  )
}
