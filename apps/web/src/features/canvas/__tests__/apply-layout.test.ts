import { describe, it, expect, vi } from 'vitest'
import { applyLayout } from '../apply-layout'
import type { DslOp } from '../../ai/dsl-parser'
import type { CardId } from '@cys-stift/domain'

// Minimal mock of tldraw Editor sufficient for applyLayout.
function mockEditor() {
  const shapes = new Map<string, Record<string, unknown>>()
  const created: Record<string, unknown>[] = []
  const updated: Record<string, unknown>[] = []

  return {
    shapes,
    created,
    updated,
    getShape(id: string) {
      return shapes.get(id) ?? null
    },
    updateShape(partial: Record<string, unknown>) {
      updated.push(partial)
      shapes.set(partial.id as string, { ...shapes.get(partial.id as string), ...partial })
      return this as never
    },
    createShape(partial: Record<string, unknown>) {
      created.push(partial)
      shapes.set(partial.id as string, { id: partial.id, ...partial })
      return this as never
    },
    batch(fn: () => void) {
      fn()
    },
  }
}

function cardShape(id: string, x = 100, y = 200) {
  return {
    id: `shape:${id}`,
    type: 'card',
    x,
    y,
    props: { w: 240, h: 120 },
  }
}

describe('applyLayout', () => {
  it('repositions existing cards', () => {
    const ed = mockEditor()
    ed.shapes.set('shape:a1', cardShape('a1', 0, 0))
    ed.shapes.set('shape:a2', cardShape('a2', 0, 0))

    const ops: DslOp[] = [
      { type: 'card', cardId: 'a1' as CardId, x: 300, y: 400 },
      { type: 'card', cardId: 'a2' as CardId, x: 500, y: 600, color: 'blue' },
    ]

    applyLayout(ed as never, ops)

    expect(ed.updated).toHaveLength(2)
    expect(ed.updated[0]).toMatchObject({ id: 'shape:a1', x: 300, y: 400, type: 'card' })
    expect(ed.updated[1]).toMatchObject({ id: 'shape:a2', x: 500, y: 600 })
  })

  it('skips cards not found in editor', () => {
    const ed = mockEditor()
    const ops: DslOp[] = [{ type: 'card', cardId: 'ghost' as CardId, x: 100, y: 200 }]

    expect(() => applyLayout(ed as never, ops)).not.toThrow()
    expect(ed.updated).toHaveLength(0)
  })

  it('clamps negative coordinates to 0', () => {
    const ed = mockEditor()
    ed.shapes.set('shape:a1', cardShape('a1'))

    applyLayout(ed as never, [{ type: 'card', cardId: 'a1' as CardId, x: -100, y: -50 }])

    expect(ed.updated[0]).toMatchObject({ x: 0, y: 0 })
  })

  it('creates free rect shapes', () => {
    const ed = mockEditor()
    const ops: DslOp[] = [
      { type: 'free', shape: 'rect', x: 100, y: 200, w: 300, h: 150, color: 'red' },
    ]

    applyLayout(ed as never, ops)

    expect(ed.created).toHaveLength(1)
    expect(ed.created[0]).toMatchObject({
      type: 'geo',
      x: 100,
      y: 200,
      props: { geo: 'rectangle', w: 300, h: 150, color: 'red' },
    })
  })

  it('creates free ellipse shapes', () => {
    const ed = mockEditor()
    applyLayout(ed as never, [{ type: 'free', shape: 'ellipse', x: 50, y: 60 }])
    expect(ed.created[0]).toMatchObject({
      type: 'geo',
      props: { geo: 'ellipse', w: 200, h: 150, color: 'black' },
    })
  })

  it('creates free note shapes with text', () => {
    const ed = mockEditor()
    applyLayout(ed as never, [
      { type: 'free', shape: 'note', x: 10, y: 20, text: 'hello', color: 'yellow' },
    ])
    expect(ed.created[0]).toMatchObject({
      type: 'note',
      props: { text: 'hello', color: 'yellow' },
    })
  })

  it('creates arrows between existing shapes', () => {
    const ed = mockEditor()
    ed.shapes.set('shape:src', cardShape('src'))
    ed.shapes.set('shape:dst', cardShape('dst'))

    applyLayout(ed as never, [
      { type: 'arrow', from: 'src', to: 'dst', label: 'ref', color: 'black' },
    ])

    expect(ed.created).toHaveLength(1)
    expect(ed.created[0]).toMatchObject({
      type: 'arrow',
      props: { text: 'ref', color: 'black' },
    })
  })

  it('skips arrows when source or target shape is missing', () => {
    const ed = mockEditor()
    applyLayout(ed as never, [{ type: 'arrow', from: 'src', to: 'ghost' }])

    // No arrow created — missing target
    expect(ed.created).toHaveLength(0)
  })

  it('handles empty ops array gracefully', () => {
    const ed = mockEditor()
    expect(() => applyLayout(ed as never, [])).not.toThrow()
    expect(ed.created).toHaveLength(0)
    expect(ed.updated).toHaveLength(0)
  })

  it('swallows errors on individual ops', () => {
    const ed = mockEditor()
    // Make createShape throw — should not propagate.
    ed.createShape = () => {
      throw new Error('boom')
    }
    expect(() =>
      applyLayout(ed as never, [
        { type: 'free', shape: 'rect', x: 0, y: 0 },
        { type: 'free', shape: 'ellipse', x: 10, y: 10 },
      ]),
    ).not.toThrow()
  })
})
