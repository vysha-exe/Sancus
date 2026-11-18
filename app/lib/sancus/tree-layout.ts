// Sancus: top-down "tidy tree" layout for the company structure diagram.
// Leaves are spaced evenly left to right; each parent sits centred over its children,
// so a node with 2 children draws as a binary split, 3 as a ternary split, and so on.

export type LayoutInput = { id: string; children: LayoutInput[] }

export type LaidOutNode<T extends LayoutInput> = {
  node: T
  /** Centre x of the box, in px. */
  x: number
  /** Top y of the box, in px. */
  y: number
  depth: number
  parentId: string | null
}

export type TreeLayout<T extends LayoutInput> = {
  nodes: LaidOutNode<T>[]
  edges: { from: string; to: string; x1: number; y1: number; x2: number; y2: number }[]
  width: number
  height: number
}

export type LayoutOptions = { boxWidth: number; boxHeight: number; gapX: number; gapY: number; pad: number }

export const DEFAULT_LAYOUT: LayoutOptions = { boxWidth: 168, boxHeight: 76, gapX: 24, gapY: 56, pad: 16 }

export function layoutTree<T extends LayoutInput>(roots: T[], opts: LayoutOptions = DEFAULT_LAYOUT): TreeLayout<T> {
  const nodes: LaidOutNode<T>[] = []
  const slot = opts.boxWidth + opts.gapX
  let nextLeaf = 0
  let maxDepth = 0

  // Post-order: leaves take the next slot, parents centre over their children.
  const place = (n: T, depth: number, parentId: string | null): number => {
    maxDepth = Math.max(maxDepth, depth)
    const kids = n.children as T[]
    let x: number
    if (kids.length === 0) {
      x = opts.pad + nextLeaf * slot + opts.boxWidth / 2
      nextLeaf++
    } else {
      const xs = kids.map((k) => place(k, depth + 1, n.id))
      x = (xs[0]! + xs[xs.length - 1]!) / 2
    }
    nodes.push({ node: n, x, y: opts.pad + depth * (opts.boxHeight + opts.gapY), depth, parentId })
    return x
  }

  roots.forEach((r, i) => {
    if (i > 0) nextLeaf += 0.5 // a little extra room between separate global accounts
    place(r, 0, null)
  })

  const byId = new Map(nodes.map((n) => [n.node.id, n]))
  const edges = nodes
    .filter((n) => n.parentId)
    .map((n) => {
      const p = byId.get(n.parentId!)!
      return { from: p.node.id, to: n.node.id, x1: p.x, y1: p.y + opts.boxHeight, x2: n.x, y2: n.y }
    })

  return {
    nodes: nodes.sort((a, b) => a.depth - b.depth || a.x - b.x),
    edges,
    width: Math.max(opts.boxWidth + 2 * opts.pad, 2 * opts.pad + nextLeaf * slot - opts.gapX),
    height: 2 * opts.pad + (maxDepth + 1) * opts.boxHeight + maxDepth * opts.gapY,
  }
}

/** Elbow path from a parent's bottom edge to a child's top edge. */
export function elbowPath(e: { x1: number; y1: number; x2: number; y2: number }): string {
  const midY = e.y1 + (e.y2 - e.y1) / 2
  return `M ${e.x1} ${e.y1} V ${midY} H ${e.x2} V ${e.y2}`
}
