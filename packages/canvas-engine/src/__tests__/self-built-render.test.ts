import { describe, expect, it } from 'vitest'
import { renderElements, drawSelectionOutlines, drawMarquee, colorOf, domTokenResolver } from '../self-built-render'
import { arrowEndpoints } from '../self-built-arrow'
import { intersectsBounds, normalizeBox } from '../bounds'
import type { CanvasElement, CanvasView } from '../canvas-host'

/** mock CanvasRenderingContext2D:记录所有方法调用。 */
function mockCtx() {
  const calls: string[] = []
  const ctx = {
    _calls: calls,
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    translate: (x: number, y: number) => calls.push(`translate(${x},${y})`),
    scale: (x: number, y: number) => calls.push(`scale(${x})`),
    beginPath: () => calls.push('beginPath'),
    closePath: () => calls.push('closePath'),
    rect: (x: number, y: number, w: number, h: number) => calls.push(`rect(${x},${y},${w},${h})`),
    moveTo: (x: number, y: number) => calls.push(`moveTo(${x},${y})`),
    lineTo: (x: number, y: number) => calls.push(`lineTo(${x},${y})`),
    bezierCurveTo: (cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) =>
      calls.push(`bezierCurveTo(${cp1x},${cp1y},${cp2x},${cp2y},${x},${y})`),
    arc: (x: number, y: number, r: number, start: number, end: number) => calls.push(`arc(${x},${y},${r},${start},${end})`),
    setLineDash: (arr: number[]) => calls.push(`setLineDash(${arr.join(',')})`),
    strokeRect: (x: number, y: number, w: number, h: number) => calls.push(`strokeRect(${x},${y},${w},${h})`),
    roundRect: (x: number, y: number, w: number, h: number, r?: number) => calls.push(`roundRect(${x},${y},${w},${h})`),
    fill: () => calls.push('fill'),
    fillRect: (x: number, y: number, w: number, h: number) => calls.push(`fillRect(${x},${y},${w},${h})`),
    stroke: () => calls.push('stroke'),
    fillText: (t: string, x: number, y: number) => calls.push(`fillText(${t}@${x},${y})`),
    set fillStyle(v: unknown) { calls.push(`fillStyle=${v}`) },
    set strokeStyle(v: unknown) { calls.push(`strokeStyle=${v}`) },
    set font(v: string) { calls.push(`font=${v}`) },
    set lineWidth(v: unknown) { calls.push(`lineWidth=${v}`) },
    clearRect: (x: number, y: number, w: number, h: number) => calls.push(`clearRect(${x},${y},${w},${h})`),
    measureText: (s: string) => ({ width: s.length * 7 }),
  }
  return ctx as unknown as CanvasRenderingContext2D & { _calls: string[] }
}

