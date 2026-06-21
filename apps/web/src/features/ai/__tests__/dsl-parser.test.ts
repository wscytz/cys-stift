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

  it('parses a free rect shape', () => {
    const result = parseDsl('[free: rect at (100, 200) size 300x400] @color(red)')
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

  it('parses a free note shape', () => {
    const result = parseDsl('[free: note at (50, 60)]')
    expect(result).toHaveLength(1)
    const op = result[0]!
    expect(op.type).toBe('free')
    if (op.type === 'free') {
      expect(op.shape).toBe('note')
      expect(op.x).toBe(50)
      expect(op.y).toBe(60)
    }
  })

  it('parses multiple directives from one block', () => {
    const dsl = `[card #a1] @pos(100, 200) @color(blue)
[card #a2] @pos(300, 400) @color(red)
[arrow #arr1] from #a1 to #a2 @label("blocks")
[free: rect at (100, 200) size 300x400]`
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

  it('parses free shape lines with "free shape:" prefix', () => {
    const result = parseDsl('[free shape: rect at (10, 20) size 100x200]')
    expect(result).toHaveLength(1)
    const op = result[0]!
    expect(op.type).toBe('free')
    if (op.type === 'free') {
      expect(op.shape).toBe('rect')
      expect(op.x).toBe(10)
      expect(op.y).toBe(20)
    }
  })
})
