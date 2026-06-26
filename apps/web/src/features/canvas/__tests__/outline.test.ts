import { describe, it, expect } from 'vitest'
import { buildOutline } from '../outline'
import type { CanvasElement } from '@cys-stift/canvas-engine'

function el(
  id: string,
  kind: CanvasElement['kind'],
  extra: Partial<CanvasElement> = {},
): CanvasElement {
  return { id, kind, x: 0, y: 0, w: 100, h: 80, rotation: 0, ...extra }
}

describe('buildOutline', () => {
  it('returns empty array for empty input', () => {
    expect(buildOutline([])).toEqual([])
  })

  it('preserves input order (output order = input order)', () => {
    const els = [
      el('a', 'card'),
      el('b', 'text'),
      el('c', 'rect'),
    ]
    const out = buildOutline(els)
    expect(out.map((o) => o.id)).toEqual(['a', 'b', 'c'])
  })

  describe('card', () => {
    it('label = getCardTitle(id) when provided', () => {
      const out = buildOutline([el('c1', 'card')], (id) =>
        id === 'c1' ? 'My Card' : undefined,
      )
      expect(out[0]).toMatchObject({ id: 'c1', kind: 'card', label: 'My Card' })
      expect(out[0]!.sublabel).toBeUndefined()
    })

    it('falls back to "(untitled)" when no title resolver / title missing', () => {
      const out = buildOutline([el('c1', 'card')])
      expect(out[0]!.label).toBe('(untitled)')
      const out2 = buildOutline(
        [el('c1', 'card')],
        () => undefined,
      )
      expect(out2[0]!.label).toBe('(untitled)')
    })
  })

  describe('text', () => {
    it('label = the text content, truncated to ~40 chars', () => {
      const short = el('t1', 'text', { text: 'Hello world' })
      expect(buildOutline([short])[0]!.label).toBe('Hello world')

      const long = el('t2', 'text', {
        text: 'A'.repeat(100),
      })
      const label = buildOutline([long])[0]!.label
      expect(label.length).toBeLessThanOrEqual(40)
      expect(label.startsWith('A')).toBe(true)
    })

    it('falls back to "(text)" when text is empty/missing', () => {
      expect(buildOutline([el('t1', 'text')])[0]!.label).toBe('(text)')
      expect(
        buildOutline([el('t1', 'text', { text: '' })])[0]!.label,
      ).toBe('(text)')
    })
  })

  describe('arrow', () => {
    it('relation arrow: label from el.text, sublabel = "From → To" when both resolve', () => {
      const a = el('a1', 'arrow', {
        from: 'c1',
        to: 'c2',
        text: 'relates to',
      })
      const titles: Record<string, string> = { c1: 'Alpha', c2: 'Beta' }
      const out = buildOutline(
        [a],
        undefined,
        (id) => titles[id],
      )
      expect(out[0]).toMatchObject({
        id: 'a1',
        kind: 'arrow',
        label: 'relates to',
        sublabel: 'Alpha → Beta',
      })
    })

    it('relation arrow with no label uses the relation text as empty → label is a placeholder', () => {
      const a = el('a1', 'arrow', { from: 'c1', to: 'c2' })
      const out = buildOutline([a], undefined, (id) =>
        id === 'c1' ? 'Alpha' : id === 'c2' ? 'Beta' : undefined,
      )
      // No text label → sublabel still describes the relation; label falls back.
      expect(out[0]!.sublabel).toBe('Alpha → Beta')
    })

    it('sublabel omitted when endpoints do not resolve to titles', () => {
      const a = el('a1', 'arrow', { from: 'c1', to: 'c2', text: 'x' })
      const out = buildOutline([a]) // no getEndpointTitle
      expect(out[0]!.label).toBe('x')
      expect(out[0]!.sublabel).toBeUndefined()
    })

    it('free arrow (no from/to) → label "(free arrow)"', () => {
      const a = el('a1', 'arrow', { w: 50, h: 0 })
      const out = buildOutline([a])
      expect(out[0]!.label).toBe('(free arrow)')
      expect(out[0]!.sublabel).toBeUndefined()
    })
  })

  describe('rect', () => {
    it('label = "(rect)"', () => {
      expect(buildOutline([el('r1', 'rect')])[0]!.label).toBe('(rect)')
    })
  })

  describe('freedraw', () => {
    it('label = "(sketch)" and NEVER includes point data', () => {
      const f = el('f1', 'freedraw', {
        meta: { points: [[1, 2], [3, 4], [5, 6]] },
      })
      const out = buildOutline([f])
      expect(out[0]!.label).toBe('(sketch)')
      // R2 privacy: no point sequence leaks into the outline item.
      expect(JSON.stringify(out[0])).not.toContain('points')
    })
  })

  describe('legacy', () => {
    it('ellipse/note/line/image → kind "legacy", label "(legacy)"', () => {
      for (const k of ['ellipse', 'note', 'line', 'image'] as const) {
        const out = buildOutline([el('x', k)])
        expect(out[0]).toMatchObject({
          kind: 'legacy',
          label: '(legacy)',
        })
      }
    })
  })

  it('mixed canvas: each kind mapped correctly in order', () => {
    const els = [
      el('card1', 'card'),
      el('arrow1', 'arrow', { from: 'card1', to: 'card2', text: 'leads' }),
      el('card2', 'card'),
      el('text1', 'text', { text: 'note' }),
      el('rect1', 'rect'),
      el('free1', 'freedraw'),
      el('ell1', 'ellipse'),
    ]
    const titles: Record<string, string> = {
      card1: 'C1',
      card2: 'C2',
    }
    const out = buildOutline(
      els,
      (id) => titles[id],
      (id) => titles[id],
    )
    expect(out.map((o) => `${o.kind}:${o.label}`)).toEqual([
      'card:C1',
      'arrow:leads',
      'card:C2',
      'text:note',
      'rect:(rect)',
      'freedraw:(sketch)',
      'legacy:(legacy)',
    ])
    // arrow sublabel resolved
    expect(out[1]!.sublabel).toBe('C1 → C2')
  })
})