describe('renderElements', () => {
  const view: CanvasView = { panX: 10, panY: 20, zoom: 2, gridMode: 'free' }

  it('applies the camera transform (translate + scale) around the draw', () => {
    const ctx = mockCtx()
    renderElements(ctx, [], view, 800, 600, () => null, '#0f172a')
    expect(ctx._calls).toContain('clearRect(0,0,800,600)')
    expect(ctx._calls).toContain('save')
    expect(ctx._calls).toContain('translate(10,20)')
    expect(ctx._calls).toContain('scale(2)')
    expect(ctx._calls).toContain('restore')
  })

  it('draws a card (rounded rect + label) and a rect', () => {
    const ctx = mockCtx()
    const els: CanvasElement[] = [
      { id: 'c1', kind: 'card', x: 100, y: 50, w: 240, h: 120, rotation: 0 },
      { id: 'r1', kind: 'rect', x: 0, y: 0, w: 50, h: 30, rotation: 0, color: 'blue' },
    ]
    renderElements(
      ctx,
      els,
      view,
      800,
      600,
      (id) => (id === 'c1' ? { title: 'Title', body: '', type: 'note', pinned: false } : null),
      '#0f172a',
    )
    expect(ctx._calls.some((c) => c.startsWith('roundRect(100,50,240,120)'))).toBe(true)
    // title @ (el.x+10, el.y+10+16) = (110, 76)
    expect(ctx._calls.some((c) => c.startsWith('fillText(Title@110,76)'))).toBe(true)
    expect(ctx._calls.some((c) => c.startsWith('rect(0,0,50,30)'))).toBe(true)
  })

  it('skips unknown kinds without throwing', () => {
    const ctx = mockCtx()
    const els = [{ id: 'x', kind: 'freedraw', x: 0, y: 0, w: 0, h: 0, rotation: 0 }] as CanvasElement[]
    expect(() => renderElements(ctx, els, view, 800, 600, () => null, '#0f172a')).not.toThrow()
  })

  // ── cardDisplayMode(密度切换):title/subtitle/compact/auto 的 body 行数 ──
  // width=240 -> wrap 宽 220 -> 31 字/行(mock ctx 每字 7px);"a"×100 = 4 wrapped 行。
  function cardCalls(mode: 'compact' | 'auto' | 'title' | 'subtitle'): string[] {
    const ctx = mockCtx()
    const els: CanvasElement[] = [{ id: 'c1', kind: 'card', x: 0, y: 0, w: 240, h: 200, rotation: 0 }]
    renderElements(
      ctx, els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }, 800, 600,
      () => ({ title: 'T', body: 'a'.repeat(100), type: 'note', pinned: false, subtitle: 'sub' }),
      '#0f172a', domTokenResolver, els, mode,
    )
    return ctx._calls.filter((c) => c.startsWith('fillText'))
  }

  it('cardMode=title:0 body 行(只 type + title = 2 fillText)', () => {
    const ft = cardCalls('title')
    expect(ft.length).toBe(2)
  })

  it('cardMode=subtitle:1 副标题行(type + title + subtitle = 3 fillText)', () => {
    const ft = cardCalls('subtitle')
    expect(ft.length).toBe(3)
    expect(ft.some((c) => c.startsWith('fillText(sub@'))).toBe(true)
  })

  it('cardMode=subtitle:长副标题 wrap 截到首行(不溢出卡宽)', () => {
    // 回归:subtitle 渲染曾走单行 fillText 不 wrap,subtitleOf 截 60 字 → 窄卡横溢出。
    // mock ctx 每字 7px,卡宽 240 -> wrap 宽 220 -> 31 字/行。50 字副标题应截到 31 字。
    const ctx = mockCtx()
    const els: CanvasElement[] = [{ id: 'c1', kind: 'card', x: 0, y: 0, w: 240, h: 200, rotation: 0 }]
    renderElements(
      ctx, els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }, 800, 600,
      () => ({ title: 'T', body: 'body', type: 'note', pinned: false, subtitle: 's'.repeat(50) }),
      '#0f172a', domTokenResolver, els, 'subtitle',
    )
    // 首行 = 31 字(wrap 截断),不是全长 50 字(溢出)
    expect(ctx._calls.some((c) => c.startsWith(`fillText(${'s'.repeat(31)}@`))).toBe(true)
    expect(ctx._calls.some((c) => c.startsWith(`fillText(${'s'.repeat(50)}@`))).toBe(false)
  })

  it('cardMode=compact:3 body 行截断(4 wrapped -> 3;总 5 fillText)', () => {
    const ft = cardCalls('compact')
    expect(ft.length).toBe(5) // type + title + 3 body
  })

  it('cardMode=auto:全部 wrapped 行(4 行;总 6 fillText)', () => {
    const ft = cardCalls('auto')
    expect(ft.length).toBe(6) // type + title + 4 body
  })

  it('renders readable card text instead of Markdown source markers', () => {
    const ctx = mockCtx()
    const els: CanvasElement[] = [{ id: 'c1', kind: 'card', x: 0, y: 0, w: 240, h: 160, rotation: 0 }]
    renderElements(
      ctx, els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }, 800, 600,
      () => ({ title: 'T', body: '###Heading\n- **First**\n[Second](https://example.com)', type: 'note', pinned: false }),
      '#ffffff', domTokenResolver, els, 'compact',
    )
    const text = ctx._calls.filter((call) => call.startsWith('fillText')).join('\n')
    expect(text).toContain('fillText(Heading@')
    expect(text).toContain('fillText(First@')
    expect(text).toContain('fillText(Second@')
    expect(text).not.toContain('###')
    expect(text).not.toContain('**')
    expect(text).not.toContain('https://')
  })

  it('draws a freedraw stroke as a smoothed bézier (not a bare polyline)', () => {
    const ctx = mockCtx()
    const els = [
      {
        id: 'f1', kind: 'freedraw', x: 10, y: 10, w: 30, h: 40, rotation: 0,
        meta: { points: [[10, 10], [40, 50], [10, 50]] },
      },
    ] as unknown as CanvasElement[]
    renderElements(ctx, els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }, 800, 600, () => null, '#ffffff')
    // 平滑:moveTo 首点 + 2 段 bezierCurveTo(3 点 → 2 段),不再用 lineTo 连折线。
    expect(ctx._calls).toContain('moveTo(10,10)')
    expect(ctx._calls.filter((c) => c.startsWith('bezierCurveTo')).length).toBe(2)
    expect(ctx._calls.some((c) => c.startsWith('lineTo'))).toBe(false)
  })

  it('freedraw with no points draws nothing (no throw)', () => {
    const ctx = mockCtx()
    const els = [{ id: 'f2', kind: 'freedraw', x: 0, y: 0, w: 0, h: 0, rotation: 0, meta: {} }] as unknown as CanvasElement[]
    expect(() => renderElements(ctx, els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }, 800, 600, () => null, '#ffffff')).not.toThrow()
    expect(ctx._calls.some((c) => c.startsWith('moveTo'))).toBe(false)
  })

  it('freedraw 单点 → 画小圆点(arc + fill),不再不可见幽灵(L1)', () => {
    // 单点 freedraw(commitFreedraw 一点:bbox 退化 w=0,h=0)此前只 moveTo 无 lineTo
    // → stroke() 画不出任何东西 = 不可见幽灵。修法:单点画 arc 圆点 + fill。
    // 与 SVG 导出(单点 → <circle>)两视图一致。
    const ctx = mockCtx()
    const els = [
      {
        id: 'f3', kind: 'freedraw', x: 50, y: 50, w: 0, h: 0, rotation: 0,
        meta: { points: [[50, 50]] },
      },
    ] as unknown as CanvasElement[]
    renderElements(ctx, els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }, 800, 600, () => null, '#ffffff')
    // 单点用 arc 画圆点 + fill(不是 stroke)
    expect(ctx._calls.some((c) => c.startsWith('arc(50,50,'))).toBe(true)
    expect(ctx._calls).toContain('fill')
  })

  it('renders an arrow as a line + arrowhead between two cards (border endpoints)', () => {
    const ctx = mockCtx()
    const els = [
      { id: 'ca', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 },
      { id: 'cb', kind: 'card', x: 200, y: 0, w: 100, h: 100, rotation: 0 },
      { id: 'ar', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'ca', to: 'cb', text: 'rel' },
    ] as unknown as CanvasElement[]
    renderElements(ctx, els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }, 800, 600, () => null, '#ffffff')
    // from=(100,50) → to=(200,50):主线
    expect(ctx._calls).toContain('moveTo(100,50)')
    expect(ctx._calls).toContain('lineTo(200,50)')
    // label 画在中点 (150,50)
    expect(ctx._calls.some((c) => c.startsWith('fillText(rel@150,50)'))).toBe(true)
    // halo 半透明底条先于 label 文字(measure 'rel'@7px=21 → fillRect(150-6,50-3,21+12,12+6))
    expect(ctx._calls).toContain('fillStyle=#ffffff')
    expect(ctx._calls).toContain('fillRect(144,47,33,18)')
    const haloIdx = ctx._calls.indexOf('fillRect(144,47,33,18)')
    const labelIdx = ctx._calls.findIndex((c) => c.startsWith('fillText(rel@150,50)'))
    expect(labelIdx).toBeGreaterThan(haloIdx) // 底条先于文字
  })

  it('renders an arrow with dashed line + triangle head (语义签名)', () => {
    const ctx = mockCtx()
    const els = [
      { id: 'ca', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 },
      { id: 'cb', kind: 'card', x: 200, y: 0, w: 100, h: 100, rotation: 0 },
      { id: 'ar', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'ca', to: 'cb', dash: 'dashed', arrowhead: 'triangle' },
    ] as unknown as CanvasElement[]
    renderElements(ctx, els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }, 800, 600, () => null, '#ffffff')
    expect(ctx._calls).toContain('setLineDash(8,6)') // dashed → [8,6]
    expect(ctx._calls).toContain('setLineDash()') // 复位免污染
    expect(ctx._calls).toContain('closePath') // triangle 闭合填充
  })

  it('renders an arrow with arrowhead=none (无箭头头,只画线)', () => {
    const ctx = mockCtx()
    const els = [
      { id: 'ca', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 },
      { id: 'cb', kind: 'card', x: 200, y: 0, w: 100, h: 100, rotation: 0 },
      { id: 'ar', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'ca', to: 'cb', arrowhead: 'none' },
    ] as unknown as CanvasElement[]
    renderElements(ctx, els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }, 800, 600, () => null, '#ffffff')
    expect(ctx._calls).toContain('moveTo(100,50)') // 主线还在
    expect(ctx._calls).not.toContain('closePath') // 无三角填充
  })

  it('arrow with missing endpoint draws nothing (no throw)', () => {
    const ctx = mockCtx()
    const els = [
      { id: 'ca', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 },
      { id: 'ar', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'ca', to: 'ghost' },
    ] as unknown as CanvasElement[]
    expect(() => renderElements(ctx, els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }, 800, 600, () => null, '#ffffff')).not.toThrow()
    // 不画 arrow 主线(没有 (100,50) 那种)— 只检查没有 moveTo(100,50)
    expect(ctx._calls.some((c) => c === 'moveTo(100,50)')).toBe(false)
  })

  it('route=elbow 折线:moveTo from → lineTo 折点 → lineTo to(每段)', () => {
    const ctx = mockCtx()
    const els = [
      { id: 'ca', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 },
      { id: 'cb', kind: 'card', x: 200, y: 200, w: 100, h: 100, rotation: 0 },
      { id: 'ar', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'ca', to: 'cb', route: 'elbow', elbow: [{ x: 150, y: 100 }] },
    ] as unknown as CanvasElement[]
    renderElements(ctx, els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }, 800, 600, () => null, '#ffffff')
    // A 中心(50,50) 朝 B 中心(250,250):dx=dy=200 → tX=tY=0.25 → from=(100,100)
    expect(ctx._calls).toContain('moveTo(100,100)')
    // 折点(150,100)被 lineTo(核心:折线不是直线)
    expect(ctx._calls).toContain('lineTo(150,100)')
    // 最后段:to = B 朝 A 边框交点;borderPoint((250,250),50,50,(50,50))= (200,200)
    expect(ctx._calls).toContain('lineTo(200,200)')
  })

  it('route=straight 但有残留 curve 数据 → 画直线(不画贝塞尔)', () => {
    const ctx = mockCtx()
    const els = [
      { id: 'ca', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 },
      { id: 'cb', kind: 'card', x: 200, y: 0, w: 100, h: 100, rotation: 0 },
      { id: 'ar', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'ca', to: 'cb', route: 'straight', curve: { cx: 150, cy: -50 } },
    ] as unknown as CanvasElement[]
    renderElements(ctx, els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }, 800, 600, () => null, '#ffffff')
    // 直线:lineTo(200,50),没有 quadraticCurveTo(route=straight 优先)
    expect(ctx._calls).toContain('lineTo(200,50)')
    expect(ctx._calls.some((c) => c.startsWith('quadraticCurveTo'))).toBe(false)
  })

  it('renders text (multi-line, top baseline)', () => {
    const ctx = mockCtx()
    const els = [
      { id: 't1', kind: 'text', x: 10, y: 20, w: 100, h: 36, rotation: 0, text: 'hello\nworld' },
    ] as unknown as CanvasElement[]
    renderElements(ctx, els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }, 800, 600, () => null, '#ffffff')
    // 行 1 @ y=20,行 2 @ y=20+18=38
    expect(ctx._calls).toContain('fillText(hello@10,20)')
    expect(ctx._calls).toContain('fillText(world@10,38)')
    // halo:2 行底条(measure 'hello'/'world'@7px=35 → fillRect(10-6,20-3,35+12,2*18+6))
    expect(ctx._calls).toContain('fillRect(4,17,47,42)')
    const haloIdx = ctx._calls.indexOf('fillRect(4,17,47,42)')
    expect(ctx._calls.findIndex((c) => c.startsWith('fillText(hello@10,20)'))).toBeGreaterThan(haloIdx)
  })

  it('text halo 高度随行数缩放(3 行 → height = 3*18+6)', () => {
    const ctx = mockCtx()
    const els = [
      { id: 't1', kind: 'text', x: 0, y: 0, w: 100, h: 60, rotation: 0, text: 'a\nb\nc' },
    ] as unknown as CanvasElement[]
    renderElements(ctx, els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }, 800, 600, () => null, '#ffffff')
    // measure 'a'/'b'/'c'@7px=7 → width=7+12=19;height=3*18+6=60
    expect(ctx._calls).toContain('fillRect(-6,-3,19,60)')
  })

  it('text with empty string draws nothing (no throw)', () => {
    const ctx = mockCtx()
    const els = [{ id: 't2', kind: 'text', x: 0, y: 0, w: 1, h: 1, rotation: 0, text: '' }] as unknown as CanvasElement[]
    expect(() => renderElements(ctx, els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }, 800, 600, () => null, '#ffffff')).not.toThrow()
    expect(ctx._calls.some((c) => c.startsWith('fillText'))).toBe(false)
  })

  it('card 渲染:类型标 + title + body + pinned(对齐 card-shape-util)', () => {
    const ctx = mockCtx()
    const els = [
      { id: 'c1', kind: 'card', x: 0, y: 0, w: 240, h: 120, rotation: 0 },
    ] as unknown as CanvasElement[]
    const info = (id: string) =>
      id === 'c1'
        ? { title: 'My Card', body: 'body line', type: 'note', pinned: true }
        : null
    renderElements(ctx, els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }, 800, 600, info as never, '#ffffff')
    // 类型标 @ (10, 10);title @ (10, 26);body @ (10, 48);pinned ★ @ 右上
    expect(ctx._calls.some((c) => c.startsWith('fillText(NOTE@'))).toBe(true)
    expect(ctx._calls.some((c) => c.startsWith('fillText(My Card@'))).toBe(true)
    expect(ctx._calls.some((c) => c.startsWith('fillText(body line@'))).toBe(true)
    expect(ctx._calls.some((c) => c.startsWith('fillText(★@'))).toBe(true)
  })

  it('card with missing info draws placeholder (no throw)', () => {
    const ctx = mockCtx()
    const els = [{ id: 'ghost', kind: 'card', x: 0, y: 0, w: 240, h: 120, rotation: 0 }] as unknown as CanvasElement[]
    expect(() =>
      renderElements(ctx, els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }, 800, 600, () => null, '#ffffff'),
    ).not.toThrow()
    expect(ctx._calls.some((c) => c.startsWith('fillText((untitled)@'))).toBe(true)
  })
})

