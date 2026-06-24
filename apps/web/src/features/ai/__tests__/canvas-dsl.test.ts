import { describe, expect, it } from 'vitest'
import { serializeCanvas } from '../canvas-dsl'
import { parseDsl } from '../dsl-parser'
import type { CanvasElement } from '@cys-stift/canvas-engine'

describe('serializeCanvas — active kinds', () => {
  it('emits card with pos + size + color', () => {
    const out = serializeCanvas([
      { id: 'c1', kind: 'card', x: 100, y: 200, w: 240, h: 120, rotation: 0, color: 'blue' },
    ])
    expect(out).toBe('[card #c1] @pos(100,200) @size(240,120) @color(blue)')
  })

  it('emits rect / text / arrow', () => {
    const out = serializeCanvas([
      { id: 'r1', kind: 'rect', x: 10, y: 20, w: 300, h: 400, rotation: 0, color: 'red' },
      { id: 't1', kind: 'text', x: 5, y: 6, w: 0, h: 0, rotation: 0, text: 'hello' },
      { id: 'a1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'c1', to: 'r1', text: 'ref' },
    ])
    expect(out).toContain('[rect #r1] @pos(10,20) @size(300,400) @color(red)')
    expect(out).toContain('[text #t1] @pos(5,6) @text("hello")')
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
    expect(out).toContain('[arrow #fa1] @pos(10,20) @size(100,50)')
    expect(out).not.toContain('from #')
    expect(out).not.toContain('to #')
  })

  it('serializes free arrow with negative size (direction)', () => {
    const out = serializeCanvas([
      { id: 'fa2', kind: 'arrow', x: 10, y: 20, w: -80, h: 30, rotation: 0 },
    ])
    expect(out).toContain('@size(-80,30)')
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
    expect(out).toContain('[text #t1] @pos(5,6) @text("hi") @color(red)')
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
    expect(out).toContain('[freedraw #f1] @pos(5,6)')
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
