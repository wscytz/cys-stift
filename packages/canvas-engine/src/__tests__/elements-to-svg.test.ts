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

describe('elementsToSvg — text 多行 + rect 负 bbox(M1+M3:导出对齐实时渲染)', () => {
  const view = { panX: 0, panY: 0, zoom: 1, gridMode: 'free' as const }

  it('M1:多行 text 按 \\n split 成多个 <text>,行高 18(对齐 render fillText)', () => {
    // 实时渲染 self-built-render.ts:170-177:text.split('\n') 逐行 fillText,
    // textBaseline='top',行高 18px。SVG 单 <text> 的 \n 不换行 → 导出全挤一行。
    // 修法:split 成多 <text>,每行 y = base + i*18(base = y+14 对齐首行 baseline)。
    const el: CanvasElement = {
      id: 't1', kind: 'text', x: 10, y: 10, w: 0, h: 0, rotation: 0,
      text: 'line1\nline2\nline3',
    }
    const r = elementsToSvg(
      [el], view, () => null,
      { background: false, border: 0 }, domTokenResolver,
    )
    // border:0 → bbox {x:10,y:10,w:0,h:0} → dx=-10,dy=-10 → x=0,y=0
    // → 首行 y=0+14=14,次行 32,三行 50。
    const textTags = r.svg.match(/<text/g) ?? []
    expect(textTags.length).toBe(3)
    const ys = [...r.svg.matchAll(/<text[^>]*?\sy="(-?[\d.]+)"/g)].map((m) => Number(m[1]))
    expect(ys).toHaveLength(3)
    expect(ys[0]).toBe(14)
    expect(ys[1]).toBe(32)
    expect(ys[2]).toBe(50)
  })

  it('M1:纯空文本(text:"")早退,不输出 <text(对齐 render line 171 早退)', () => {
    // render:lines.length===1 && lines[0]==='' → break,不画。
    const el: CanvasElement = {
      id: 't2', kind: 'text', x: 10, y: 10, w: 0, h: 0, rotation: 0,
      text: '',
    }
    const r = elementsToSvg(
      [el], view, () => null,
      { background: false, border: 0 }, domTokenResolver,
    )
    expect(r.svg).not.toContain('<text')
  })

  it('M3:负 bbox rect 归一化后 width/height 为正(对齐 render ctx.rect 支持负值)', () => {
    // 实时渲染 self-built-render.ts:108-109:ctx.rect(el.x,el.y,el.w,el.h),
    // Canvas 2D 支持负值(从对角画);SVG <rect> 负宽高不渲染 → 导出空白。
    // 导入 upsert 不经 MIN_SIZE clamp,可造出负 rect。修法:rect 分支用 normalizeBox。
    // 原始 {x:200,y:200,w:-100,h:-80} 实际覆盖 (100,120)..(200,200)。
    const el: CanvasElement = {
      id: 'r1', kind: 'rect', x: 200, y: 200, w: -100, h: -80, rotation: 0,
    }
    const r = elementsToSvg(
      [el], view, () => null,
      { background: false, border: 0 }, domTokenResolver,
    )
    // 归一化后 w=100,h=80;border:0 → dx=-100,dy=-120 → rect x=0,y=0。
    expect(r.svg).not.toContain('width="-100"')
    expect(r.svg).not.toContain('height="-80"')
    const w = Number(r.svg.match(/<rect[^>]*?\swidth="(-?[\d.]+)"/)?.[1])
    const h = Number(r.svg.match(/<rect[^>]*?\sheight="(-?[\d.]+)"/)?.[1])
    expect(Number.isFinite(w)).toBe(true)
    expect(Number.isFinite(h)).toBe(true)
    expect(w).toBe(100)
    expect(h).toBe(80)
  })
})

describe('elementsToSvg — freedraw 单点画 <circle>(L1:导出与渲染一致)', () => {
  const view = { panX: 0, panY: 0, zoom: 1, gridMode: 'free' as const }

  it('单点 freedraw → SVG 含 <circle r="2">,不再空 M path(L1)', () => {
    // 实时渲染 self-built-render.ts freedraw 分支:单点(pts.length===1)只 moveTo 无
    // lineTo → stroke() 画不出东西 = 不可见幽灵。导出同理 d="M x y" 空 path 也不画。
    // 修法:单点画小圆点(render arc+fill / SVG <circle r="2">),两视图一致。
    // 真实单点 freedraw(commitFreedraw 一点):bbox 退化 w=0,h=0,points=[[x,y]]。
    const el: CanvasElement = {
      id: 'f1', kind: 'freedraw', x: 50, y: 50, w: 0, h: 0, rotation: 0,
      meta: { points: [[50, 50]] },
    }
    const r = elementsToSvg(
      [el], view, () => null,
      { background: false, border: 10 }, domTokenResolver,
    )
    // 单点 → <circle r="2">(半径>0),不再是无 L 的空 <path d="M …">。
    expect(r.svg).toMatch(/<circle[^>]*\sr="2"/)
    // fill 不能是 none(否则又是不可见幽灵);颜色走 colorOf(el.color, tokenResolver)。
    const circleFill = r.svg.match(/<circle[^>]*\sfill="([^"]+)"/)?.[1]
    expect(circleFill).toBeDefined()
    expect(circleFill).not.toBe('none')
  })
})