// ─── 回归:关系箭头高倍放大消失 ───────────────────────────────────────────
// 视锥剔除(getVisibleElements)会丢掉屏外的端点 card,但保留 bbox=w=h=0 的关系
// 箭头。若 renderElements 用「被剔除后的列表」resolve 端点,from/to 的 card find
// 不到 → arrowEndpoints 返 null → drawElement 早退 → 箭头凭空消失。
// 修复:renderElements 接收独立的 allForResolution(全集)用于端点解析,与「要画
// 哪些」(toDraw)解耦。以下验证该解耦成立。
describe('回归:关系箭头端点解析脱离视锥剔除列表', () => {
  const view: CanvasView = { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }
  // 两张卡 + 一条关系箭头:A(0..100) → B(1000..1100),箭头 bbox w=h=0。
  const fullSet: CanvasElement[] = [
    { id: 'A', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 },
    { id: 'B', kind: 'card', x: 1000, y: 0, w: 100, h: 100, rotation: 0 },
    { id: 'ar', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'A', to: 'B' },
  ] as unknown as CanvasElement[]
  const arrow = fullSet[2]!

  it('arrowEndpoints 用全集时能解析出非空 from/to', () => {
    const { from, to } = arrowEndpoints(arrow, fullSet)
    expect(from).not.toBeNull()
    expect(to).not.toBeNull()
  })

  it('arrowEndpoints 用被剔除后的子集(端点 card 缺失)→ from/to=null(复现根因)', () => {
    // 模拟「两端点 card 都被视锥剔除」:只剩箭头自己。
    const culled = [arrow]
    const { from, to } = arrowEndpoints(arrow, culled)
    expect(from).toBeNull()
    expect(to).toBeNull()
  })

  it('视锥剔除保留关系箭头但丢端点 card(复现 cull 场景)', () => {
    // 高倍放大到画面中间:视口框(10000..10800)只盖住箭头线段中段,两端的 A/B 都在屏外。
    // 关系箭头(from/to 非空)被 getVisibleElements 无条件保留;A/B 的 bbox 与视口不相交 → 被剔除。
    const vp = { x: 10000, y: -100, w: 800, h: 600 }
    const visible = fullSet.filter(
      (el) => (el.kind === 'arrow' && el.from && el.to) || intersectsBounds(normalizeBox(el), vp),
    )
    expect(visible.map((e) => e.id)).toEqual(['ar'])
    expect(visible.some((e) => e.id === 'A' || e.id === 'B')).toBe(false)
  })

  it('renderElements(toDraw=[arrow], allForResolution=fullSet) → 仍画出箭头主线(修复成立)', () => {
    const ctx = mockCtx()
    // toDraw = 视锥剔除后的列表(只有箭头);allForResolution = 全集(含 A/B)。
    renderElements(ctx, [arrow], view, 800, 600, () => null, '#ffffff', domTokenResolver, fullSet)
    // A 中心 (50,50) 朝 B:from=(100,50);B 中心 (1050,50) 朝 A:to=(1000,50)。
    expect(ctx._calls).toContain('moveTo(100,50)')
    expect(ctx._calls).toContain('lineTo(1000,50)')
  })

  it('renderElements 未传 allForResolution → 默认用 toDraw(向后兼容:全集自解析)', () => {
    const ctx = mockCtx()
    // 旧行为:不传第 9 参,allForResolution 默认 = toDraw。全集场景箭头照常 resolve。
    renderElements(ctx, fullSet, view, 800, 600, () => null, '#ffffff')
    expect(ctx._calls).toContain('moveTo(100,50)')
    expect(ctx._calls).toContain('lineTo(1000,50)')
  })
})

