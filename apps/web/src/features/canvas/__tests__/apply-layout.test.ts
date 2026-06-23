import { describe, it, expect } from 'vitest'
import { applyLayout } from '../apply-layout'
import { InMemoryCanvasHost } from '@cys-stift/canvas-engine'
import type { CanvasHost } from '@cys-stift/canvas-engine'
import type { DslOp } from '../../ai/dsl-parser'
import type { CardId } from '@cys-stift/domain'

/** Pre-seed a card element so a `card` op has something to reposition. */
function seedCard(host: CanvasHost, id: string, x = 0, y = 0) {
  host.upsert({ id, kind: 'card', x, y, w: 240, h: 120, rotation: 0 })
}

describe('applyLayout', () => {
  it('repositions existing cards (preserving w/h/rotation)', () => {
    const host = new InMemoryCanvasHost()
    seedCard(host, 'a1', 0, 0)
    seedCard(host, 'a2', 0, 0)

    const ops: DslOp[] = [
      { type: 'card', cardId: 'a1' as CardId, x: 300, y: 400 },
      { type: 'card', cardId: 'a2' as CardId, x: 500, y: 600, color: 'blue' },
    ]

    applyLayout(host, ops)

    expect(host.getElement('a1')).toMatchObject({ x: 300, y: 400, w: 240, h: 120 })
    expect(host.getElement('a2')).toMatchObject({ x: 500, y: 600, color: 'blue', w: 240 })
  })

  it('skips cards not found in host', () => {
    const host = new InMemoryCanvasHost()
    const ops: DslOp[] = [{ type: 'card', cardId: 'ghost' as CardId, x: 100, y: 200 }]

    expect(() => applyLayout(host, ops)).not.toThrow()
    expect(host.getElements()).toHaveLength(0)
  })

  it('clamps negative coordinates to 0', () => {
    const host = new InMemoryCanvasHost()
    seedCard(host, 'a1')

    applyLayout(host, [{ type: 'card', cardId: 'a1' as CardId, x: -100, y: -50 }])

    expect(host.getElement('a1')).toMatchObject({ x: 0, y: 0 })
  })

  it('creates free rect shapes', () => {
    const host = new InMemoryCanvasHost()
    applyLayout(host, [
      { type: 'free', shape: 'rect', x: 100, y: 200, w: 300, h: 150, color: 'red' },
    ])

    const rect = host.getElements().find((e) => e.kind === 'rect')
    expect(rect).toMatchObject({ kind: 'rect', x: 100, y: 200, w: 300, h: 150, color: 'red' })
  })

  it('creates free ellipse shapes (default size/color)', () => {
    const host = new InMemoryCanvasHost()
    applyLayout(host, [{ type: 'free', shape: 'ellipse', x: 50, y: 60 }])

    const el = host.getElements().find((e) => e.kind === 'ellipse')
    expect(el).toMatchObject({ kind: 'ellipse', x: 50, y: 60, w: 200, h: 150, color: 'black' })
  })

  it('creates free note shapes with text', () => {
    const host = new InMemoryCanvasHost()
    applyLayout(host, [
      { type: 'free', shape: 'note', x: 10, y: 20, text: 'hello', color: 'yellow' },
    ])

    const note = host.getElements().find((e) => e.kind === 'note')
    expect(note).toMatchObject({ kind: 'note', text: 'hello', color: 'yellow' })
  })

  it('creates arrows between existing cards', () => {
    const host = new InMemoryCanvasHost()
    seedCard(host, 'src')
    seedCard(host, 'dst')

    applyLayout(host, [{ type: 'arrow', from: 'src', to: 'dst', label: 'ref', color: 'black' }])

    const arrow = host.getElements().find((e) => e.kind === 'arrow')
    expect(arrow).toMatchObject({ kind: 'arrow', from: 'src', to: 'dst', text: 'ref', color: 'black' })
  })

  it('skips arrows when source or target is missing', () => {
    const host = new InMemoryCanvasHost()
    seedCard(host, 'src')

    applyLayout(host, [{ type: 'arrow', from: 'src', to: 'ghost' }])

    expect(host.getElements().filter((e) => e.kind === 'arrow')).toHaveLength(0)
  })

  it('handles empty ops array gracefully', () => {
    const host = new InMemoryCanvasHost()
    expect(() => applyLayout(host, [])).not.toThrow()
    expect(host.getElements()).toHaveLength(0)
  })

  it('swallows errors on individual ops', () => {
    // A host whose upsert always throws — applyLayout's per-op try/catch
    // must swallow it so one bad op doesn't abort the whole layout.
    class ThrowingHost extends InMemoryCanvasHost {
      override upsert(): void {
        throw new Error('boom')
      }
    }
    const host = new ThrowingHost()
    expect(() =>
      applyLayout(host, [
        { type: 'free', shape: 'rect', x: 0, y: 0 },
        { type: 'free', shape: 'ellipse', x: 10, y: 10 },
      ]),
    ).not.toThrow()
  })

  // ── arrow relation signature update — DSL symmetry fix 1 ──

  it('updates an existing arrow (by id) dash/arrowhead/color/label, keeping from/to', () => {
    const host = new InMemoryCanvasHost()
    seedCard(host, 'src')
    seedCard(host, 'dst')
    // Pre-existing arrow with old signature.
    host.upsert({
      id: 'arr1',
      kind: 'arrow',
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      rotation: 0,
      from: 'src',
      to: 'dst',
      text: 'old',
      color: 'black',
      dash: 'solid',
      arrowhead: 'arrow',
    })

    applyLayout(host, [
      {
        type: 'arrow',
        id: 'arr1',
        from: 'src',
        to: 'dst',
        label: 'references',
        color: 'red',
        dash: 'dashed',
        arrowhead: 'triangle',
      },
    ])

    const arrow = host.getElement('arr1')
    // from/to preserved (they were on the existing element; op provided same).
    expect(arrow).toMatchObject({
      id: 'arr1',
      kind: 'arrow',
      from: 'src',
      to: 'dst',
      text: 'references',
      color: 'red',
      dash: 'dashed',
      arrowhead: 'triangle',
    })
    // No second arrow created.
    expect(host.getElements().filter((e) => e.kind === 'arrow')).toHaveLength(1)
  })

  it('creates a new arrow when id is missing or not found (existing behavior)', () => {
    const host = new InMemoryCanvasHost()
    seedCard(host, 'src')
    seedCard(host, 'dst')

    applyLayout(host, [{ type: 'arrow', from: 'src', to: 'dst', label: 'ref' }])

    const arrow = host.getElements().find((e) => e.kind === 'arrow')
    expect(arrow).toMatchObject({ kind: 'arrow', from: 'src', to: 'dst', text: 'ref' })
  })

  // ── card size — DSL symmetry fix 2 ──

  it('updates an existing card size when op has w/h', () => {
    const host = new InMemoryCanvasHost()
    seedCard(host, 'a1', 0, 0) // default w:240, h:120

    applyLayout(host, [
      { type: 'card', cardId: 'a1' as CardId, x: 100, y: 200, w: 300, h: 150, color: 'blue' },
    ])

    expect(host.getElement('a1')).toMatchObject({ x: 100, y: 200, w: 300, h: 150, color: 'blue' })
  })

  it('preserves existing card w/h when op omits them', () => {
    const host = new InMemoryCanvasHost()
    seedCard(host, 'a1', 0, 0) // w:240, h:120

    applyLayout(host, [{ type: 'card', cardId: 'a1' as CardId, x: 50, y: 60 }])

    expect(host.getElement('a1')).toMatchObject({ x: 50, y: 60, w: 240, h: 120 })
  })

  // ── text color — DSL symmetry fix 3 ──

  it('creates a text shape with the op color', () => {
    const host = new InMemoryCanvasHost()
    applyLayout(host, [
      { type: 'free', shape: 'text', x: 10, y: 20, text: 'hi', color: 'red' },
    ])

    const el = host.getElements().find((e) => e.kind === 'text')
    expect(el).toMatchObject({ kind: 'text', x: 10, y: 20, text: 'hi', color: 'red' })
  })
})
