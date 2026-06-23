import { bench, describe } from 'vitest'
import {
  renderElements,
  hitTest,
  sortByLayer,
  domTokenResolver,
} from '../index'
import type { CanvasElement, CanvasView } from '../canvas-host'

/**
 * 渲染性能基线(2026-06-23)— STATE 明说自研渲染未压测,这是盲点。
 *
 * 测三个热点路径 @ 真实规模(100 / 1k / 5k 元素,混合 5 种 kind):
 *  1. renderElements —— rAF 每帧调用,最热
 *  2. sortByLayer    —— getElements 每次调用(渲染 + hitTest + 序列化共用)
 *  3. hitTest        —— 每次 pointer 事件
 *
 * mock ctx 记录调用(同 self-built-render.test.ts),开销恒定可比;绝对数字
 * 依赖 jsdom/mock,意义在「相对趋势 + 防回归」(改完渲染/排序后跑 bench --compare
 * 看是否退化),不是真实帧率。
 */

// ── mock ctx:记录所有调用(与 self-built-render.test.ts 同款,开销恒定) ──────
function mockCtx(): CanvasRenderingContext2D {
  const noop = () => {}
  return {
    clearRect: noop,
    fillRect: noop,
    strokeRect: noop,
    rect: noop,
    roundRect: noop,
    save: noop,
    restore: noop,
    translate: noop,
    scale: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    setLineDash: noop,
    fill: noop,
    stroke: noop,
    fillText: noop,
    measureText: () => ({ width: 10 }) as TextMetrics,
    set fillStyle(_v: unknown) {},
    set strokeStyle(_v: unknown) {},
    set font(_v: string) {},
    set lineWidth(_v: unknown) {},
  } as unknown as CanvasRenderingContext2D
}

const VIEW: CanvasView = { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }
const cardInfo = () => ({ title: 'T', body: 'B', type: 'note', pinned: false })

/** 造 n 个混合 kind 的元素(均匀铺开,避免边界框全重叠)。 */
function makeElements(n: number): CanvasElement[] {
  const kinds: CanvasElement['kind'][] = ['rect', 'freedraw', 'card', 'arrow', 'text']
  const els: CanvasElement[] = []
  for (let i = 0; i < n; i++) {
    const kind = kinds[i % kinds.length]!
    const col = i % 50
    const row = Math.floor(i / 50)
    const x = col * 260
    const y = row * 140
    const base: CanvasElement = { id: `e${i}`, kind, x, y, w: 240, h: 120, rotation: 0 }
    if (kind === 'arrow') {
      base.from = `e${(i + 50) % n}`
      base.to = `e${(i + 51) % n}`
      base.dash = i % 2 ? 'dashed' : 'solid'
    }
    if (kind === 'text') base.text = 'label'
    if (kind === 'freedraw') base.meta = { points: [[x, y], [x + 10, y + 10], [x + 20, y]] }
    els.push(base)
  }
  return els
}

const N100 = makeElements(100)
const N1K = makeElements(1000)
const N5K = makeElements(5000)

describe('renderElements @ scale', () => {
  bench('100 elements', () => {
    renderElements(mockCtx(), N100, VIEW, 1200, 800, cardInfo, '#ffffff', domTokenResolver)
  })
  bench('1000 elements', () => {
    renderElements(mockCtx(), N1K, VIEW, 1200, 800, cardInfo, '#ffffff', domTokenResolver)
  })
  bench('5000 elements', () => {
    renderElements(mockCtx(), N5K, VIEW, 1200, 800, cardInfo, '#ffffff', domTokenResolver)
  })
})

describe('sortByLayer (getElements) @ scale', () => {
  bench('100 elements', () => {
    sortByLayer(N100)
  })
  bench('1000 elements', () => {
    sortByLayer(N1K)
  })
  bench('5000 elements', () => {
    sortByLayer(N5K)
  })
})

describe('hitTest @ scale', () => {
  bench('100 elements', () => {
    hitTest(N100, 130, 70)
  })
  bench('1000 elements', () => {
    hitTest(N1K, 130, 70)
  })
  bench('5000 elements', () => {
    hitTest(N5K, 130, 70)
  })
})