describe('drawSelectionOutlines', () => {
  it('draws a dashed rect only around selected elements', () => {
    const ctx = mockCtx()
    const els = [
      { id: 'c1', kind: 'card', x: 10, y: 20, w: 100, h: 60, rotation: 0 },
      { id: 'c2', kind: 'card', x: 200, y: 0, w: 100, h: 60, rotation: 0 },
    ] as unknown as CanvasElement[]
    drawSelectionOutlines(ctx, ['c1'], els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' })
    // 只画 c1 的框(c1 外扩 2px:strokeRect(8,18,104,64));c2 不画
    expect(ctx._calls).toContain('strokeRect(8,18,104,64)')
    expect(ctx._calls.some((c) => c.startsWith('strokeRect(198'))).toBe(false)
    expect(ctx._calls.some((c) => c.startsWith('setLineDash'))).toBe(true)
  })

  it('draws handle squares at the 4 corners of selected elements', () => {
    const ctx = mockCtx()
    const els = [{ id: 'c1', kind: 'card', x: 10, y: 20, w: 100, h: 60, rotation: 0 }] as unknown as CanvasElement[]
    drawSelectionOutlines(ctx, ['c1'], els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' })
    // handle hs=3(zoom1):nw(10,20)→ fillRect(7,17,6,6);se(110,80)→ fillRect(107,77,6,6)
    expect(ctx._calls).toContain('fillRect(7,17,6,6)')
    expect(ctx._calls).toContain('fillRect(107,77,6,6)')
    // ne(110,20)→ strokeRect(107,17,6,6);sw(10,80)→ strokeRect(7,77,6,6)
    expect(ctx._calls).toContain('strokeRect(107,17,6,6)')
    expect(ctx._calls).toContain('strokeRect(7,77,6,6)')
  })

  it('with empty selection draws nothing', () => {
    const ctx = mockCtx()
    drawSelectionOutlines(ctx, [], [], { panX: 0, panY: 0, zoom: 1, gridMode: 'free' })
    expect(ctx._calls.some((c) => c.startsWith('strokeRect'))).toBe(false)
  })

  it('选中 straight 箭头 → 画中点圆点手柄(提示可拖出 curve)', () => {
    const ctx = mockCtx()
    const els = [
      { id: 'ca', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 },
      { id: 'cb', kind: 'card', x: 200, y: 0, w: 100, h: 100, rotation: 0 },
      { id: 'ar', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'ca', to: 'cb' },
    ] as unknown as CanvasElement[]
    drawSelectionOutlines(ctx, ['ar'], els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' })
    // from=(100,50)→to=(200,50),中点 (150,50):arc 圆点手柄
    expect(ctx._calls.some((c) => c.startsWith('arc(150,50'))).toBe(true)
  })

  it('选中 elbow 箭头 → 每个折点画方块手柄', () => {
    const ctx = mockCtx()
    const els = [
      { id: 'ca', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 },
      { id: 'cb', kind: 'card', x: 300, y: 200, w: 100, h: 100, rotation: 0 },
      { id: 'ar', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'ca', to: 'cb', route: 'elbow', elbow: [{ x: 250, y: 50 }, { x: 250, y: 200 }] },
    ] as unknown as CanvasElement[]
    drawSelectionOutlines(ctx, ['ar'], els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' })
    // 折点 (250,50) 方块手柄:hs=3 → fillRect(247,47,6,6)
    expect(ctx._calls).toContain('fillRect(247,47,6,6)')
    // 折点 (250,200) → fillRect(247,197,6,6)
    expect(ctx._calls).toContain('fillRect(247,197,6,6)')
    // elbow 不画中点圆点(走折点手柄分支)
    expect(ctx._calls.some((c) => c.startsWith('arc'))).toBe(false)
  })

  it('arrow + text 同选 → text 选中框仍虚线(箭头分支不复位 dash 的 bug 修)', () => {
    // text 在 arrow 之上层(KIND_LAYER 4>3),drawSelectionOutlines 按 z 序迭代:
    // arrow 先画手柄(setLineDash([]) 实线),text 后画选中框(应虚线)。
    // 旧实现 arrow 分支不复位 dash → text 选中框画成实线。
    const ctx = mockCtx()
    const els = [
      { id: 'ca', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 },
      { id: 'cb', kind: 'card', x: 200, y: 0, w: 100, h: 100, rotation: 0 },
      { id: 'ar', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'ca', to: 'cb' },
      { id: 't1', kind: 'text', x: 500, y: 500, w: 80, h: 20, rotation: 0, text: 'note' },
    ] as unknown as CanvasElement[]
    drawSelectionOutlines(ctx, ['ar', 't1'], els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' })
    // text 选中框 strokeRect(498,498,84,24)(外扩 2px)
    const textBoxIdx = ctx._calls.findIndex((c) => c === 'strokeRect(498,498,84,24)')
    expect(textBoxIdx).toBeGreaterThanOrEqual(0)
    // 该框之前最后一个 setLineDash 应是虚线(6,4),不是箭头手柄留下的实线()
    let lastDash = ''
    for (let i = textBoxIdx - 1; i >= 0; i--) {
      if (ctx._calls[i]!.startsWith('setLineDash')) { lastDash = ctx._calls[i]!; break }
    }
    expect(lastDash).toBe('setLineDash(6,4)')
  })
})

describe('drawMarquee', () => {
  it('draws a dashed semi-transparent rect', () => {
    const ctx = mockCtx()
    drawMarquee(ctx, { x: 10, y: 20, w: 100, h: 60 }, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' })
    expect(ctx._calls.some((c) => c.startsWith('fillRect(10,20,100,60)'))).toBe(true)
    expect(ctx._calls.some((c) => c.startsWith('strokeRect(10,20,100,60)'))).toBe(true)
    expect(ctx._calls.some((c) => c.startsWith('setLineDash'))).toBe(true)
  })
})

/**
 * 注入测试:证明 renderElements / drawSelectionOutlines / drawMarquee / colorOf
 * 接受自定义 tokenResolver 并实际使用它(默认 = domTokenResolver,行为不变)。
 * 这是「引擎解耦 cys-stift token 体系」的新能力回归保护。
 */
describe('tokenResolver 注入(引擎解耦)', () => {
  /** stub resolver:回显 token 名(像 self-built-color.test 那样 stub getComputedStyle)。 */
  const echo: (name: string, fb: string) => string = (name, fb) => name || fb

  it('renderElements 传 mock tokenResolver → fillStyle/strokeStyle 含 token 名', () => {
    const ctx = mockCtx()
    const els: CanvasElement[] = [
      { id: 'c1', kind: 'card', x: 0, y: 0, w: 240, h: 120, rotation: 0 },
    ] as unknown as CanvasElement[]
    renderElements(
      ctx,
      els,
      { panX: 0, panY: 0, zoom: 1, gridMode: 'free' },
      800,
      600,
      () => null,
      'transparent',
      echo,
    )
    // 卡片分支用了 tokenResolver('--color-white'…) / ('--color-gray'…) → fillStyle 含 token 名
    expect(ctx._calls.some((c) => c === 'fillStyle=--color-white')).toBe(true)
    expect(ctx._calls.some((c) => c === 'strokeStyle=--color-gray')).toBe(true)
  })

  it('drawSelectionOutlines 传 mock tokenResolver → 选中框 strokeStyle 含 token 名', () => {
    const ctx = mockCtx()
    const els = [{ id: 'c1', kind: 'card', x: 10, y: 20, w: 100, h: 60, rotation: 0 }] as unknown as CanvasElement[]
    drawSelectionOutlines(ctx, ['c1'], els, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }, echo)
    expect(ctx._calls.some((c) => c === 'strokeStyle=--color-blue')).toBe(true)
    // handle 白填也来自 tokenResolver
    expect(ctx._calls.some((c) => c === 'fillStyle=--color-white')).toBe(true)
  })

  it('drawMarquee 传 mock tokenResolver → fill/stroke 含 token 名', () => {
    const ctx = mockCtx()
    drawMarquee(ctx, { x: 10, y: 20, w: 100, h: 60 }, { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }, echo)
    expect(ctx._calls.some((c) => c === 'fillStyle=--color-blue')).toBe(true)
    expect(ctx._calls.some((c) => c === 'strokeStyle=--color-blue')).toBe(true)
  })

  it('colorOf 传 mock tokenResolver → 映射 token 经 resolver 返回', () => {
    expect(colorOf('blue', echo)).toBe('--color-blue')
    expect(colorOf('green', echo)).toBe('--color-black') // 未知色回退 black,经 resolver 回显 token 名
  })

  it('默认 tokenResolver = domTokenResolver(不传参数行为不变)', () => {
    expect(domTokenResolver('--color-nonexistent-token', '#deadbe')).toBe('#deadbe') // jsdom 无此 CSS 变量 → fallback
    // 不传 tokenResolver 调 colorOf 也走默认 = domTokenResolver → jsdom 无 --color-blue 变量
    // → 走 colorOf 内部定义的 fallback '#0a0a0a'(= --color-black token 值;注意:不是 #1d4ed8,那是 drawSelectionOutlines 的 fallback)。
    expect(colorOf('blue')).toBe('#0a0a0a')
  })
})
