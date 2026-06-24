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
        { type: 'free', shape: 'rect', x: 10, y: 10 },
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

  // ── free arrow — DSL symmetry fix 4 (自由箭头 apply) ──

  it('creates a free arrow from bbox op (no from/to)', () => {
    const host = new InMemoryCanvasHost()
    applyLayout(host, [
      {
        type: 'arrow',
        from: '',
        to: '',
        freeArrow: true,
        x: 10,
        y: 20,
        w: 100,
        h: 50,
      },
    ])

    const arrows = host.getElements().filter((e) => e.kind === 'arrow')
    expect(arrows).toHaveLength(1)
    const el = arrows[0]
    expect(el).toMatchObject({ kind: 'arrow', x: 10, y: 20, w: 100, h: 50, rotation: 0 })
    // 自由箭头无端点。
    expect(el?.from).toBeUndefined()
    expect(el?.to).toBeUndefined()
  })

  it('creates a free arrow with negative size (direction)', () => {
    const host = new InMemoryCanvasHost()
    applyLayout(host, [
      {
        type: 'arrow',
        from: '',
        to: '',
        freeArrow: true,
        x: 200,
        y: 200,
        w: -80,
        h: 30,
      },
    ])

    const el = host.getElements().find((e) => e.kind === 'arrow')
    // 负值保留(编码线段方向)。
    expect(el).toMatchObject({ w: -80, h: 30 })
  })

  it('updates a free arrow by id (bbox + signature)', () => {
    const host = new InMemoryCanvasHost()
    // 预置一个自由箭头(无 from/to)。
    host.upsert({
      id: 'fa1',
      kind: 'arrow',
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      rotation: 0,
    })

    applyLayout(host, [
      {
        type: 'arrow',
        id: 'fa1',
        from: '',
        to: '',
        freeArrow: true,
        x: 100,
        y: 50,
        w: 200,
        h: 100,
        dash: 'dotted',
      },
    ])

    // 仍只有 1 个 arrow(就地更新,非新建)。
    const arrows = host.getElements().filter((e) => e.kind === 'arrow')
    expect(arrows).toHaveLength(1)
    const el = host.getElement('fa1')
    expect(el).toMatchObject({
      id: 'fa1',
      kind: 'arrow',
      x: 100,
      y: 50,
      w: 200,
      h: 100,
      dash: 'dotted',
    })
    // from/to 仍 undefined。
    expect(el?.from).toBeUndefined()
    expect(el?.to).toBeUndefined()
  })

  it('free arrow create does not require endpoints to exist', () => {
    const host = new InMemoryCanvasHost()
    // host 里没有任何 card/端点。
    expect(host.getElements()).toHaveLength(0)

    applyLayout(host, [
      {
        type: 'arrow',
        from: '',
        to: '',
        freeArrow: true,
        x: 5,
        y: 5,
        w: 40,
        h: 40,
      },
    ])

    // 自由箭头无需端点存在,直接 create。
    const arrows = host.getElements().filter((e) => e.kind === 'arrow')
    expect(arrows).toHaveLength(1)
    expect(arrows[0]).toMatchObject({ kind: 'arrow', x: 5, y: 5, w: 40, h: 40 })
  })

  // ── rect/text update-by-id — DSL symmetry fix 5 ──

  it('updates an existing rect by id (not creating a duplicate)', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'r1', kind: 'rect', x: 0, y: 0, w: 100, h: 100, rotation: 0 })

    applyLayout(host, [{ type: 'free', shape: 'rect', id: 'r1', x: 200, y: 300 }])

    const rects = host.getElements().filter((e) => e.kind === 'rect')
    expect(rects).toHaveLength(1)
    // op omitted w/h → existing 100/100 preserved; x/y overridden.
    expect(host.getElement('r1')).toMatchObject({ x: 200, y: 300, w: 100, h: 100 })
  })

  it('updates an existing text by id (not creating a duplicate)', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 't1', kind: 'text', x: 0, y: 0, w: 100, h: 40, rotation: 0, text: 'orig' })

    applyLayout(host, [{ type: 'free', shape: 'text', id: 't1', x: 50, y: 60, text: 'updated' }])

    const texts = host.getElements().filter((e) => e.kind === 'text')
    expect(texts).toHaveLength(1)
    expect(host.getElement('t1')).toMatchObject({ x: 50, text: 'updated' })
  })

  it('creates a new rect when id not found', () => {
    const host = new InMemoryCanvasHost()

    applyLayout(host, [{ type: 'free', shape: 'rect', id: 'ghost', x: 0, y: 0 }])

    const rects = host.getElements().filter((e) => e.kind === 'rect')
    expect(rects).toHaveLength(1)
    // id is minted by uid('free'), not the op's unmatched 'ghost'.
    expect(rects[0]!.id).not.toBe('ghost')
  })

  it('rect update preserves existing w/h when op omits them', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'r1', kind: 'rect', x: 0, y: 0, w: 300, h: 200, rotation: 0 })

    applyLayout(host, [{ type: 'free', shape: 'rect', id: 'r1', x: 10, y: 20 }])

    expect(host.getElement('r1')).toMatchObject({ x: 10, y: 20, w: 300, h: 200 })
  })

  it('text update preserves existing text when op omits it', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 't1', kind: 'text', x: 0, y: 0, w: 100, h: 40, rotation: 0, text: 'orig' })

    // op has no text field → existing.text must be preserved (not blanked).
    applyLayout(host, [{ type: 'free', shape: 'text', id: 't1', x: 5, y: 6 }])

    expect(host.getElement('t1')).toMatchObject({ x: 5, y: 6, text: 'orig' })
  })

  it('rect update does not mutate a text element (kind mismatch)', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 't1', kind: 'text', x: 10, y: 20, w: 100, h: 40, rotation: 0, text: 'orig' })

    // rect op targeting a text id → existing.kind !== 'rect' → create path; t1 untouched.
    applyLayout(host, [{ type: 'free', shape: 'rect', id: 't1', x: 0, y: 0 }])

    expect(host.getElement('t1')).toMatchObject({ kind: 'text', x: 10, y: 20, text: 'orig' })
    const rects = host.getElements().filter((e) => e.kind === 'rect')
    expect(rects).toHaveLength(1)
    expect(rects[0]!.id).not.toBe('t1')
  })
})
