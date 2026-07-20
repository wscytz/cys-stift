import { describe, expect, it } from 'vitest'
import type { CanvasElement, CanvasHost } from '@cys-stift/canvas-engine'
import type { Card } from '@cys-stift/domain'
import { buildWorkingSet } from '../working-set'
import { canonicalJson } from '../working-set-revision'

function card(id: string, title: string, body: string): Card {
  return {
    id: id as Card['id'], title, body, type: 'note', media: [], links: [], codeSnippets: [], quotes: [],
    source: { kind: 'unknown' }, capturedAt: new Date(0), createdAt: new Date(0), updatedAt: new Date(0), tags: [], pinned: false, archived: false,
  }
}

function host(elements: CanvasElement[], selected: string[] = []): CanvasHost {
  return {
    getElements: () => elements, getElement: (id) => elements.find((element) => element.id === id), getSelectedIds: () => selected,
    setSelectedIds: () => {}, upsert: () => {}, remove: () => {}, batch: (fn) => fn(), applyWithoutEcho: (fn) => fn(),
    onUserChange: () => () => {}, onSelectionChange: () => () => {}, getView: () => ({ panX: 0, panY: 0, zoom: 1, gridMode: 'free' }),
    setView: () => {}, onViewChange: () => () => {},
  }
}

function canvasCard(id: string, x = 0): CanvasElement {
  return { id, kind: 'card', x, y: 0, w: 100, h: 60, rotation: 0 }
}

describe('buildWorkingSet', () => {
  it('uses a bounded selection and records only complete allowlisted source records', async () => {
    const cards = new Map([['a', card('a', 'Alpha', 'Visible body')], ['b', card('b', 'Beta', 'Out of scope')]])
    const result = await buildWorkingSet({
      host: host([canvasCard('a'), canvasCard('b', 200)], ['a']),
      service: { get: (id: Card['id']) => cards.get(String(id)) ?? null } as never,
      canvasId: 'canvas-1', scope: { kind: 'selection' }, now: () => new Date(0),
    })
    expect(result.snapshot.scope).toEqual({ kind: 'selection', rootIds: ['a'] })
    expect(result.records.map((record) => record.text)).toEqual(['Visible body', 'Alpha'])
    expect(result.snapshot.manifest.omitted).toContainEqual({ entityId: 'b', reason: 'out-of-scope' })
    expect(result.snapshot.sources.map((source) => source.entityId)).toEqual(['a', 'a'])
  })

  it('keeps a frame scope within full containment and changes only geometry revision on movement', async () => {
    const cards = new Map([['a', card('a', 'Alpha', 'One')], ['b', card('b', 'Beta', 'Two')]])
    const service = { get: (id: Card['id']) => cards.get(String(id)) ?? null } as never
    const frame: CanvasElement = { id: 'f', kind: 'frame', x: 0, y: 0, w: 150, h: 100, rotation: 0 }
    const first = await buildWorkingSet({ host: host([frame, canvasCard('a', 10), canvasCard('b', 120)]), service, canvasId: 'c', scope: { kind: 'frame', rootIds: ['f'] }, now: () => new Date(0) })
    const second = await buildWorkingSet({ host: host([frame, canvasCard('a', 20), canvasCard('b', 120)]), service, canvasId: 'c', scope: { kind: 'frame', rootIds: ['f'] }, now: () => new Date(0) })
    expect(first.snapshot.sources.map((source) => source.entityId)).toEqual(['a', 'a'])
    expect(second.snapshot.revisions.content).toBe(first.snapshot.revisions.content)
    expect(second.snapshot.revisions.relations).toBe(first.snapshot.revisions.relations)
    expect(second.snapshot.revisions.geometry).not.toBe(first.snapshot.revisions.geometry)
  })

  it('distinguishes a truly missing relation endpoint from an out-of-scope endpoint', async () => {
    const cards = new Map([['a', card('a', 'Alpha', 'One')], ['b', card('b', 'Beta', 'Two')], ['outside', card('outside', 'Outside', 'Three')]])
    const elements: CanvasElement[] = [
      canvasCard('a'), canvasCard('b', 200), canvasCard('outside', 400),
      { id: 'dangling', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'missing' },
      { id: 'boundary', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'outside' },
    ]
    const result = await buildWorkingSet({
      host: host(elements), service: { get: (id: Card['id']) => cards.get(String(id)) ?? null } as never,
      canvasId: 'c', scope: { kind: 'explicit-cards', rootIds: ['a', 'b'] }, now: () => new Date(0),
    })
    expect(result.snapshot.relationIssues).toEqual([expect.objectContaining({ arrowId: 'dangling', kind: 'missing-endpoint', from: 'a', to: 'missing' })])
    expect(result.snapshot.relations).toEqual([])
    expect(JSON.stringify(result)).not.toContain('boundary')
  })

  it('supports normalized paste blocks and exposes complete-record budget omissions', async () => {
    const pasted = await buildWorkingSet({
      host: host([]), service: { get: () => null } as never, canvasId: 'c',
      scope: { kind: 'paste', paste: '# One\r\nalpha\r\n\r\n## Two\r\nbeta' }, now: () => new Date(0), maxChars: 11,
    })
    expect(pasted.records.map((record) => record.text)).toEqual(['# One\nalpha'])
    expect(pasted.snapshot.manifest.truncated).toBe(true)
    expect(pasted.snapshot.manifest.omitted).toEqual([{ entityId: 'paste:1', reason: 'budget' }])
    expect(pasted.snapshot.geometry).toEqual([])
  })

  it('keeps canonical snapshot bytes and digest stable across 100 identical builds', async () => {
    const cards = new Map([['a', card('a', 'Alpha', 'Body')]])
    const options = {
      host: host([canvasCard('a')], ['a']), service: { get: (id: Card['id']) => cards.get(String(id)) ?? null } as never,
      canvasId: 'c', scope: { kind: 'selection' as const }, now: () => new Date(0),
    }
    const first = await buildWorkingSet(options)
    const expected = canonicalJson(first.snapshot)
    for (let index = 0; index < 100; index++) {
      const next = await buildWorkingSet(options)
      expect(canonicalJson(next.snapshot)).toBe(expected)
      expect(next.snapshot.snapshotId).toBe(first.snapshot.snapshotId)
    }
  })
})
