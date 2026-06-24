import { describe, expect, it } from 'vitest'
import { elementsToSvg } from '../elements-to-svg'
import { colorOf, domTokenResolver, type TokenResolver } from '../self-built-render'
import type { CanvasElement } from '../canvas-host'

describe('elementsToSvg', () => {
  const view = { panX: 0, panY: 0, zoom: 1, gridMode: 'free' as const }
  const info = (id: string) =>
    id === 'c1' ? { title: 'T', body: 'B', type: 'note', pinned: false } : null

  it('空元素 → 空 SVG(只有背景 + svg 根)', () => {
    const r = elementsToSvg([], view, info as never, { background: true, border: 0 })
    expect(r.svg).toContain('<svg')
    expect(r.width).toBeGreaterThan(0)
  })

  it('card → SVG 含 <rect> + <text>(title)', () => {
    const els: CanvasElement[] = [
      { id: 'c1', kind: 'card', x: 0, y: 0, w: 240, h: 120, rotation: 0 },
    ]
    const r = elementsToSvg(els, view, info as never, { background: true, border: 0 })
    expect(r.svg).toContain('<rect')
    expect(r.svg).toContain('T') // title 文本
    expect(r.svg).toContain('NOTE') // 类型标
  })

  it('rect → SVG <rect>', () => {
    const els: CanvasElement[] = [
      { id: 'r1', kind: 'rect', x: 10, y: 10, w: 50, h: 30, rotation: 0, color: 'black' },
    ]
    const r = elementsToSvg(els, view, () => null, { background: false, border: 0 })
    expect(r.svg).toContain('<rect')
  })

  it('arrow → SVG <line>(from→to 端点)', () => {
    const els: CanvasElement[] = [
      { id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 },
      { id: 'b', kind: 'card', x: 300, y: 0, w: 100, h: 100, rotation: 0 },
      { id: 'ar', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b' },
    ]
    const r = elementsToSvg(els, view, () => null, { background: false, border: 0 })
    expect(r.svg).toContain('<line')
  })

  it('arrow 带 dash=dashed → SVG <line> 含 stroke-dasharray', () => {
    const els: CanvasElement[] = [
      { id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 },
      { id: 'b', kind: 'card', x: 300, y: 0, w: 100, h: 100, rotation: 0 },
      { id: 'ar', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b', dash: 'dashed' },
    ]
    const r = elementsToSvg(els, view, () => null, { background: false, border: 0 })
    expect(r.svg).toContain('stroke-dasharray')
  })

  it('arrow arrowhead=triangle → SVG <polygon>(实心三角);=none → 无箭头', () => {
    const base: CanvasElement[] = [
      { id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 },
      { id: 'b', kind: 'card', x: 300, y: 0, w: 100, h: 100, rotation: 0 },
    ]
    const tri = elementsToSvg(
      [...base, { id: 'ar', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b', arrowhead: 'triangle' }],
      view, () => null, { background: false, border: 0 },
    )
    expect(tri.svg).toContain('<polygon')
    const none = elementsToSvg(
      [...base, { id: 'ar', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b', arrowhead: 'none' }],
      view, () => null, { background: false, border: 0 },
    )
    expect(none.svg).not.toContain('<polygon')
    expect(none.svg).not.toContain('<polyline')
  })

  it('arrow 默认(无 arrowhead 字段)→ 开口 V <polyline>', () => {
    const els: CanvasElement[] = [
      { id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 },
      { id: 'b', kind: 'card', x: 300, y: 0, w: 100, h: 100, rotation: 0 },
      { id: 'ar', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b' },
    ]
    const r = elementsToSvg(els, view, () => null, { background: false, border: 0 })
    expect(r.svg).toContain('<polyline')
  })

  it('border 加 padding(width/height 含 2×border)', () => {
    const els: CanvasElement[] = [
      { id: 'c1', kind: 'card', x: 0, y: 0, w: 100, h: 50, rotation: 0 },
    ]
    const r = elementsToSvg(els, view, info as never, { background: true, border: 16 })
    expect(r.width).toBe(132) // 100 + 16*2
    expect(r.height).toBe(82) // 50 + 16*2
  })
})

describe('elementsToSvg — 负 bbox 归一化(自由箭头反向)', () => {
  // 导出时 view 不参与坐标变换(elements-to-svg.ts:51 `void view`);复用 free 模式。
  const view = { panX: 0, panY: 0, zoom: 1, gridMode: 'free' as const }

  it('反向自由箭头(w<0,h<0)不被钳成 1×1px', () => {
    // 自由箭头无 from/to,bbox 非零即自身线段;反向画时 w/h 为负。
    // 原始 bbox {x:200,y:200,w:-100,h:-100} 实际覆盖 (100,100)..(200,200)。
    // 未归一化:unionBounds 用 b.x+b.w 算 maxX → 200+(-100)=100 < minX=200 → 尺寸为负
    //   → width=max(1,round(负))=1,崩成 1×1px。
    const freeArrow: CanvasElement = {
      id: 'fa', kind: 'arrow', x: 200, y: 200, w: -100, h: -100, rotation: 0,
    }
    const r = elementsToSvg(
      [freeArrow], view, () => null,
      { background: true, border: 10 }, domTokenResolver,
    )
    // 修复后:归一化 bbox 100×100 + 2×border(10)→ 120×120;未修复则被钳成 1×1。
    expect(r.width).toBeGreaterThan(1)
    expect(r.height).toBeGreaterThan(1)
    // 自由箭头渲染为 <line>,端点须落在 viewport 内(不被裁出画布)。
    expect(r.svg).toContain('<line')
    const x1 = Number(r.svg.match(/x1="(-?[\d.]+)"/)?.[1])
    const x2 = Number(r.svg.match(/x2="(-?[\d.]+)"/)?.[1])
    expect(Number.isFinite(x1)).toBe(true)
    expect(Number.isFinite(x2)).toBe(true)
    expect(x1).toBeGreaterThanOrEqual(0)
    expect(x1).toBeLessThanOrEqual(r.width)
    expect(x2).toBeGreaterThanOrEqual(0)
    expect(x2).toBeLessThanOrEqual(r.width)
  })

  it('自由箭头(负 bbox)+ 正 bbox card 并存:并集尺寸不被负 bbox 拉垮', () => {
    const els: CanvasElement[] = [
      { id: 'fa', kind: 'arrow', x: 200, y: 200, w: -100, h: -100, rotation: 0 },
      { id: 'c1', kind: 'card', x: 0, y: 0, w: 240, h: 120, rotation: 0 },
    ]
    const r = elementsToSvg(
      els, view, () => null,
      { background: true, border: 10 }, domTokenResolver,
    )
    // card 覆盖 0..240 × 0..120;自由箭头归一化后覆盖 100..200 × 100..200。
    // 正确并集 = 0..240 × 0..200 + border×2 = 260 × 220。
    // 未修复:箭头负 bbox 被 card 正 bbox 掩盖 → unionBounds 漏算箭头 y 到 200,
    //   height=140(箭头末端被裁出 viewport)。修复后 height=220 正确包含箭头。
    expect(r.width).toBe(260) // 240 + 10*2
    expect(r.height).toBe(220) // 200(并集 h) + 10*2
    expect(r.svg).toContain('<line')
    expect(r.svg).toContain('<rect')
  })
})

describe('elementsToSvg — text 元素尊重 el.color(H2:导出不再恒黑)', () => {
  const view = { panX: 0, panY: 0, zoom: 1, gridMode: 'free' as const }

  // jsdom 无 CSS 变量上下文 → domTokenResolver 对所有 token 回退同一 fallback,
  // 黑/蓝不可区分(都会是 #0f172a),无法验证「fill 真走了 colorOf(el.color)」。
  // 故注入 stub resolver:给 --color-black / --color-blue 不同值,与实时渲染
  // colorOf 同源(el.color → token → resolver)。引擎核心本就支持注入式 resolver。
  const stubResolver: TokenResolver = (name, fallback) => {
    const distinct: Record<string, string> = {
      '--color-black': '#000000',
      '--color-blue': '#0000ff',
    }
    return distinct[name] ?? fallback
  }

  it('text { color:"blue" } → <text fill> = colorOf(blue),不再恒黑(textCol)', () => {
    // 实时渲染 self-built-render.ts:172 用 ctx.fillStyle = colorOf(el.color, …);
    // rect/freedraw/arrow 的 SVG 导出也都用 colorOf(el.color, …)。
    // 唯独 text 分支漏了,fill 用恒定 c.textCol(= --color-black)→ 导出恒黑。
    const el: CanvasElement = {
      id: 't1', kind: 'text', x: 10, y: 10, w: 0, h: 0, rotation: 0,
      text: 'hi', color: 'blue',
    }
    const r = elementsToSvg(
      [el], view, () => null,
      { background: true, border: 10 }, stubResolver,
    )
    // 取 <text …> 标签的 fill(背景是 <rect>,不会撞)。
    const fill = r.svg.match(/<text[^>]*fill="([^"]+)"/)?.[1]
    expect(fill).toBeDefined()
    const blackVal = stubResolver('--color-black', '#0f172a')
    const blueVal = colorOf('blue', stubResolver)
    expect(fill).not.toBe(blackVal) // H2:不再恒黑
    expect(fill).toBe(blueVal)      // 尊重 el.color = blue(与实时渲染同源)
  })
})
