import { describe, it, expect } from 'vitest'
import {
  unionBounds,
  expandBounds,
  getSafeFileName,
  resolveExportShapes,
} from '../export-bounds'

describe('unionBounds', () => {
  it('returns null for an empty list', () => {
    expect(unionBounds([])).toBeNull()
  })
  it('returns the single box unchanged', () => {
    const b = { x: 1, y: 2, w: 3, h: 4 }
    expect(unionBounds([b])).toEqual(b)
  })
  it('unions overlapping boxes to the outer envelope', () => {
    expect(
      unionBounds([
        { x: 0, y: 0, w: 10, h: 10 },
        { x: 5, y: 5, w: 10, h: 10 },
      ]),
    ).toEqual({ x: 0, y: 0, w: 15, h: 15 })
  })
  it('unions disjoint boxes including the gap', () => {
    expect(
      unionBounds([
        { x: 0, y: 0, w: 2, h: 2 },
        { x: 100, y: 50, w: 2, h: 2 },
      ]),
    ).toEqual({ x: 0, y: 0, w: 102, h: 52 })
  })
})

describe('expandBounds', () => {
  it('adds border symmetrically', () => {
    expect(expandBounds({ x: 10, y: 10, w: 20, h: 20 }, 5)).toEqual({
      x: 5,
      y: 5,
      w: 30,
      h: 30,
    })
  })
  it('adds +5 shadow slack only when border is 0 and shadow is on', () => {
    expect(expandBounds({ x: 0, y: 0, w: 10, h: 10 }, 0, true)).toEqual({
      x: -5,
      y: -5,
      w: 20,
      h: 20,
    })
  })
  it('does NOT add shadow slack when border > 0', () => {
    expect(expandBounds({ x: 0, y: 0, w: 10, h: 10 }, 3, true)).toEqual({
      x: -3,
      y: -3,
      w: 16,
      h: 16,
    })
  })
  it('zero border + shadow off is a no-op', () => {
    const b = { x: 1, y: 2, w: 3, h: 4 }
    expect(expandBounds(b, 0, false)).toEqual(b)
  })
})

describe('getSafeFileName', () => {
  it('falls back when empty', () => {
    expect(getSafeFileName('')).toBe('canvas')
    expect(getSafeFileName('   ', 'card')).toBe('card')
  })
  it('strips reserved filesystem chars', () => {
    expect(getSafeFileName('a/b\\c?d:e*f')).toBe('a-b-c-d-e-f')
  })
  it('defuses Windows reserved names', () => {
    expect(getSafeFileName('CON')).toBe('CON-')
    expect(getSafeFileName('nul.txt')).toBe('nul-.txt')
    expect(getSafeFileName('aux')).toBe('aux-')
  })
  it('preserves the extension', () => {
    expect(getSafeFileName('hello.png')).toBe('hello.png')
    expect(getSafeFileName('con.json')).toBe('con-.json')
  })
  it('caps base length but keeps extension', () => {
    const long = 'x'.repeat(200)
    const out = getSafeFileName(`${long}.png`)
    expect(out.endsWith('.png')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(50)
    expect(out.length).toBe(50) // 46 base + 4 ext
  })
  it('trims trailing dots and spaces', () => {
    expect(getSafeFileName('name..  ')).toBe('name')
  })
})

describe('resolveExportShapes', () => {
  const mkEditor = (selected: string[], page: string[]) => ({
    getSelectedShapes: () => selected.map((id) => ({ id })),
    getCurrentPageShapes: () => page.map((id) => ({ id })),
  })

  it('selection scope returns selected shape ids when some are selected', () => {
    const e = mkEditor(['a', 'b'], ['a', 'b', 'c'])
    expect(resolveExportShapes(e, 'selection')).toEqual(['a', 'b'])
  })
  it('selection scope falls back to all page shapes when nothing is selected', () => {
    const e = mkEditor([], ['a', 'b', 'c'])
    expect(resolveExportShapes(e, 'selection')).toEqual(['a', 'b', 'c'])
  })
  it('diagram scope returns all page shapes regardless of selection', () => {
    const e = mkEditor(['a'], ['a', 'b', 'c'])
    expect(resolveExportShapes(e, 'diagram')).toEqual(['a', 'b', 'c'])
  })
  it('page scope returns all page shapes', () => {
    const e = mkEditor(['a'], ['a', 'b'])
    expect(resolveExportShapes(e, 'page')).toEqual(['a', 'b'])
  })
})
