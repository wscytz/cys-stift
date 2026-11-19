import { beforeEach, describe, expect, it } from 'vitest'
import { InMemoryCanvasHost } from '@cys-stift/canvas-engine'
import type { CanvasElement } from '@cys-stift/canvas-engine'
import {
  bindCardLayoutAnchorPersistence,
  clearLayoutAnchorOnUserGeometryChange,
  collectCardLayoutAnchors,
  loadCardLayoutAnchors,
  saveCardLayoutAnchors,
} from '../card-layout-anchor-store'

const card = (id: string, extra: Partial<CanvasElement> = {}): CanvasElement => ({
  id,
  kind: 'card',
  x: 0,
  y: 0,
  w: 240,
  h: 120,
  rotation: 0,
  ...extra,
})

describe('card-layout-anchor-store', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('collects only valid anchors from card elements', () => {
    const anchors = collectCardLayoutAnchors([
      card('a', { meta: { layoutAnchor: { id: 'b', dir: 'right-of', gap: 20 } } }),
      card('c', { meta: { layoutAnchor: { id: 'd', dir: 'nope', gap: 20 } } }),
      { id: 't', kind: 'text', x: 0, y: 0, w: 1, h: 1, rotation: 0 },
    ])
    expect(anchors).toEqual({ a: { id: 'b', dir: 'right-of', gap: 20 } })
  })

  it('save/load round-trips and drops invalid entries', () => {
    saveCardLayoutAnchors('c1', { a: { id: 'b', dir: 'below', gap: 12 } })
    expect(loadCardLayoutAnchors('c1')).toEqual({ a: { id: 'b', dir: 'below', gap: 12 } })

    window.localStorage.setItem(
      'cys-stift.card-anchors.c1',
      JSON.stringify({
        a: { id: 'b', dir: 'bad', gap: 1 },
        c: { id: 'd', dir: 'right-of', gap: 8 },
        'bad id!': { id: 'e', dir: 'right-of', gap: 1 },
      }),
    )
    expect(loadCardLayoutAnchors('c1')).toEqual({ c: { id: 'd', dir: 'right-of', gap: 8 } })
  })

  it('applies stored anchors to cards that appear after bind', () => {
    saveCardLayoutAnchors('c1', { a: { id: 'b', dir: 'below', gap: 10 } })
    const host = new InMemoryCanvasHost()
    const unbind = bindCardLayoutAnchorPersistence(host, 'c1', 0)
    host.upsert(card('a'))
    expect(host.getElement('a')?.meta?.layoutAnchor).toEqual({ id: 'b', dir: 'below', gap: 10 })
    unbind()
  })

  it('bind merges stored anchors and flushes cleared anchors on dispose', () => {
    saveCardLayoutAnchors('c1', { a: { id: 'b', dir: 'right-of', gap: 20 } })
    const host = new InMemoryCanvasHost()
    host.upsert(card('a'))
    const unbind = bindCardLayoutAnchorPersistence(host, 'c1', 0)
    expect(host.getElement('a')?.meta?.layoutAnchor).toEqual({
      id: 'b',
      dir: 'right-of',
      gap: 20,
    })

    // 用户拖拽/其他路径清掉 anchor → dispose 时同步 flush 空表
    host.upsert(card('a'))
    unbind()
    expect(loadCardLayoutAnchors('c1')).toEqual({})
  })
})

describe('clearLayoutAnchorOnUserGeometryChange', () => {
  const anchor = { id: 'a', dir: 'right-of' as const, gap: 20 }

  it('clears when anchor unchanged and geometry moved (user drag)', () => {
    const previous = card('b', { x: 360, y: 100, meta: { layoutAnchor: anchor } })
    const next = card('b', { x: 440, y: 140, meta: { layoutAnchor: { ...anchor } } })
    expect(clearLayoutAnchorOnUserGeometryChange(next, previous).meta?.layoutAnchor).toBeUndefined()
  })

  it('preserves a new card anchor (DSL create, previous undefined)', () => {
    const next = card('b', { meta: { layoutAnchor: anchor } })
    expect(clearLayoutAnchorOnUserGeometryChange(next, undefined).meta?.layoutAnchor).toEqual(anchor)
  })

  it('preserves when the anchor changed (DSL re-solve)', () => {
    const previous = card('b', { x: 360, y: 100, meta: { layoutAnchor: anchor } })
    const next = card('b', {
      x: 360,
      y: 240,
      meta: { layoutAnchor: { id: 'a', dir: 'below', gap: 20 } },
    })
    expect(clearLayoutAnchorOnUserGeometryChange(next, previous).meta?.layoutAnchor).toEqual({
      id: 'a',
      dir: 'below',
      gap: 20,
    })
  })

  it('preserves when geometry is unchanged (content-only upsert)', () => {
    const previous = card('b', { meta: { layoutAnchor: anchor } })
    const next = card('b', { meta: { layoutAnchor: { ...anchor } } })
    expect(clearLayoutAnchorOnUserGeometryChange(next, previous).meta?.layoutAnchor).toEqual(anchor)
  })
})
