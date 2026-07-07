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

  it('preserves negative coordinates (no clamping)', () => {
    const host = new InMemoryCanvasHost()
    seedCard(host, 'a1')

    applyLayout(host, [{ type: 'card', cardId: 'a1' as CardId, x: -100, y: -50 }])

    expect(host.getElement('a1')).toMatchObject({ x: -100, y: -50 })
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

  // ── create flag for card creation (P0 DSL syntax completeness) ──

  it('creates a new card when create=true and id does not exist', () => {
    const host = new InMemoryCanvasHost()
    expect(host.getElements()).toHaveLength(0)

    applyLayout(host, [{ type: 'card', cardId: 'new' as CardId, x: 100, y: 200, create: true }])

    expect(host.getElements()).toHaveLength(1)
    const card = host.getElement('new')
    expect(card).toMatchObject({
      id: 'new',
      kind: 'card',
      x: 100,
      y: 200,
      w: 240,
      h: 120,
      color: 'white',
      rotation: 0,
    })
  })

  it('creates a new card with explicit size and color when create=true', () => {
    const host = new InMemoryCanvasHost()
    applyLayout(host, [
      { type: 'card', cardId: 'new-card' as CardId, x: 50, y: 50, w: 300, h: 150, color: 'blue', create: true },
    ])

    const card = host.getElement('new-card')
    expect(card).toMatchObject({
      w: 300,
      h: 150,
      color: 'blue',
    })
  })

  it('updates existing card when create=true and id already exists (no duplicate)', () => {
    const host = new InMemoryCanvasHost()
    seedCard(host, 'existing', 0, 0) // w:240, h:120
    expect(host.getElements()).toHaveLength(1)

    applyLayout(host, [{ type: 'card', cardId: 'existing' as CardId, x: 100, y: 200, color: 'red', create: true }])

    expect(host.getElements()).toHaveLength(1)
    expect(host.getElement('existing')).toMatchObject({
      x: 100,
      y: 200,
      color: 'red',
      w: 240, // preserved
    })
  })

  it('does NOT create when no create flag (old behavior preserved)', () => {
    const host = new InMemoryCanvasHost()
    const result = applyLayout(host, [{ type: 'card', cardId: 'ghost' as CardId, x: 100, y: 200 }])

    expect(host.getElements()).toHaveLength(0)
    // counts 验字段(sanitize 对不存在的 card 挂 sanitizeDiagnostics,不验全对象)
    expect(result.applied).toBe(0)
    expect(result.skipped).toBe(1)
    expect(result.newlyApplied).toEqual([])
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

  // ── applied/skipped counts (打磨主干 1+2:诚实反馈) ──

  it('returns applied/skipped counts', () => {
    const host = new InMemoryCanvasHost()
    seedCard(host, 'c1', 0, 0)

    const res = applyLayout(host, [
      { type: 'card', cardId: 'c1' as CardId, x: 100, y: 200 }, // 生效:existing card
      { type: 'card', cardId: 'ghost' as CardId, x: 0, y: 0 }, // 跳过:card 不存在
      { type: 'free', shape: 'rect', x: 10, y: 20 }, // 生效:create
      { type: 'arrow', from: 'c1', to: 'ghost', label: 'ref' }, // 跳过:to 端点不存在
    ])

    // counts 验字段(ops 含 ghost card + arrow→ghost → sanitize 挂 sanitizeDiagnostics,不验全对象)
    expect(res.applied).toBe(2)
    expect(res.skipped).toBe(2)
    expect(res.newlyApplied).toEqual([])
  })

  it('empty ops returns zeros', () => {
    const host = new InMemoryCanvasHost()
    expect(applyLayout(host, [])).toEqual({ applied: 0, skipped: 0, newlyApplied: [] })
  })

  it('per-op throw counts as skipped', () => {
    // A host whose upsert always throws — every op is swallowed by the
    // per-op try/catch and counted as skipped (not applied).
    class ThrowingHost extends InMemoryCanvasHost {
      override upsert(): void {
        throw new Error('boom')
      }
    }
    const host = new ThrowingHost()
    const res = applyLayout(host, [
      { type: 'free', shape: 'rect', x: 0, y: 0 },
      { type: 'free', shape: 'rect', x: 10, y: 10 },
    ])
    expect(res).toEqual({ applied: 0, skipped: 2, newlyApplied: [] })
  })

  // ── arrow route (curve/elbow) apply ──────────────────────────────────────

  it('creates a relation arrow with route=curve + curve', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
    host.upsert({ id: 'c2', kind: 'card', x: 50, y: 0, w: 10, h: 10, rotation: 0 })
    applyLayout(host, [
      { type: 'arrow', from: 'c1', to: 'c2', route: 'curve', curve: { cx: 30, cy: 40 } },
    ])
    const el = host.getElements().find((e) => e.kind === 'arrow')!
    expect(el).toMatchObject({ route: 'curve', curve: { cx: 30, cy: 40 } })
  })

  it('creates a relation arrow with route=elbow + elbow', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
    host.upsert({ id: 'c2', kind: 'card', x: 50, y: 50, w: 10, h: 10, rotation: 0 })
    applyLayout(host, [
      { type: 'arrow', from: 'c1', to: 'c2', route: 'elbow', elbow: [{ x: 40, y: 10 }, { x: 40, y: 40 }] },
    ])
    const el = host.getElements().find((e) => e.kind === 'arrow')!
    expect(el).toMatchObject({ route: 'elbow', elbow: [{ x: 40, y: 10 }, { x: 40, y: 40 }] })
  })

  it('updates an existing arrow route by id (curve → elbow)', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
    host.upsert({ id: 'c2', kind: 'card', x: 50, y: 0, w: 10, h: 10, rotation: 0 })
    host.upsert({ id: 'a1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'c1', to: 'c2', route: 'curve', curve: { cx: 30, cy: 40 } })
    applyLayout(host, [{ type: 'arrow', id: 'a1', from: 'c1', to: 'c2', route: 'elbow', elbow: [{ x: 30, y: 5 }] }])
    const el = host.getElement('a1')!
    expect(el.route).toBe('elbow')
    expect(el.elbow).toEqual([{ x: 30, y: 5 }])
  })

  // ── arrow wikilink meta — DSL symmetry fix (wikilink round-trip) ──

  it('creates a relation arrow with meta.wikilink when op.wikilink is true (create path)', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
    host.upsert({ id: 'c2', kind: 'card', x: 50, y: 0, w: 10, h: 10, rotation: 0 })
    applyLayout(host, [
      { type: 'arrow', from: 'c1', to: 'c2', wikilink: true },
    ])
    const el = host.getElements().find((e) => e.kind === 'arrow')!
    expect(el.meta?.wikilink).toBe(true)
  })

  it('updates an existing relation arrow setting meta.wikilink when op.wikilink is true (update path)', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
    host.upsert({ id: 'c2', kind: 'card', x: 50, y: 0, w: 10, h: 10, rotation: 0 })
    // Existing arrow with prior meta (other key) — must be preserved when setting wikilink.
    host.upsert({
      id: 'a1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0,
      from: 'c1', to: 'c2',
      meta: { otherKey: 'preserved' },
    })
    applyLayout(host, [
      { type: 'arrow', id: 'a1', from: 'c1', to: 'c2', wikilink: true },
    ])
    const el = host.getElement('a1')!
    expect(el.meta?.wikilink).toBe(true)
    expect(el.meta?.otherKey).toBe('preserved')
  })

  it('creates a free arrow with meta.wikilink when op.wikilink is true (free create path)', () => {
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
        wikilink: true,
      },
    ])
    const arrows = host.getElements().filter((e) => e.kind === 'arrow')
    expect(arrows).toHaveLength(1)
    expect(arrows[0]!.meta?.wikilink).toBe(true)
  })

  it('updates a free arrow setting meta.wikilink when op.wikilink is true (free update path)', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({
      id: 'fa1', kind: 'arrow', x: 0, y: 0, w: 10, h: 10, rotation: 0,
      meta: { existingMeta: 'keep' },
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
        wikilink: true,
      },
    ])
    const el = host.getElement('fa1')!
    expect(el.meta?.wikilink).toBe(true)
    expect(el.meta?.existingMeta).toBe('keep')
  })

  // ── incremental apply optimization — P1 performance ───────────────────────

  it('second apply with same ops applies zero when using appliedHashes', () => {
    const host = new InMemoryCanvasHost()
    seedCard(host, 'c1', 0, 0)
    seedCard(host, 'c2', 0, 0)

    const ops: DslOp[] = [
      { type: 'card', cardId: 'c1' as CardId, x: 100, y: 200 },
      { type: 'card', cardId: 'c2' as CardId, x: 300, y: 400 },
    ]

    const appliedHashes = new Set<string>()
    // First apply: both ops applied
    const result1 = applyLayout(host, ops, appliedHashes)
    expect(result1.applied).toBe(2)
    expect(result1.skipped).toBe(0)
    expect(result1.newlyApplied.length).toBe(2)
    expect(appliedHashes.size).toBe(2)

    // Second apply with same cache: both skipped, zero applied
    const result2 = applyLayout(host, ops, appliedHashes)
    expect(result2.applied).toBe(0)
    expect(result2.skipped).toBe(2)
    expect(result2.newlyApplied.length).toBe(0)
  })

  it('only changed op is applied on second incremental apply', () => {
    const host = new InMemoryCanvasHost()
    seedCard(host, 'c1', 0, 0)
    seedCard(host, 'c2', 0, 0)
    seedCard(host, 'c3', 0, 0)

    const ops1: DslOp[] = [
      { type: 'card', cardId: 'c1' as CardId, x: 100, y: 200 },
      { type: 'card', cardId: 'c2' as CardId, x: 300, y: 400 },
    ]

    const appliedHashes = new Set<string>()
    const result1 = applyLayout(host, ops1, appliedHashes)
    expect(result1.applied).toBe(2)
    expect(result1.skipped).toBe(0)

    // Add one new op (c3)
    const ops2: DslOp[] = [
      { type: 'card', cardId: 'c1' as CardId, x: 100, y: 200 }, // unchanged
      { type: 'card', cardId: 'c2' as CardId, x: 300, y: 400 }, // unchanged
      { type: 'card', cardId: 'c3' as CardId, x: 500, y: 600 }, // new
    ]

    const result2 = applyLayout(host, ops2, appliedHashes)
    expect(result2.applied).toBe(1)
    expect(result2.skipped).toBe(2)
    expect(result2.newlyApplied.length).toBe(1)
    expect(appliedHashes.size).toBe(3)

    // Verify positions
    expect(host.getElement('c1')).toMatchObject({ x: 100, y: 200 })
    expect(host.getElement('c2')).toMatchObject({ x: 300, y: 400 })
    expect(host.getElement('c3')).toMatchObject({ x: 500, y: 600 })
  })

  it('modified op gets re-applied when hash changes', () => {
    const host = new InMemoryCanvasHost()
    seedCard(host, 'c1', 0, 0)

    const appliedHashes = new Set<string>()

    // First apply with x=100
    const ops1: DslOp[] = [{ type: 'card', cardId: 'c1' as CardId, x: 100, y: 200 }]
    applyLayout(host, ops1, appliedHashes)
    expect(host.getElement('c1')).toMatchObject({ x: 100 })

    // Second apply with x=200 (changed, so re-applied)
    const ops2: DslOp[] = [{ type: 'card', cardId: 'c1' as CardId, x: 200, y: 200 }]
    const result = applyLayout(host, ops2, appliedHashes)
    expect(result.applied).toBe(1)
    expect(result.skipped).toBe(0)
    expect(host.getElement('c1')).toMatchObject({ x: 200 })
  })

  it('works with undefined appliedHashes (backward compatible)', () => {
    const host = new InMemoryCanvasHost()
    seedCard(host, 'c1', 0, 0)

    const result = applyLayout(host, [{ type: 'card', cardId: 'c1' as CardId, x: 100, y: 200 }])

    expect(result).toEqual({ applied: 1, skipped: 0, newlyApplied: [] })
    expect(host.getElement('c1')).toMatchObject({ x: 100, y: 200 })
  })

  it('counts already-applied cached ops as skipped', () => {
    const host = new InMemoryCanvasHost()
    seedCard(host, 'c1', 0, 0)
    seedCard(host, 'c2', 0, 0)

    const appliedHashes = new Set<string>()
    applyLayout(host, [{ type: 'card', cardId: 'c1' as CardId, x: 100, y: 200 }], appliedHashes)

    // Second apply includes one cached (c1) and one new (c2)
    const result = applyLayout(host, [
      { type: 'card', cardId: 'c1' as CardId, x: 100, y: 200 },
      { type: 'card', cardId: 'c2' as CardId, x: 300, y: 400 },
    ], appliedHashes)

    expect(result.applied).toBe(1)
    expect(result.skipped).toBe(1)
  })
})

