"use client"

// The path a cross-rail payment takes: pay-in on rail A → Sancus treasury → partner bank pays out on rail B → vendor.
// `active` is the index of the leg in flight (-1 before paying, legs.length when everything is done).
import type { RouteLeg } from "@/lib/sancus/cross-rail"

export type LegResult = { ref?: string; href?: string; live?: boolean }

export function CrossRailRoute({
  legs,
  active,
  results = {},
  failedAt = null,
}: {
  legs: RouteLeg[]
  active: number
  results?: Record<number, LegResult>
  failedAt?: number | null
}) {
  return (
    <ol className="xr-route" aria-label="Payment route">
      {legs.map((leg, i) => {
        const state = failedAt === i ? "failed" : i < active ? "done" : i === active ? "active" : "idle"
        const r = results[i]
        return (
          <li key={leg.key} className="xr-node" data-state={state} aria-current={state === "active" ? "step" : undefined}>
            <span className="xr-dot" aria-hidden>
              {state === "done" ? "✓" : state === "failed" ? "!" : i + 1}
            </span>
            <span className="xr-line" aria-hidden />
            <div className="xr-body">
              <span className="xr-title">
                {leg.title}
                <span className={`xr-rail${i === 0 ? " xr-rail--a" : i === 2 ? " xr-rail--b" : ""}`}>{leg.rail}</span>
                {state === "done" && i < 3 ? (
                  r?.live ? <span className="sx-pill sx-pill--settled">Live</span> : <span className="sx-pill sx-pill--simulated">Simulated</span>
                ) : null}
              </span>
              <span className="xr-sub">
                {leg.from} → {leg.to}
              </span>
              <span className="xr-sub">{leg.detail}</span>
              {state === "done" && r?.ref ? (
                <span className="xr-ref">
                  {r.href ? (
                    <a href={r.href} target="_blank" rel="noreferrer">
                      {r.ref}
                    </a>
                  ) : (
                    r.ref
                  )}
                </span>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
