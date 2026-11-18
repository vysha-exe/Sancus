"use client"

import { useEffect, useState } from "react"
import { DEFAULT_RAIL_INDEX, SITE_RAILS } from "@/lib/sancus/rails"

/** Hero colonnade: each rail is a column. Cycles on its own; a click holds one and shows its speed and fee. */
export function Temple() {
  const [sel, setSel] = useState(DEFAULT_RAIL_INDEX)
  const [held, setHeld] = useState(false)

  useEffect(() => {
    if (held) return
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    const timer = setInterval(() => setSel((s) => (s + 1) % SITE_RAILS.length), 2600)
    return () => clearInterval(timer)
  }, [held])

  const r = SITE_RAILS[sel]

  return (
    <>
      <div className="temple">
        <svg className="pediment" viewBox="0 0 560 92" aria-hidden="true">
          <polygon points="4,90 280,4 556,90" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <polygon points="44,82 280,18 516,82" fill="none" stroke="currentColor" strokeWidth=".8" />
        </svg>
        <div className="architrave">One account · Every rail · Every border</div>
        <div className="frieze" />
        <div className="cols" role="group" aria-label="Rails">
          {SITE_RAILS.map((c, i) => (
            <button
              key={c.name}
              type="button"
              className={i === sel ? "col col--on" : "col"}
              aria-pressed={i === sel}
              onClick={() => {
                setSel(i)
                setHeld(true)
              }}
            >
              <span className="cap" />
              <span className="neck" />
              <span className="shaft">
                <span>{c.name}</span>
              </span>
              <span className="plinth" />
            </button>
          ))}
        </div>
        <div className="steps3" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div className="ground" aria-hidden="true" />
      </div>
      <div className="rail-card" aria-live="polite">
        <div className="rail-card-head">
          <span className="sx-rail">{r.name}</span>
          {r.simulated ? (
            <span className="sx-pill sx-pill--simulated">Simulated</span>
          ) : (
            <span className="sx-pill sx-pill--settled">Live on testnet</span>
          )}
        </div>
        <span className="body-strong">{r.use}</span>
        <div className="kv">
          <span>Arrives</span>
          <span>{r.speed}</span>
        </div>
        <div className="kv">
          <span>Fee</span>
          <span>{r.fee}</span>
        </div>
      </div>
    </>
  )
}
