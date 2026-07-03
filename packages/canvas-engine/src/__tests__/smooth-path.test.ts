import { describe, expect, it } from 'vitest'
import { buildSmoothPath, smoothBezierSegments } from '../smooth-path'

describe('smoothBezierSegments', () => {
  it('空 / 单点 → 无段', () => {
    expect(smoothBezierSegments([])).toEqual([])
    expect(smoothBezierSegments([[5, 5]])).toEqual([])
  })

  it('两点 → 1 段', () => {
    const segs = smoothBezierSegments([[0, 0], [10, 0]])
    expect(segs).toHaveLength(1)
    expect(segs[0]!.p0).toEqual([0, 0])
    expect(segs[0]!.p1).toEqual([10, 0])
  })

  it('n 点 → n-1 段', () => {
    expect(smoothBezierSegments([[0, 0], [10, 0], [10, 10], [0, 10]])).toHaveLength(3)
  })

  it('过每个原始点(p0..p1 链 = 原点序列)', () => {
    const pts: [number, number][] = [[0, 0], [20, 5], [40, 0], [60, 5]]
    const segs = smoothBezierSegments(pts)
    // 每段 p0 依次 = 原点;最后段 p1 = 最后点
    segs.forEach((s, i) => expect(s.p0).toEqual(pts[i]))
    expect(segs[segs.length - 1]!.p1).toEqual(pts[pts.length - 1])
  })

  it('共线点 → 控制点也在该线上(退化为直线)', () => {
    const segs = smoothBezierSegments([[0, 0], [50, 0], [100, 0]])
    // x 轴上的点:所有 cp 的 y 都应为 0(直线不偏移)
    for (const s of segs) {
      expect(s.cp1[1]).toBe(0)
      expect(s.cp2[1]).toBe(0)
    }
  })

  it('不改输入数组', () => {
    const input: [number, number][] = [[0, 0], [10, 10], [20, 0]]
    const snap = input.map((p) => [...p] as [number, number])
    smoothBezierSegments(input)
    expect(input).toEqual(snap)
  })
})

describe('buildSmoothPath', () => {
  it('空 → ""', () => {
    expect(buildSmoothPath([])).toBe('')
  })

  it('单点 → ""(调用方单点画圆点特例)', () => {
    expect(buildSmoothPath([[5, 5]])).toBe('')
  })

  it('两点 → "M x y C …"(1 段贝塞尔)', () => {
    const d = buildSmoothPath([[0, 0], [10, 0]])
    expect(d.startsWith('M 0 0')).toBe(true)
    expect(d).toMatch(/C /) // 至少一段三次贝塞尔
  })

  it('多点 → M 起 + (n-1) 段 C', () => {
    const d = buildSmoothPath([[0, 0], [20, 5], [40, 0], [60, 5]])
    expect(d.startsWith('M 0 0')).toBe(true)
    // 3 段 → 3 个 "C"
    expect((d.match(/C/g) || []).length).toBe(3)
  })

  it('过首尾点(d 以首点 M 起、以末点收)', () => {
    const d = buildSmoothPath([[10, 20], [50, 30], [90, 20]])
    expect(d.startsWith('M 10 20')).toBe(true)
    expect(d.endsWith('90 20')).toBe(true)
  })
})