import type { DslCardOp } from '../../ai/dsl-parser'

describe('applyLayout — card create + onCardCreate', () => {
  it('invokes onCardCreate with DSL id + geometry when create flag set', () => {
    const host = new InMemoryCanvasHost()
    const created: { cardId: string; x: number; y: number; w: number; h: number; color?: string }[] = []
    const op: DslCardOp = { type: 'card', cardId: 'c1' as CardId, x: 100, y: 200, w: 80, h: 60, create: true, color: 'blue' }
    applyLayout(host, [op], undefined, (p) => created.push(p))
    expect(created).toEqual([{ cardId: 'c1', x: 100, y: 200, w: 80, h: 60, color: 'blue' }])
    expect(host.getElement('c1')).toMatchObject({ kind: 'card', x: 100, y: 200, w: 80, h: 60, color: 'blue' })
  })

  it('falls back to host.upsert only when no onCardCreate (InMemory test path)', () => {
    const host = new InMemoryCanvasHost()
    const op: DslCardOp = { type: 'card', cardId: 'c9' as CardId, x: 10, y: 20, create: true }
    applyLayout(host, [op])
    expect(host.getElement('c9')).toMatchObject({ kind: 'card', x: 10, y: 20 })
  })

  it('does not invoke onCardCreate when card already exists (update path)', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 240, h: 120, rotation: 0 })
    let calls = 0
    applyLayout(host, [{ type: 'card', cardId: 'c1' as CardId, x: 5, y: 6, create: true }], undefined, () => calls++)
    expect(calls).toBe(0)
    expect(host.getElement('c1')).toMatchObject({ x: 5, y: 6 })
  })
})
