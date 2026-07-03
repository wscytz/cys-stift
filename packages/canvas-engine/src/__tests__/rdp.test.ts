import { describe, expect, it } from 'vitest'
import { simplifyPoints } from '../rdp'

// ── 造笔迹 ─────────────────────────────────────────────────────────────────────

/** 共线点(沿 x 轴均匀)。 */
function collinear(n: number): [number, number][] {
  return Array.from({ length: n }, (_, i) => [i * 5, 0] as [number, number])
}

/** L 形笔画:水平段 + 垂直段,折角在 (50, 0)。密集采样。 */
function lShape(): [number, number][] {
  const pts: [number, number][] = []
  for (let x = 0; x <= 50; x += 5) pts.push([x, 0]) // 水平段
  for (let y = 5; y <= 50; y += 5) pts.push([50, y]) // 垂直段
  return pts
}

// ── 简化正确性 ─────────────────────────────────────────────────────────────────

describe('simplifyPoints', () => {
  it('共线点简化到首尾', () => {
    const out = simplifyPoints(collinear(20), 0.5)
    expect(out).toEqual([[0, 0], [95, 0]])
  })

  it('折角点保留(L 形简化后折角在)', () => {
    const out = simplifyPoints(lShape(), 1.5)
    // 折角 (50, 0) 必在结果里(detectArrowRoute 靠它判 elbow)
    expect(out).toContainEqual([50, 0])
    // 首尾也在
    expect(out).toContainEqual([0, 0])
    expect(out).toContainEqual([50, 50])
    // 明显减少了点数(原 22 个)
    expect(out.length).toBeLessThan(10)
  })

  it('点数减少(密集共线 → 2)', () => {
    const out = simplifyPoints(collinear(100), 1)
    expect(out.length).toBe(2)
  })

  // ── 退化输入(边界,不崩)─────────────────────────────────────────────────────

  it('空数组 → 空数组', () => {
    expect(simplifyPoints([], 1)).toEqual([])
  })

  it('单点 → 原样', () => {
    expect(simplifyPoints([[5, 5]], 1)).toEqual([[5, 5]])
  })

  it('两点 → 原样(首尾)', () => {
    expect(simplifyPoints([[0, 0], [10, 10]], 1)).toEqual([[0, 0], [10, 10]])
  })

  // ── epsilon 边界 ──────────────────────────────────────────────────────────────

  it('epsilon=0:非共线笔画几乎全留(只收完美共线)', () => {
    // 锯齿(每段 ≥ MIN_SEGMENT=4,非共线):epsilon=0 不应收掉任何偏移点。
    const zigzag: [number, number][] = [[0, 0], [5, 5], [10, 0], [15, 5], [20, 0]]
    const out = simplifyPoints(zigzag, 0)
    expect(out.length).toBe(zigzag.length)
  })

  it('epsilon=0:完美共线仍收成首尾', () => {
    expect(simplifyPoints(collinear(10), 0)).toEqual([[0, 0], [45, 0]])
  })

  it('高 epsilon:退化为首尾', () => {
    const pts: [number, number][] = [[0, 0], [5, 1], [10, 0], [15, -1], [20, 0]]
    const out = simplifyPoints(pts, 100)
    expect(out).toEqual([[0, 0], [20, 0]])
  })

  it('首尾点必在结果里', () => {
    const out = simplifyPoints(lShape(), 2)
    expect(out[0]).toEqual([0, 0])
    expect(out[out.length - 1]).toEqual([50, 50])
  })

  it('不改输入数组(返回新数组)', () => {
    const input: [number, number][] = collinear(8)
    const snapshot = input.map((p) => [...p] as [number, number])
    simplifyPoints(input, 1)
    expect(input).toEqual(snapshot)
  })
})
