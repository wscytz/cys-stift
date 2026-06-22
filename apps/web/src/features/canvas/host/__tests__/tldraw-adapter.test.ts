import { describe, it, expect } from 'vitest'
import { TldrawAdapter } from '../tldraw-adapter'
import type { Editor } from '@tldraw/tldraw'

/**
 * Minimal tldraw Editor stub — enough to exercise TldrawAdapter's element-CRUD
 * translation (create/update/delete + getCurrentPageShapes) WITHOUT spinning
 * up a real tldraw editor / puppeteer. The store.listen/camera paths are
 * exercised in the canvas-host contract test via InMemoryCanvasHost; this file
 * pins the host↔tldraw shape mapping itself.
 */
function mockEditor(): Editor {
  const shapes = new Map<string, Record<string, unknown>>()
  return {
    store: {
      mergeRemoteChanges: (fn: () => void) => fn(),
      listen: () => () => {},
    },
    batch: (fn: () => void) => fn(),
    getCamera: () => ({ x: 0, y: 0, z: 1 }),
    getInstanceState: () => ({ isGridMode: false }),
    setCamera: () => {},
    updateInstanceState: () => {},
    user: { updateUserPreferences: () => {} },
    getShape: (id: unknown) => shapes.get(String(id)) ?? undefined,
    createShape: (p: Record<string, unknown>) => {
      shapes.set(String(p.id), { ...p, typeName: 'shape' })
    },
    updateShape: (p: Record<string, unknown>) => {
      const ex = shapes.get(String(p.id)) ?? {}
      shapes.set(String(p.id), { ...ex, ...p, typeName: 'shape' })
    },
    deleteShape: (id: unknown) => {
      shapes.delete(String(id))
    },
    getCurrentPageShapes: () => [...shapes.values()],
  } as unknown as Editor
}

describe('TldrawAdapter element translation', () => {
  it('upsert creates a card shape with shape:<id> + {w,h} props', () => {
    const ed = mockEditor()
    const host = new TldrawAdapter(ed)
    host.upsert({ id: 'c1', kind: 'card', x: 10, y: 20, w: 240, h: 120, rotation: 0 })

    const shape = ed.getShape('shape:c1') as Record<string, unknown> | undefined
    expect(shape).toBeDefined()
    expect(shape?.type).toBe('card')
    expect(shape?.x).toBe(10)
    expect(shape?.props).toMatchObject({ w: 240, h: 120 })
  })

  it('upsert on an existing id updates in place (no duplicate)', () => {
    const ed = mockEditor()
    const host = new TldrawAdapter(ed)
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
    host.upsert({ id: 'c1', kind: 'card', x: 99, y: 0, w: 10, h: 10, rotation: 0 })

    expect(host.getElements()).toHaveLength(1)
    expect(host.getElement('c1')?.x).toBe(99)
  })

  it('upsert maps rect → geo/rectangle shape', () => {
    const ed = mockEditor()
    const host = new TldrawAdapter(ed)
    host.upsert({ id: 'r1', kind: 'rect', x: 5, y: 6, w: 100, h: 50, rotation: 0, color: 'red' })

    const shape = ed.getShape('shape:r1') as Record<string, unknown> | undefined
    expect(shape?.type).toBe('geo')
    expect(shape?.props).toMatchObject({ geo: 'rectangle', w: 100, h: 50, color: 'red' })
  })

  it('upsert maps arrow → shape with bound start/end referencing shape:<id>', () => {
    const ed = mockEditor()
    const host = new TldrawAdapter(ed)
    host.upsert({
      id: 'a1',
      kind: 'arrow',
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      rotation: 0,
      from: 'src',
      to: 'dst',
      text: 'ref',
    })

    const shape = ed.getShape('shape:a1') as Record<string, unknown> | undefined
    expect(shape?.type).toBe('arrow')
    const props = shape?.props as Record<string, unknown>
    expect(props?.start).toMatchObject({ boundShapeId: 'shape:src' })
    expect(props?.end).toMatchObject({ boundShapeId: 'shape:dst' })
    expect(props?.text).toBe('ref')
  })

  it('getElement returns undefined for unknown id', () => {
    const host = new TldrawAdapter(mockEditor())
    expect(host.getElement('nope')).toBeUndefined()
  })

  it('remove deletes the underlying shape', () => {
    const ed = mockEditor()
    const host = new TldrawAdapter(ed)
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 1, h: 1, rotation: 0 })
    host.remove('c1')
    expect(host.getElement('c1')).toBeUndefined()
    expect(host.getElements()).toHaveLength(0)
  })

  it('getElements maps tldraw shapes back to CanvasElement (kind round-trip)', () => {
    const ed = mockEditor()
    const host = new TldrawAdapter(ed)
    host.upsert({ id: 'c1', kind: 'card', x: 1, y: 2, w: 3, h: 4, rotation: 0 })
    host.upsert({ id: 'r1', kind: 'rect', x: 5, y: 6, w: 7, h: 8, rotation: 0 })

    const els = host.getElements()
    expect(els).toHaveLength(2)
    const card = els.find((e) => e.kind === 'card')
    const rect = els.find((e) => e.kind === 'rect')
    expect(card).toMatchObject({ id: 'c1', x: 1, w: 3 })
    expect(rect).toMatchObject({ id: 'r1', x: 5, w: 7 })
  })
})
