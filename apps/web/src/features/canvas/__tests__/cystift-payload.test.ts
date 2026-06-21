import { describe, it, expect } from 'vitest'
import {
  embedCystiftInSvg,
  extractCystiftFromSvg,
} from '../cystift-payload'
import type { CystiftPayload } from '../cystift-payload'

const SAMPLE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50"/></svg>'

const PAYLOAD: CystiftPayload = {
  v: 1,
  app: 'cys-stift',
  canvas: { id: 'canvas-x', name: '灵感画布' },
  cards: [
    {
      id: 'card-1' as never,
      title: '标题',
      body: '正文',
      type: 'note',
      media: [],
      links: [],
      codeSnippets: [],
      quotes: [],
      source: { kind: 'manual', deviceId: 'dev' } as never,
      capturedAt: new Date('2026-06-21T00:00:00Z'),
      createdAt: new Date('2026-06-21T00:00:00Z'),
      updatedAt: new Date('2026-06-21T00:00:00Z'),
      pinned: false,
      archived: false,
    },
  ],
  snapshot: { schema: 1, store: {} },
}

describe('.cystift SVG roundtrip (data-cystift attribute)', () => {
  it('embeds a payload as data-cystift on the root <svg>', () => {
    const out = embedCystiftInSvg(SAMPLE_SVG, PAYLOAD)
    expect(out.startsWith('<svg')).toBe(true)
    expect(out).toContain('data-cystift="')
    // The inner content survives.
    expect(out).toContain('<rect')
  })

  it('extracts the payload back losslessly (incl. CJK + Dates-as-strings)', () => {
    const embedded = embedCystiftInSvg(SAMPLE_SVG, PAYLOAD)
    const back = extractCystiftFromSvg(embedded)
    expect(back).not.toBeNull()
    expect(back?.app).toBe('cys-stift')
    expect(back?.canvas.name).toBe('灵感画布')
    expect(back?.cards.length).toBe(1)
    expect(back?.cards[0]?.title).toBe('标题')
  })

  it('does not double-embed if data-cystift already present', () => {
    const once = embedCystiftInSvg(SAMPLE_SVG, PAYLOAD)
    const twice = embedCystiftInSvg(once, PAYLOAD)
    expect(twice.match(/data-cystift="/g)?.length).toBe(1)
  })

  it('returns null when no data-cystift attribute is present', () => {
    expect(extractCystiftFromSvg(SAMPLE_SVG)).toBeNull()
  })

  it('the embedded SVG remains valid XML-ish (root tag unchanged)', () => {
    const out = embedCystiftInSvg(SAMPLE_SVG, PAYLOAD)
    // The original opening tag attributes are preserved.
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(out).toContain('width="100"')
    // The SVG still closes.
    expect(out.trim().endsWith('</svg>')).toBe(true)
  })
})
