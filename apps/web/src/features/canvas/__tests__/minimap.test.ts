import { describe, it, expect } from 'vitest'
import {
  computeMinimapProjection,
  viewportRect,
  minimapClickToPage,
} from '../minimap'
import type { CanvasElement, CanvasView } from '@cys-stift/canvas-engine'
import { InMemoryCanvasHost } from '@cys-stift/canvas-engine'

const SIZE = { w: 160, h: 120 }

function el(id: string, x: number, y: number, w: number, h: number, kind: CanvasElement['kind'] = 'card'): CanvasElement {
  return { id, kind, x, y, w, h, rotation: 0 }
}

describe('computeMinimapProjection', () => {
  it('returns default projection for empty elements', () => {
    const p = computeMinimapProjection([], SIZE)
    expect(p.scale).toBe(1)
    expect(p.offsetX).toBe(0)
    expect(p.offsetY).toBe(0)
  })

  it('fits a single element with padding', () => {
    // 元素 100x60,minimap 内容区 144x104(padding=8)。
    // scaleX = 144/100 = 1.44; scaleY = 104/60 ≈ 1.733; min = 1.44。
    const p = computeMinimapProjection([el('a', 0, 0, 100, 60)], SIZE)
    expect(p.scale).toBeCloseTo(1.44, 5)
    // bbox 中心 (50,30) 映射到内容区中心 (80,60)。
    expect(p.offsetX).toBeCloseTo(80 - 50 * 1.44, 5)
    expect(p.offsetY).toBeCloseTo(60 - 30 * 1.44, 5)
  })

  it('fits union of multiple elements', () => {
    // bbox: x∈[0,200], y∈[0,100] → 200x100。scaleX=144/200=0.72; scaleY=104/100=1.04; min=0.72。
    const els = [el('a', 0, 0, 100, 50), el('b', 100, 50, 100, 50)]
    const p = computeMinimapProjection(els, SIZE)
    expect(p.scale).toBeCloseTo(0.72, 5)
    // bbox 中心 (100,50) → 内容区中心 (80,60)。
    expect(p.offsetX).toBeCloseTo(80 - 100 * 0.72, 5)
    expect(p.offsetY).toBeCloseTo(60 - 50 * 0.72, 5)
  })

  it('respects padding argument', () => {
    // padding=20 → 内容区 120x80。scaleX=120/100=1.2; scaleY=80/60≈1.333; min=1.2。
    const p = computeMinimapProjection([el('a', 0, 0, 100, 60)], SIZE, 20)
    expect(p.scale).toBeCloseTo(1.2, 5)
  })

  it('handles degenerate (zero-size) bbox without division by zero', () => {
    // 所有元素共点 → effW=effH=1,不抛、返回有限 scale。
    const p = computeMinimapProjection([el('a', 50, 50, 0, 0)], SIZE)
    expect(Number.isFinite(p.scale)).toBe(true)
    expect(p.scale).toBeGreaterThan(0)
  })

  it('handles elements offset from origin (negative space allowed)', () => {
    const els = [el('a', 1000, 2000, 100, 60)]
    const p = computeMinimapProjection(els, SIZE)
    // bbox 中心 (1050, 2030); scale=1.44。元素应落在 minimap 内。
    const topLeft = { x: 1000 * p.scale + p.offsetX, y: 2000 * p.scale + p.offsetY }
    const botRight = { x: 1100 * p.scale + p.offsetX, y: 2060 * p.scale + p.offsetY }
    expect(topLeft.x).toBeGreaterThanOrEqual(0)
    expect(botRight.x).toBeLessThanOrEqual(SIZE.w)
    expect(topLeft.y).toBeGreaterThanOrEqual(0)
    expect(botRight.y).toBeLessThanOrEqual(SIZE.h)
  })

  it('returns default for non-positive minimap size', () => {
    const p = computeMinimapProjection([el('a', 0, 0, 10, 10)], { w: 0, h: 0 })
    expect(p.scale).toBe(1)
  })
})

describe('viewportRect', () => {
  const HOST = { w: 800, h: 600 }
  const baseView: CanvasView = { panX: 0, panY: 0, zoom: 1, gridMode: 'snap' as const }

  it('identity view → viewport equals host size at origin', () => {
    const r = viewportRect(baseView, HOST)
    expect(r).toEqual({ x: 0, y: 0, w: 800, h: 600 })
  })

  it('zoom=2 halves dimensions; pan maps to page via −pan/zoom (符号修)', () => {
    const v: CanvasView = { ...baseView, zoom: 2, panX: 10, panY: 20 }
    const r = viewportRect(v, HOST)
    // 页坐标 = (screen − pan) / zoom = −pan/zoom(渲染 transform 是 translate(pan) scale(zoom))。
    // 此前本测试断言 +5/+10(符号反,与实现的旧 bug 同向)—— 鸟瞰图方框镜像 bug 的根因。
    expect(r.x).toBe(-5) // −10/2
    expect(r.y).toBe(-10) // −20/2
    expect(r.w).toBe(400) // 800/2
    expect(r.h).toBe(300) // 600/2
  })

  it('pan(100,200) zoom 1 → 页原点 (−100, −200)(对齐引擎 viewportBounds)', () => {
    const v: CanvasView = { ...baseView, zoom: 1, panX: 100, panY: 200 }
    const r = viewportRect(v, HOST)
    expect(r.x).toBe(-100)
    expect(r.y).toBe(-200)
  })

  it('zoom=0.5 doubles dimensions', () => {
    const v: CanvasView = { ...baseView, zoom: 0.5 }
    const r = viewportRect(v, HOST)
    expect(r.w).toBe(1600)
    expect(r.h).toBe(1200)
  })
})

describe('minimapClickToPage (inverse projection)', () => {
  it('round-trips: page center → minimap click → same page point', () => {
    const els = [el('a', 0, 0, 200, 120)]
    const proj = computeMinimapProjection(els, SIZE)
    // 取页坐标 (50, 30),正投影到 minimap,再逆投影回来。
    const pageP = { x: 50, y: 30 }
    const miniP = { x: pageP.x * proj.scale + proj.offsetX, y: pageP.y * proj.scale + proj.offsetY }
    const back = minimapClickToPage(miniP, proj)
    expect(back.x).toBeCloseTo(50, 5)
    expect(back.y).toBeCloseTo(30, 5)
  })

  it('handles identity-like projection', () => {
    const proj = { scale: 1, offsetX: 0, offsetY: 0 }
    const p = minimapClickToPage({ x: 100, y: 200 }, proj)
    expect(p).toEqual({ x: 100, y: 200 })
  })

  it('guards against zero scale', () => {
    const p = minimapClickToPage({ x: 10, y: 10 }, { scale: 0, offsetX: 0, offsetY: 0 })
    expect(p).toEqual({ x: 0, y: 0 })
  })
})

/** 集成 sanity:用真 InMemoryCanvasHost 确认 getElements 喂数据正常。 */
describe('integration with CanvasHost', () => {
  it('projects real host elements', () => {
    const host = new InMemoryCanvasHost()
    host.upsert(el('card-1', 0, 0, 240, 120, 'card'))
    host.upsert(el('arrow-1', 240, 60, 100, 0, 'arrow'))
    const p = computeMinimapProjection(host.getElements(), SIZE)
    expect(Number.isFinite(p.scale)).toBe(true)
    expect(p.scale).toBeGreaterThan(0)
  })
})
