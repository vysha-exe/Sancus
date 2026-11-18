import { describe, expect, it } from "vitest"
import { DEFAULT_LAYOUT, elbowPath, layoutTree, type LayoutInput } from "@/lib/sancus/tree-layout"

const n = (id: string, ...children: LayoutInput[]): LayoutInput => ({ id, children })
const at = (layout: ReturnType<typeof layoutTree>, id: string) => layout.nodes.find((x) => x.node.id === id)!

describe("company structure tree layout", () => {
  it("draws a binary split with the parent centred over two children", () => {
    const l = layoutTree([n("hq", n("id"), n("th"))])
    expect(at(l, "hq").x).toBe((at(l, "id").x + at(l, "th").x) / 2)
    expect(at(l, "id").y).toBe(at(l, "th").y)
    expect(at(l, "id").y).toBeGreaterThan(at(l, "hq").y)
    expect(l.edges).toHaveLength(2)
  })

  it("draws a ternary split and keeps sibling boxes from overlapping", () => {
    const l = layoutTree([n("hq", n("a"), n("b"), n("c"))])
    const xs = ["a", "b", "c"].map((id) => at(l, id).x)
    expect(xs[1]! - xs[0]!).toBeGreaterThanOrEqual(DEFAULT_LAYOUT.boxWidth)
    expect(at(l, "hq").x).toBe(xs[1])
  })

  it("handles uneven depth: sub-branches sit one row lower under their branch", () => {
    const l = layoutTree([n("hq", n("id", n("jkt"), n("sby")), n("th"))])
    expect(at(l, "jkt").depth).toBe(2)
    expect(at(l, "id").x).toBe((at(l, "jkt").x + at(l, "sby").x) / 2)
    expect(l.height).toBe(2 * DEFAULT_LAYOUT.pad + 3 * DEFAULT_LAYOUT.boxHeight + 2 * DEFAULT_LAYOUT.gapY)
    expect(l.nodes.every((x) => x.x - DEFAULT_LAYOUT.boxWidth / 2 >= 0 && x.x + DEFAULT_LAYOUT.boxWidth / 2 <= l.width)).toBe(true)
  })

  it("works for a single global account with no branches", () => {
    const l = layoutTree([n("hq")])
    expect(l.nodes).toHaveLength(1)
    expect(l.edges).toHaveLength(0)
    expect(l.width).toBe(DEFAULT_LAYOUT.boxWidth + 2 * DEFAULT_LAYOUT.pad)
  })

  it("builds elbow connectors", () => {
    expect(elbowPath({ x1: 100, y1: 76, x2: 40, y2: 132 })).toBe("M 100 76 V 104 H 40 V 132")
  })
})
