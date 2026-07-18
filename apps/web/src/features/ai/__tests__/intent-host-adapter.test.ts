import { beforeEach, describe, expect, it } from 'vitest'
import { InMemoryCanvasHost } from '@cys-stift/canvas-engine'
import type { Card, CardId, CardService, CanvasId } from '@cys-stift/domain'
import { compileIntent } from '../intent-compiler'
import { commitIntentPlan } from '../apply-plan'
import { intentSnapshotFromHost, makeIntentCommitPort } from '../intent-host-adapter'
import { canvasFreeformStore } from '@/lib/canvas-freeform-store'

function card(id: string): Card {
  return {
    id: id as CardId, title: id, body: '', type: 'note', media: [], links: [], codeSnippets: [], quotes: [],
    source: { kind: 'manual', deviceId: 'test' }, capturedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
    tags: [], pinned: false, archived: false,
    canvasPosition: { canvasId: 'canvas-1' as CanvasId, x: 0, y: 0, w: 100, h: 80, z: 0, rotation: 0 },
  }
}

function serviceFor(initial: Card, failWrites = false): CardService {
  let current = structuredClone(initial)
  return {
    get: () => structuredClone(current),
    moveToCanvas: (_id: CardId, position: Card['canvasPosition']) => {
      if (!failWrites && position) current = { ...current, canvasPosition: structuredClone(position) }
    },
    removeFromCanvas: () => { if (!failWrites) current = { ...current, canvasPosition: undefined } },
    update: (_id: CardId, patch: Partial<Card>) => {
      if (!failWrites) current = { ...current, ...patch }
      return structuredClone(current)
    },
  } as unknown as CardService
}

beforeEach(() => window.localStorage.clear())

describe('intent host adapter', () => {
  it('persists a card before applying the exact preview to the host', async () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 80, rotation: 0 })
    const service = serviceFor(card('a'))
    const snapshot = intentSnapshotFromHost(host)
    const compiled = compileIntent({
      kind: 'cys-intent', version: 1, baseRevision: snapshot.revision, mode: 'edit',
      ops: [{ op: 'update', target: 'a', patch: { color: 'red', width: 140 } }],
    }, snapshot)
    expect(compiled.ok).toBe(true)
    if (!compiled.ok) return
    const report = await commitIntentPlan(compiled.plan, makeIntentCommitPort({ host, service, canvasId: 'canvas-1' as CanvasId }))
    expect(report).toMatchObject({ applied: 1, failed: 0, cardsUpdated: 1 })
    expect(host.getElement('a')).toMatchObject({ color: 'red', w: 140 })
    expect(service.get('a' as CardId)?.canvasPosition?.w).toBe(140)
  })

  it('keeps the host unchanged when card persistence cannot be verified', async () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 80, rotation: 0 })
    const service = serviceFor(card('a'), true)
    const snapshot = intentSnapshotFromHost(host)
    const compiled = compileIntent({
      kind: 'cys-intent', version: 1, baseRevision: snapshot.revision, mode: 'edit',
      ops: [{ op: 'update', target: 'a', patch: { width: 140 } }],
    }, snapshot)
    if (!compiled.ok) return
    const report = await commitIntentPlan(compiled.plan, makeIntentCommitPort({ host, service, canvasId: 'canvas-1' as CanvasId }))
    expect(report.failed).toBe(1)
    expect(host.getElement('a')?.w).toBe(100)
  })

  it('removes newly persisted freeform data when host commit fails', async () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 80, rotation: 0 })
    host.upsert({ id: 'b', kind: 'card', x: 200, y: 0, w: 100, h: 80, rotation: 0 })
    const service = serviceFor(card('a'))
    const snapshot = intentSnapshotFromHost(host)
    const compiled = compileIntent({
      kind: 'cys-intent', version: 1, baseRevision: snapshot.revision, mode: 'create',
      ops: [{ op: 'connect', id: 'edge-ab', from: 'a', to: 'b', create: true }],
    }, snapshot)
    if (!compiled.ok) return
    const hostUpsert = host.upsert.bind(host)
    let failOnce = true
    host.upsert = (element) => {
      hostUpsert(element)
      if (failOnce) {
        failOnce = false
        throw new Error('host failed after partial mutation')
      }
    }
    const report = await commitIntentPlan(compiled.plan, makeIntentCommitPort({ host, service, canvasId: 'canvas-1' as CanvasId }))
    expect(report.diagnostics[0]?.code).toBe('HOST_COMMIT_FAILED')
    expect(await canvasFreeformStore.load('canvas-1' as CanvasId)).toBeNull()
    expect(host.getElement('edge-ab')).toBeUndefined()
    expect(host.getElements().map((element) => element.id).sort()).toEqual(['a', 'b'])
  })
})
