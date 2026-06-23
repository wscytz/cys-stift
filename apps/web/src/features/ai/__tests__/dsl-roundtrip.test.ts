import { describe, expect, it } from 'vitest'
import { serializeCanvas } from '../canvas-dsl'
import { parseDsl } from '../dsl-parser'
import type { CanvasElement } from '../../canvas/host/canvas-host'

/**
 * Round-trip losslessness suite — the cornerstone of cy's Stift's "translit"
 * (escape) selling point: the canvas is fully textual and any AI must be able
 * to read AND rewrite every geometric kind.
 *
 * Freedraw is intentionally NOT round-tripped (parser has no freedraw branch).
 * This suite guards that design decision — if someone "fixes" it, the
 * freedraw test here will fail loudly.
 */
describe('DSL round-trip (serialize → parse) — lossless on all active kinds', () => {
  const elements: CanvasElement[] = [
    // card with size + color
    {
      id: 'c1',
      kind: 'card',
      x: 100,
      y: 200,
      w: 240,
      h: 120,
      rotation: 0,
      color: 'blue',
    },
    // rect
    {
      id: 'r1',
      kind: 'rect',
      x: 10,
      y: 20,
      w: 300,
      h: 400,
      rotation: 0,
      color: 'red',
    },
    // text with color
    {
      id: 't1',
      kind: 'text',
      x: 5,
      y: 6,
      w: 0,
      h: 0,
      rotation: 0,
      text: 'hello',
      color: 'red',
    },
    // arrow with id + dash + arrowhead + label + color + from + to
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
      text: 'references',
      color: 'red',
      dash: 'dashed',
      arrowhead: 'triangle',
    },
    // freedraw (position only — NOT round-tripped by design)
    {
      id: 'f1',
      kind: 'freedraw',
      x: 7,
      y: 8,
      w: 0,
      h: 0,
      rotation: 0,
      meta: { segments: [{ points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }] },
    },
  ]

  const text = serializeCanvas(elements)

  it('serializes all 5 active kinds (each on its own line)', () => {
    const lines = text.split('\n').filter(Boolean)
    expect(lines).toHaveLength(5)
    expect(text).toContain('[card #c1]')
    expect(text).toContain('[rect #r1]')
    expect(text).toContain('[text #t1]')
    expect(text).toContain('[arrow #a1]')
    expect(text).toContain('[freedraw #f1]')
  })

  it('card round-trips id + pos + size + color', () => {
    const card = parseDsl(text).find((o) => o.type === 'card')
    expect(card).toMatchObject({ cardId: 'c1', x: 100, y: 200, w: 240, h: 120, color: 'blue' })
  })

  it('rect round-trips id + pos + size + color', () => {
    const rect = parseDsl(text).find((o) => o.type === 'free' && o.shape === 'rect')
    expect(rect).toMatchObject({ id: 'r1', x: 10, y: 20, w: 300, h: 400, color: 'red' })
  })

  it('text round-trips id + pos + text + color', () => {
    const t = parseDsl(text).find((o) => o.type === 'free' && o.shape === 'text')
    expect(t).toMatchObject({ id: 't1', x: 5, y: 6, text: 'hello', color: 'red' })
  })

  it('arrow round-trips id + from + to + label + color + dash + arrowhead', () => {
    const arrow = parseDsl(text).find((o) => o.type === 'arrow')
    if (arrow?.type !== 'arrow') throw new Error('expected arrow op')
    expect(arrow.id).toBe('a1')
    expect(arrow.from).toBe('c1')
    expect(arrow.to).toBe('r1')
    expect(arrow.label).toBe('references')
    expect(arrow.color).toBe('red')
    expect(arrow.dash).toBe('dashed')
    expect(arrow.arrowhead).toBe('triangle')
  })

  // ── freedraw: the deliberate asymmetry guard ──

  it('freedraw is serialized (position only) — point sequence stays out of DSL', () => {
    expect(text).toContain('[freedraw #f1] @pos(7,8)')
    expect(text).not.toContain('points')
    expect(text).not.toContain('(1,2)')
  })

  it('freedraw is NOT restored by the parser (by design — no freedraw branch)', () => {
    const ops = parseDsl(text)
    const freedrawOps = ops.filter((o) => o.type === 'free' && (o as { shape?: string }).shape === 'freedraw')
    expect(freedrawOps).toHaveLength(0)
    // 4 ops parsed (card, rect, text, arrow) — freedraw line is dropped.
    expect(ops).toHaveLength(4)
  })
})
