import { describe, it, expect } from 'vitest'
import { parseDsl, type DslOp } from '../dsl-parser'

describe('parseDsl', () => {
  it('parses a card positioning directive', () => {
    const result = parseDsl('[card #abc123] @pos(300, 400) @color(red)')
    expect(result).toHaveLength(1)
    const op = result[0]!
    expect(op.type).toBe('card')
    if (op.type === 'card') {
      expect(op.cardId).toBe('abc123')
      expect(op.x).toBe(300)
      expect(op.y).toBe(400)
      expect(op.color).toBe('red')
    }
  })

  it('parses a card without color', () => {
    const result = parseDsl('[card #xyz] @pos(100, 200)')
    expect(result).toHaveLength(1)
    const op = result[0]!
    expect(op.type).toBe('card')
    if (op.type === 'card') {
      expect(op.x).toBe(100)
      expect(op.y).toBe(200)
      expect(op.color).toBeUndefined()
    }
  })

  it('parses an arrow directive with label', () => {
    const result = parseDsl(
      '[arrow #arr1] from #a to #b @label("references") @color(blue)',
    )
    expect(result).toHaveLength(1)
    const op = result[0]!
    expect(op.type).toBe('arrow')
    if (op.type === 'arrow') {
      expect(op.from).toBe('a')
      expect(op.to).toBe('b')
      expect(op.label).toBe('references')
      expect(op.color).toBe('blue')
    }
  })

  it('parses a rect shape via the unified grammar', () => {
    const result = parseDsl('[rect #r1] @pos(100, 200) @size(300, 400) @color(red)')
    expect(result).toHaveLength(1)
    const op = result[0]!
    expect(op.type).toBe('free')
    if (op.type === 'free') {
      expect(op.shape).toBe('rect')
      expect(op.x).toBe(100)
      expect(op.y).toBe(200)
      expect(op.w).toBe(300)
      expect(op.h).toBe(400)
      expect(op.color).toBe('red')
    }
  })

  it('parses multiple directives from one block', () => {
    const dsl = `[card #a1] @pos(100, 200) @color(blue)
[card #a2] @pos(300, 400) @color(red)
[arrow #arr1] from #a1 to #a2 @label("blocks")
[rect #r1] @pos(100, 200) @size(300, 400)`
    const result = parseDsl(dsl)
    expect(result).toHaveLength(4)
    expect(result[0]?.type).toBe('card')
    expect(result[1]?.type).toBe('card')
    expect(result[2]?.type).toBe('arrow')
    expect(result[3]?.type).toBe('free')
  })

  it('gracefully skips unrecognized lines', () => {
    const result = parseDsl('some random text\n[card #a1] @pos(1, 2)\ngarbage')
    expect(result).toHaveLength(1)
    expect(result[0]?.type).toBe('card')
  })

  it('gracefully skips card lines without position', () => {
    const result = parseDsl('[card #a1] @color(red)')
    expect(result).toHaveLength(0)
  })

  it('returns empty array for empty input', () => {
    expect(parseDsl('')).toEqual([])
  })

  it('legacy [free: syntax is no longer parsed', () => {
    expect(parseDsl('[free: rect at (100,200) size 300x400]')).toEqual([])
    expect(parseDsl('[free shape: rect at (10, 20) size 100x200]')).toEqual([])
    expect(parseDsl('[free: note at (50, 60)]')).toEqual([])
  })

  // ── arrow relation signature (dash + arrowhead + id) — DSL symmetry fix 1 ──

  it('parses an arrow with id + dash + arrowhead + label + color + endpoints', () => {
    const result = parseDsl(
      '[arrow #arr1] from #a to #b @label("references") @color(blue) @dash(dashed) @arrowhead(triangle)',
    )
    expect(result).toHaveLength(1)
    const op = result[0]!
    if (op.type !== 'arrow') throw new Error('expected arrow op')
    expect(op.id).toBe('arr1')
    expect(op.from).toBe('a')
    expect(op.to).toBe('b')
    expect(op.label).toBe('references')
    expect(op.color).toBe('blue')
    expect(op.dash).toBe('dashed')
    expect(op.arrowhead).toBe('triangle')
  })

  it('parses an arrow with dotted dash + none arrowhead', () => {
    const result = parseDsl('[arrow #arr2] from #a to #b @dash(dotted) @arrowhead(none)')
    const op = result[0]!
    if (op.type !== 'arrow') throw new Error('expected arrow op')
    expect(op.dash).toBe('dotted')
    expect(op.arrowhead).toBe('none')
  })

  it('parses an arrow without dash/arrowhead (backward compat: both undefined)', () => {
    const result = parseDsl('[arrow #arr3] from #a to #b')
    const op = result[0]!
    if (op.type !== 'arrow') throw new Error('expected arrow op')
    expect(op.dash).toBeUndefined()
    expect(op.arrowhead).toBeUndefined()
  })

  // ── card size — DSL symmetry fix 2 ──

  it('parses a card with @size(w,h)', () => {
    const result = parseDsl('[card #abc123] @pos(300, 400) @size(240, 120) @color(blue)')
    expect(result).toHaveLength(1)
    const op = result[0]!
    if (op.type !== 'card') throw new Error('expected card op')
    expect(op.w).toBe(240)
    expect(op.h).toBe(120)
  })

  it('parses a card without @size (w/h undefined)', () => {
    const result = parseDsl('[card #abc123] @pos(300, 400)')
    const op = result[0]!
    if (op.type !== 'card') throw new Error('expected card op')
    expect(op.w).toBeUndefined()
    expect(op.h).toBeUndefined()
  })

  // ── text color — DSL symmetry fix 3 ──

  it('parses a text line with @color', () => {
    const result = parseDsl('[text #t1] @pos(5,6) @text("hello") @color(red)')
    expect(result).toHaveLength(1)
    const op = result[0]!
    if (op.type !== 'free' || op.shape !== 'text') throw new Error('expected free:text op')
    expect(op.color).toBe('red')
    expect(op.text).toBe('hello')
  })
})
