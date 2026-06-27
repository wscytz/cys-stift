import { describe, expect, it } from 'vitest'
import { serializeCanvas, serializeCanvasReadable } from '../canvas-dsl'
import { parseDsl } from '../dsl-parser'
import type { CanvasElement } from '@cys-stift/canvas-engine'

describe('serializeCanvas — active kinds', () => {
  it('emits card with pos + size + color', () => {
    const out = serializeCanvas([
      { id: 'c1', kind: 'card', x: 100, y: 200, w: 240, h: 120, rotation: 0, color: 'blue' },
    ])
    expect(out).toBe('[card #c1] @pos(100.0,200.0) @size(240.0,120.0) @color(blue)')
  })

  it('emits rect / text / arrow', () => {
    const out = serializeCanvas([
      { id: 'r1', kind: 'rect', x: 10, y: 20, w: 300, h: 400, rotation: 0, color: 'red' },
      { id: 't1', kind: 'text', x: 5, y: 6, w: 0, h: 0, rotation: 0, text: 'hello' },
      { id: 'a1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'c1', to: 'r1', text: 'ref' },
    ])
    expect(out).toContain('[rect #r1] @pos(10.0,20.0) @size(300.0,400.0) @color(red)')
    expect(out).toContain('[text #t1] @pos(5.0,6.0) @text("hello")')
    expect(out).toContain('[arrow #a1] from #c1 to #r1 @label("ref")')
  })

  it('escapes double-quotes inside text', () => {
    const out = serializeCanvas([
      { id: 't1', kind: 'text', x: 0, y: 0, w: 0, h: 0, rotation: 0, text: 'say "hi"' },
    ])
    expect(out).toContain('@text("say \\"hi\\"")')
  })

  // ── arrow relation signature (dash + arrowhead) — DSL symmetry fix 1 ──

  it('emits arrow dash + arrowhead when present', () => {
    const out = serializeCanvas([
      {
        id: 'a1',
        kind: 'arrow',
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        rotation: 0,
        from: 'c1',
        to: 'r1',
        text: 'ref',
        color: 'red',
        dash: 'dashed',
        arrowhead: 'triangle',
      },
    ])
    expect(out).toContain('[arrow #a1] from #c1 to #r1')
    expect(out).toContain('@label("ref")')
    expect(out).toContain('@color(red)')
    expect(out).toContain('@dash(dashed)')
    expect(out).toContain('@arrowhead(triangle)')
  })

  it('omits arrow dash/arrowhead when absent', () => {
    const out = serializeCanvas([
      { id: 'a1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'c1', to: 'r1' },
    ])
    expect(out).not.toContain('@dash(')
    expect(out).not.toContain('@arrowhead(')
  })

  // ── free arrow (bbox-encoded, no from/to) — Step 2 SIZE_RE negative ──

  it('serializes free arrow with bbox (no from/to)', () => {
    const out = serializeCanvas([
      { id: 'fa1', kind: 'arrow', x: 10, y: 20, w: 100, h: 50, rotation: 0, dash: 'solid', arrowhead: 'arrow' },
    ])
    expect(out).toContain('[arrow #fa1] @pos(10.0,20.0) @size(100.0,50.0)')
    expect(out).not.toContain('from #')
    expect(out).not.toContain('to #')
  })

  it('serializes free arrow with negative size (direction)', () => {
    const out = serializeCanvas([
      { id: 'fa2', kind: 'arrow', x: 10, y: 20, w: -80, h: 30, rotation: 0 },
    ])
    expect(out).toContain('@size(-80.0,30.0)')
  })

  it('serializes relation arrow unchanged', () => {
    const out = serializeCanvas([
      { id: 'ra1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'c1', to: 'c2', text: 'ref' },
    ])
    expect(out).toContain('[arrow #ra1] from #c1 to #c2')
    expect(out).not.toContain('@size(')
  })

  it('serializes free arrow signature (label/color/dash/arrowhead)', () => {
    const out = serializeCanvas([
      {
        id: 'fa3',
        kind: 'arrow',
        x: 10,
        y: 20,
        w: 100,
        h: 50,
        rotation: 0,
        text: 'note',
        color: 'red',
        dash: 'dashed',
        arrowhead: 'triangle',
      },
    ])
    expect(out).toContain('@label("note")')
    expect(out).toContain('@color(red)')
    expect(out).toContain('@dash(dashed)')
    expect(out).toContain('@arrowhead(triangle)')
  })

  // ── text color — DSL symmetry fix 3 ──

  it('emits text @color when present', () => {
    const out = serializeCanvas([
      { id: 't1', kind: 'text', x: 5, y: 6, w: 0, h: 0, rotation: 0, text: 'hi', color: 'red' },
    ])
    expect(out).toContain('[text #t1] @pos(5.0,6.0) @text("hi") @color(red)')
  })

  it('omits text @color when absent', () => {
    const out = serializeCanvas([
      { id: 't1', kind: 'text', x: 5, y: 6, w: 0, h: 0, rotation: 0, text: 'hi' },
    ])
    expect(out).not.toContain('@color(')
  })
})

describe('serializeCanvas — exclusions (R2 + privacy)', () => {
  it('legacy kinds (ellipse/line/note/image) are not serialized', () => {
    const out = serializeCanvas([
      { id: 'e1', kind: 'ellipse', x: 0, y: 0, w: 1, h: 1, rotation: 0 },
      { id: 'l1', kind: 'line', x: 0, y: 0, w: 1, h: 1, rotation: 0 },
      { id: 'n1', kind: 'note', x: 0, y: 0, w: 1, h: 1, rotation: 0, text: 'hi' },
      { id: 'im1', kind: 'image', x: 0, y: 0, w: 1, h: 1, rotation: 0 },
    ])
    expect(out).toBe('')
  })

  it('freedraw emits position only — never the point sequence', () => {
    const out = serializeCanvas([
      {
        id: 'f1',
        kind: 'freedraw',
        x: 5,
        y: 6,
        w: 0,
        h: 0,
        rotation: 0,
        meta: { segments: [{ points: [{ x: 9, y: 9 }, { x: 10, y: 10 }] }] },
      },
    ])
    expect(out).toContain('[freedraw #f1] @pos(5.0,6.0)')
    expect(out).not.toContain('points')
    expect(out).not.toContain('(9,9)')
  })
})

describe('canvas DSL round-trip (serialize → parse)', () => {
  const elements: CanvasElement[] = [
    { id: 'c1', kind: 'card', x: 100, y: 200, w: 240, h: 120, rotation: 0, color: 'blue' },
    { id: 'r1', kind: 'rect', x: 10, y: 20, w: 300, h: 400, rotation: 0, color: 'red' },
    { id: 't1', kind: 'text', x: 5, y: 6, w: 0, h: 0, rotation: 0, text: 'hello' },
    { id: 'a1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'c1', to: 'r1', text: 'ref' },
  ]

  it('card round-trips id + position + color (size is AI context, not actionable)', () => {
    const ops = parseDsl(serializeCanvas(elements))
    const card = ops.find((o) => o.type === 'card')
    expect(card).toMatchObject({ cardId: 'c1', x: 100, y: 200, color: 'blue' })
  })

  it('rect round-trips id + position + size + color', () => {
    const ops = parseDsl(serializeCanvas(elements))
    const rect = ops.find((o) => o.type === 'free' && o.shape === 'rect')
    expect(rect).toMatchObject({ id: 'r1', x: 10, y: 20, w: 300, h: 400, color: 'red' })
  })

  it('text round-trips id + position + text', () => {
    const ops = parseDsl(serializeCanvas(elements))
    const text = ops.find((o) => o.type === 'free' && o.shape === 'text')
    expect(text).toMatchObject({ id: 't1', x: 5, y: 6, text: 'hello' })
  })

  it('arrow round-trips endpoints + label', () => {
    const ops = parseDsl(serializeCanvas(elements))
    const arrow = ops.find((o) => o.type === 'arrow')
    expect(arrow).toMatchObject({ from: 'c1', to: 'r1', label: 'ref' })
  })
})

// ── 箭头路由形态 route/curve/elbow:序列化 + round-trip ──────────────────────
describe('serializeCanvas — arrow route (curve/elbow)', () => {
  it('route=curve 序列化 @route(curve) + @curve', () => {
    const out = serializeCanvas([
      { id: 'a1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'c1', to: 'c2', route: 'curve', curve: { cx: 150, cy: -30 } },
    ])
    expect(out).toContain('@route(curve)')
    expect(out).toContain('@curve(150.0,-30.0)')
  })
  it('route=elbow 序列化 @route(elbow) + @elbow(分号分隔)', () => {
    const out = serializeCanvas([
      { id: 'a1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'c1', to: 'c2', route: 'elbow', elbow: [{ x: 100, y: 50 }, { x: -20, y: 200 }] },
    ])
    expect(out).toContain('@route(elbow)')
    expect(out).toContain('@elbow(100.0,50.0;-20.0,200.0)')
  })
  it('route=straight 序列化 @route(straight)(显式,即便无 curve/elbow)', () => {
    const out = serializeCanvas([
      { id: 'a1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'c1', to: 'c2', route: 'straight' },
    ])
    expect(out).toContain('@route(straight)')
  })
  it('无 route 的旧箭头不输出 @route(向后兼容,不污染直线)', () => {
    const out = serializeCanvas([
      { id: 'a1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'c1', to: 'c2' },
    ])
    expect(out).not.toContain('@route')
  })
})

describe('canvas DSL round-trip — arrow route', () => {
  it('route=curve + @curve round-trips', () => {
    const els: CanvasElement[] = [
      { id: 'c1', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 },
      { id: 'c2', kind: 'card', x: 300, y: 0, w: 100, h: 100, rotation: 0 },
      { id: 'a1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'c1', to: 'c2', route: 'curve', curve: { cx: 200, cy: 80 } },
    ]
    const arrow = parseDsl(serializeCanvas(els)).find((o) => o.type === 'arrow')!
    expect(arrow).toMatchObject({ route: 'curve', curve: { cx: 200, cy: 80 } })
  })
  it('route=elbow + @elbow(2 点)round-trips', () => {
    const els: CanvasElement[] = [
      { id: 'c1', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 },
      { id: 'c2', kind: 'card', x: 300, y: 300, w: 100, h: 100, rotation: 0 },
      { id: 'a1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'c1', to: 'c2', route: 'elbow', elbow: [{ x: 250, y: 50 }, { x: 250, y: 250 }] },
    ]
    const arrow = parseDsl(serializeCanvas(els)).find((o) => o.type === 'arrow')!
    expect(arrow).toMatchObject({ route: 'elbow', elbow: [{ x: 250, y: 50 }, { x: 250, y: 250 }] })
  })
  it('route=straight round-trips', () => {
    const els: CanvasElement[] = [
      { id: 'c1', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 },
      { id: 'c2', kind: 'card', x: 300, y: 0, w: 100, h: 100, rotation: 0 },
      { id: 'a1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'c1', to: 'c2', route: 'straight' },
    ]
    const arrow = parseDsl(serializeCanvas(els)).find((o) => o.type === 'arrow')!
    expect(arrow).toMatchObject({ route: 'straight' })
  })
})

describe('serializeCanvasReadable — card 行后附 title 注释', () => {
  it('card 行后附 # title 注释', () => {
    const elements: CanvasElement[] = [
      { id: 'c1', kind: 'card', x: 100, y: 200, w: 240, h: 120, rotation: 0, color: 'blue' },
    ]
    const out = serializeCanvasReadable(elements, (id) => (id === 'c1' ? 'My Card' : undefined))
    const lines = out.split('\n')
    expect(lines[0]).toBe('[card #c1] @pos(100.0,200.0) @size(240.0,120.0) @color(blue)')
    expect(lines[1]).toBe('  # title: My Card')
  })

  it('无 getCardTitle 时附 (untitled)', () => {
    const elements: CanvasElement[] = [
      { id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 },
    ]
    const out = serializeCanvasReadable(elements)
    expect(out).toContain('  # title: (untitled)')
  })

  it('非 card 元素不附注释', () => {
    const elements: CanvasElement[] = [
      { id: 'r1', kind: 'rect', x: 10, y: 20, w: 300, h: 400, rotation: 0, color: 'red' },
      { id: 't1', kind: 'text', x: 5, y: 6, w: 0, h: 0, rotation: 0, text: 'hello' },
      { id: 'a1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'c1', to: 'r1', text: 'ref' },
      { id: 'f1', kind: 'freedraw', x: 5, y: 6, w: 0, h: 0, rotation: 0 },
    ]
    const out = serializeCanvasReadable(elements, () => 'should-not-appear')
    expect(out).not.toContain('# title:')
  })

  it('多 card 各附自己的 title', () => {
    const elements: CanvasElement[] = [
      { id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 },
      { id: 'c2', kind: 'card', x: 20, y: 20, w: 10, h: 10, rotation: 0 },
    ]
    const out = serializeCanvasReadable(elements, (id) => (id === 'c1' ? 'First' : 'Second'))
    expect(out).toContain('  # title: First')
    expect(out).toContain('  # title: Second')
  })

  it('title 含换行被压平', () => {
    const elements: CanvasElement[] = [
      { id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 },
    ]
    const out = serializeCanvasReadable(elements, () => 'a\nb')
    expect(out).toContain('  # title: a b')
    // 换行被压平 → 注释仍是单行,只产生一行 title 注释。
    expect(out.split('\n').filter((l) => l.includes('# title:'))).toHaveLength(1)
  })

  it('注释行被 parseDsl 跳过(往返不崩)', () => {
    const elements: CanvasElement[] = [
      { id: 'c1', kind: 'card', x: 100, y: 200, w: 240, h: 120, rotation: 0, color: 'blue' },
      { id: 'r1', kind: 'rect', x: 10, y: 20, w: 300, h: 400, rotation: 0, color: 'red' },
      { id: 't1', kind: 'text', x: 5, y: 6, w: 0, h: 0, rotation: 0, text: 'hello' },
      { id: 'a1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'c1', to: 'r1', text: 'ref' },
      { id: 'f1', kind: 'freedraw', x: 5, y: 6, w: 0, h: 0, rotation: 0 },
    ]
    const out = serializeCanvasReadable(elements, (id) => `title-${id}`)
    expect(() => parseDsl(out)).not.toThrow()
    const ops = parseDsl(out)
    // card + rect + text + arrow = 4(freedraw 不被 parse,注释行被跳过)。
    expect(ops).toHaveLength(4)
  })
})
