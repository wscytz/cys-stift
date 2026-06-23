import { describe, expect, it } from 'vitest'
import { snapshotCanvas, formatCanvasSnapshot } from '../canvas-snapshot'
import { InMemoryCanvasHost } from '@cys-stift/canvas-engine'
import type { CardService, CardId, CanvasId } from '@cys-stift/domain'

/** Minimal CardService stub — snapshotCanvas only calls service.get(id).title. */
function stubService(titles: Record<string, string>): CardService {
  return {
    get: (id: CardId) =>
      titles[String(id)]
        ? ({ id, title: titles[String(id)] } as never)
        : undefined,
  } as unknown as CardService
}

const CV = 'cv' as unknown as CanvasId

describe('snapshotCanvas → formatCanvasSnapshot', () => {
  it('includes card titles (AI needs content to cluster)', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'c1', kind: 'card', x: 10, y: 20, w: 240, h: 120, rotation: 0 })
    const text = formatCanvasSnapshot(snapshotCanvas(host, stubService({ c1: 'Growth ideas' }), CV))
    expect(text).toContain('Growth ideas')
  })

  it('renders arrows + rect + text with the unified grammar', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
    host.upsert({ id: 'c2', kind: 'card', x: 100, y: 0, w: 10, h: 10, rotation: 0 })
    host.upsert({
      id: 'a1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0,
      from: 'c1', to: 'c2', text: 'blocks',
    })
    host.upsert({ id: 'r1', kind: 'rect', x: 50, y: 50, w: 200, h: 100, rotation: 0 })
    host.upsert({ id: 't1', kind: 'text', x: 5, y: 6, w: 0, h: 0, rotation: 0, text: 'note' })

    const text = formatCanvasSnapshot(snapshotCanvas(host, stubService({ c1: 'A', c2: 'B' }), CV))
    expect(text).toContain('[arrow #a1] from #c1 to #c2 @label("blocks")')
    expect(text).toContain('[rect] @pos(50, 50)')
    expect(text).toContain('[text] @pos(5, 6) @text("note")')
  })

  it('renders arrow relation signature (color + dash + arrowhead) — AI 改签名需看到现状', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
    host.upsert({ id: 'c2', kind: 'card', x: 100, y: 0, w: 10, h: 10, rotation: 0 })
    host.upsert({
      id: 'a1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0,
      from: 'c1', to: 'c2', color: 'blue', dash: 'dashed', arrowhead: 'none',
    })
    const snap = snapshotCanvas(host, stubService({ c1: 'A', c2: 'B' }), CV)
    expect(snap.arrows[0]?.color).toBe('blue')
    expect(snap.arrows[0]?.dash).toBe('dashed')
    expect(snap.arrows[0]?.arrowhead).toBe('none')
    const text = formatCanvasSnapshot(snap)
    expect(text).toContain('@color(blue)')
    expect(text).toContain('@dash(dashed)')
    expect(text).toContain('@arrowhead(none)')
  })
})

describe('canvas snapshot — privacy reverse-asserts (R2 + allowlist)', () => {
  it('never includes deviceId', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 1, h: 1, rotation: 0 })
    const text = formatCanvasSnapshot(snapshotCanvas(host, stubService({ c1: 'x' }), CV))
    expect(text).not.toContain('deviceId')
    expect(text).not.toContain('device')
  })

  it('freedraw emits position only — NEVER the point sequence', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({
      id: 'f1', kind: 'freedraw', x: 5, y: 6, w: 0, h: 0, rotation: 0,
      meta: { segments: [{ points: [{ x: 123, y: 456 }, { x: 789, y: 12 }] }] },
    })
    const text = formatCanvasSnapshot(snapshotCanvas(host, stubService({}), CV))
    expect(text).toContain('[freedraw] @pos(5, 6)')
    // The actual point coordinates must never reach the AI view.
    expect(text).not.toContain('123')
    expect(text).not.toContain('456')
    expect(text).not.toContain('789')
    expect(text).not.toContain('points')
  })

  it('a card missing from CardService renders as (untitled), no crash', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'ghost', kind: 'card', x: 0, y: 0, w: 1, h: 1, rotation: 0 })
    const text = formatCanvasSnapshot(snapshotCanvas(host, stubService({}), CV))
    expect(text).toContain('(untitled)')
    // Soft-deleted cards never get here in production — canvas-binding removes
    // them from the host; this just confirms a missing title degrades safely.
  })
})
