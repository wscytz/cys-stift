import { describe, expect, it } from 'vitest'
import { serializeCanvas } from '../canvas-dsl'
import { parseDsl } from '../dsl-parser'
import type { CanvasElement } from '@cys-stift/canvas-engine'

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
      meta: { group: 'Q3', href: ['r1'] },
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
      meta: { compute: '#c1.w + 10' },
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
    // free arrow (no from/to; bbox encodes the segment; w negative = direction)
    {
      id: 'fa1',
      kind: 'arrow',
      x: 10,
      y: 20,
      w: 100,
      h: -50,
      rotation: 0,
      dash: 'solid',
      arrowhead: 'arrow',
    },
    // freedraw — 已出 DSL(程序自管):serialize 按 DSL_KINDS 过滤,整元素被丢,不进 text。
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

  it('serializes the 5 DSL elements (freedraw 被过滤掉,不进 text)', () => {
    const lines = text.split('\n').filter(Boolean)
    expect(lines).toHaveLength(5)
    expect(text).toContain('[card #c1]')
    expect(text).toContain('[rect #r1]')
    expect(text).toContain('[text #t1]')
    expect(text).toContain('[arrow #a1]')
    expect(text).toContain('[arrow #fa1]')
    expect(text).not.toContain('[freedraw') // freedraw 出 DSL
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

  it('free arrow round-trips id + pos + size (negative) + signature', () => {
    const fa = parseDsl(text).find((o) => o.type === 'arrow' && o.freeArrow)
    if (fa?.type !== 'arrow') throw new Error('expected free arrow op')
    expect(fa.freeArrow).toBe(true)
    expect(fa.id).toBe('fa1')
    expect(fa.x).toBe(10)
    expect(fa.y).toBe(20)
    expect(fa.w).toBe(100)
    expect(fa.h).toBe(-50)
    expect(fa.dash).toBe('solid')
    expect(fa.arrowhead).toBe('arrow')
  })

  // ── v7: @group / @href / @compute round-trip(状态挂 meta)──

  it('card round-trips v7 @group + @href', () => {
    const card = parseDsl(text).find((o) => o.type === 'card')
    if (card?.type !== 'card') throw new Error('expected card op')
    expect(card.group).toBe('Q3')
    expect(card.href).toEqual(['r1'])
  })

  it('text round-trips v7 @compute formula', () => {
    const t = parseDsl(text).find((o) => o.type === 'free' && o.shape === 'text')
    if (t?.type !== 'free') throw new Error('expected free text op')
    expect(t.compute).toBe('#c1.w + 10')
  })

  // ── freedraw: the deliberate asymmetry guard ──

  it('freedraw 出 DSL:serialize 整元素被丢,点序列/位置都不进 text', () => {
    expect(text).not.toContain('[freedraw')
    expect(text).not.toContain('points')
    expect(text).not.toContain('(7.0,8.0)') // 连 freedraw 的位置都不发
  })

  it('freedraw is NOT restored by the parser (by design — 出 DSL,程序自管)', () => {
    const ops = parseDsl(text)
    const freedrawOps = ops.filter((o) => o.type === 'free' && (o as { shape?: string }).shape === 'freedraw')
    expect(freedrawOps).toHaveLength(0)
    // 5 ops parsed (card, rect, text, relation arrow, free arrow) — freedraw 不在 text。
    expect(ops).toHaveLength(5)
  })

  describe('decimal coordinate support', () => {
    it('round-trips decimal coordinates (100.5, 200.5)', () => {
      const elements: CanvasElement[] = [
        {
          id: 'decimal-card',
          kind: 'card',
          x: 100.5,
          y: 200.5,
          w: 240.0,
          h: 120.5,
          rotation: 0,
          color: 'blue',
        },
      ]
      const text = serializeCanvas(elements)
      const card = parseDsl(text).find((o) => o.type === 'card')
      expect(card).toMatchObject({
        cardId: 'decimal-card',
        x: 100.5,
        y: 200.5,
        w: 240.0,
        h: 120.5,
        color: 'blue',
      })
    })

    it('round-trips negative decimal coordinates (-100.5, -200.5)', () => {
      const elements: CanvasElement[] = [
        {
          id: 'neg-decimal',
          kind: 'rect',
          x: -100.5,
          y: -200.5,
          w: 100.0,
          h: 100.0,
          rotation: 0,
        },
      ]
      const text = serializeCanvas(elements)
      const rect = parseDsl(text).find((o) => o.type === 'free' && o.shape === 'rect')
      expect(rect).toMatchObject({
        id: 'neg-decimal',
        x: -100.5,
        y: -200.5,
        w: 100.0,
        h: 100.0,
      })
    })

    it('round-trips arrow with curve and elbow decimal points', () => {
      const elements: CanvasElement[] = [
        {
          id: 'arrow-decimal',
          kind: 'arrow',
          x: 10.5,
          y: 20.5,
          w: 100.5,
          h: -50.5,
          rotation: 0,
          curve: { cx: 55.5, cy: 33.3 },
          elbow: [
            { x: 10.0, y: 20.5 },
            { x: 30.5, y: 40.0 },
          ],
        },
      ]
      const text = serializeCanvas(elements)
      const arrow = parseDsl(text).find((o) => o.type === 'arrow' && o.freeArrow)
      if (arrow?.type !== 'arrow') throw new Error('expected arrow op')
      expect(arrow.freeArrow).toBe(true)
      expect(arrow.x).toBe(10.5)
      expect(arrow.y).toBe(20.5)
      expect(arrow.w).toBe(100.5)
      expect(arrow.h).toBe(-50.5)
      expect(arrow.curve).toEqual({ cx: 55.5, cy: 33.3 })
      expect(arrow.elbow).toEqual([
        { x: 10.0, y: 20.5 },
        { x: 30.5, y: 40.0 },
      ])
    })

    it('still parses old-style integer DSL (backward compatibility)', () => {
      const dsl = '[card #old-card] @pos(100, 200) @size(240, 120) @color(red)'
      const card = parseDsl(dsl).find((o) => o.type === 'card')
      expect(card).toMatchObject({
        cardId: 'old-card',
        x: 100,
        y: 200,
        w: 240,
        h: 120,
        color: 'red',
      })
    })
  })
})
