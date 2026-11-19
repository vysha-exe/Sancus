"use client"

// Branches › Company structure: org-chart diagram of the global account splitting into
// direct country branches. Click a box to open that account's monitoring page.
import { useMemo } from "react"
import { useRouter } from "next/navigation"
import type { CompanyNode } from "@/lib/sancus/companies"
import { displayMinor, USDC_DECIMALS } from "@/lib/sancus/money"
import { DEFAULT_LAYOUT, elbowPath, layoutTree } from "@/lib/sancus/tree-layout"

const { boxWidth: W, boxHeight: H } = DEFAULT_LAYOUT

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)
const usd = (minor: string) => `$${displayMinor(BigInt(minor), USDC_DECIMALS, "", 2)}`

function level(n: CompanyNode) {
  if (n.parentId === null) return "Global account"
  return n.depth <= 1 ? "Branch" : "Sub-branch"
}

export function CompanyTreeDiagram({ tree, balancesReady }: { tree: CompanyNode[]; balancesReady: boolean }) {
  const router = useRouter()
  const layout = useMemo(() => layoutTree(tree), [tree])
  if (tree.length === 0) return null

  const branchCount = layout.nodes.length - tree.length
  const describe = `Company structure: ${tree.map((r) => r.name).join(", ")} with ${branchCount} branch${branchCount === 1 ? "" : "es"}.`

  function openAccount(id: string) {
    router.push(`/branches/${id}`)
  }

  return (
    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      <svg
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="img"
        aria-label={describe}
        style={{ display: "block", margin: "0 auto", maxWidth: "none" }}
      >
        <title>{describe}</title>

        {layout.edges.map((e) => (
          <path
            key={`${e.from}-${e.to}`}
            d={elbowPath(e)}
            fill="none"
            stroke="var(--line-strong)"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
        ))}

        {layout.nodes.map(({ node, x, y }) => {
          const root = node.parentId === null
          const left = x - W / 2
          const walletLabel = `${node.wallets.length} wallet${node.wallets.length === 1 ? "" : "s"}`
          const balanceLabel = balancesReady ? usd(node.totalMinor) : "***"
          return (
            <g
              key={node.id}
              transform={`translate(${left}, ${y})`}
              role="button"
              tabIndex={0}
              aria-label={`${node.name}, ${level(node)}, ${balanceLabel}, ${walletLabel}`}
              onClick={() => openAccount(node.id)}
              onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && (ev.preventDefault(), openAccount(node.id))}
              style={{ cursor: "pointer", outline: "none" }}
            >
              <rect
                width={W}
                height={H}
                rx={10}
                fill={root ? "var(--accent-subtle)" : "var(--surface-100)"}
                stroke={root ? "var(--accent)" : "var(--line-strong)"}
                strokeWidth={root ? 2 : 1}
              />
              {/* The root is a country-neutral treasury; only branches carry a country. */}
              <rect x={10} y={10} width={30} height={20} rx={5} fill="var(--surface-200)" />
              <text x={25} y={24} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--ink)" style={{ fontFamily: "var(--font-mono)" }}>
                {root ? "HQ" : node.country}
              </text>
              <text x={48} y={24} fontSize={13} fontWeight={600} fill="var(--ink)" style={{ fontFamily: "var(--font-sans)" }}>
                {clip(node.name, 15)}
              </text>
              <text x={10} y={46} fontSize={10} fill="var(--ink-muted)" letterSpacing="0.06em" style={{ fontFamily: "var(--font-mono)", textTransform: "uppercase" }}>
                {root ? "Global treasury · USDC" : `${level(node)} · ${node.currency}`}
              </text>
              <text x={10} y={66} fontSize={13} fontWeight={600} fill="var(--ink)" style={{ fontFamily: "var(--font-sans)", fontVariantNumeric: "tabular-nums" }}>
                {balanceLabel}
              </text>
              <text x={W - 10} y={66} textAnchor="end" fontSize={11} fill="var(--ink-muted)" style={{ fontFamily: "var(--font-sans)" }}>
                {walletLabel}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
