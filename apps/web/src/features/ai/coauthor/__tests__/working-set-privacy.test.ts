import { describe, expect, it } from 'vitest'
import type { CanvasElement, CanvasHost } from '@cys-stift/canvas-engine'
import type { Card } from '@cys-stift/domain'
import { buildWorkingSet } from '../working-set'

describe('Working Set privacy', () => {
  it('does not expose a soft-deleted card or capture device metadata', async () => {
    const deleted: Card = {
      id: 'hidden' as Card['id'], title: 'secret', body: 'device-should-not-leak', type: 'note', media: [], links: [], codeSnippets: [], quotes: [],
      source: { kind: 'manual', deviceId: 'device-secret' }, capturedAt: new Date(), createdAt: new Date(), updatedAt: new Date(), tags: [], pinned: false, archived: false, deletedAt: new Date(),
    }
    const element: CanvasElement = { id: 'hidden', kind: 'card', x: 0, y: 0, w: 1, h: 1, rotation: 0 }
    const host: CanvasHost = {
      getElements: () => [element], getElement: () => element, getSelectedIds: () => ['hidden'], setSelectedIds: () => {}, upsert: () => {}, remove: () => {}, batch: (fn) => fn(), applyWithoutEcho: (fn) => fn(),
      onUserChange: () => () => {}, onSelectionChange: () => () => {}, getView: () => ({ panX: 0, panY: 0, zoom: 1, gridMode: 'free' }), setView: () => {}, onViewChange: () => () => {},
    }
    const result = await buildWorkingSet({ host, service: { get: () => deleted } as never, canvasId: 'c', scope: { kind: 'selection' } })
    expect(JSON.stringify(result)).not.toContain('device-secret')
    expect(JSON.stringify(result)).not.toContain('device-should-not-leak')
    expect(result.snapshot.manifest.omitted).toContainEqual({ entityId: 'hidden', reason: 'private' })
  })
})
