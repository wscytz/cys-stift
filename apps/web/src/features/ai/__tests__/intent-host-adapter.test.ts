import { beforeEach, describe, expect, it } from 'vitest'
import { InMemoryCanvasHost } from '@cys-stift/canvas-engine'
import type { Card, CardId, CardService, CanvasId } from '@cys-stift/domain'
import { compileIntent } from '../intent-compiler'
import { commitIntentPlan } from '../apply-plan'
import { intentSnapshotFromHost, makeIntentCommitPort, toCanvasElement, toIntentElement } from '../intent-host-adapter'
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

  it('round-trips route/curve/elbow/meta through toIntentElement/toCanvasElement', () => {
    // 回归(2026-11-16 用户报"AI 画完后人修改失败"):此前快照往返裁掉这四类字段,
    // AI 触碰过的元素丢失组级锚(group)、弯折形态(route/curve/elbow)、freedraw 点序列(meta.points)。
    const source = {
      id: 'edge-1', kind: 'arrow' as const, x: 0, y: 0, w: 0, h: 0, rotation: 0,
      from: 'a', to: 'b', route: 'elbow' as const,
      elbow: [{ x: 50, y: 10 }, { x: 50, y: 40 }],
      meta: { group: 'ideas', points: [1, 2, 3] },
    }
    const intent = toIntentElement(source as never)
    expect(intent).toMatchObject({
      route: 'elbow',
      elbow: [{ x: 50, y: 10 }, { x: 50, y: 40 }],
      meta: { group: 'ideas', points: [1, 2, 3] },
    })
    const back = toCanvasElement(intent!)
    expect(back.route).toBe('elbow')
    expect(back.elbow).toEqual([{ x: 50, y: 10 }, { x: 50, y: 40 }])
    expect(back.meta).toEqual({ group: 'ideas', points: [1, 2, 3] })
    // 嵌套可变部分必须与源对象解耦(快照防共享引用)
    expect(back.elbow).not.toBe(source.elbow)
    expect(back.meta).not.toBe(source.meta)
  })

  it('applies plan with echo so undo and onUserChange observe AI changes', async () => {
    // 回归(同上):此前 applyWithoutEcho 让 AI 变更不进 undo 栈、不触发 onUserChange——
    // ⌘Z 直接跳回 AI 前整表替换(布局全没)、面板陈旧、AI 新建箭头删除后不落盘。
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 80, rotation: 0 })
    const service = serviceFor(card('a'))
    const snapshot = intentSnapshotFromHost(host)
    const compiled = compileIntent({
      kind: 'cys-intent', version: 1, baseRevision: snapshot.revision, mode: 'edit',
      ops: [{ op: 'update', target: 'a', patch: { width: 140 } }],
    }, snapshot)
    if (!compiled.ok) return
    const changes: unknown[] = []
    host.onUserChange((change) => changes.push(change))
    const port = makeIntentCommitPort({ host, service, canvasId: 'canvas-1' as CanvasId })
    const report = await commitIntentPlan(compiled.plan, port)
    expect(report.applied).toBe(1)
    // echo 生效:onUserChange 收到这次 AI 变更
    expect(changes.length).toBeGreaterThan(0)
    // undo 栈收录 AI 变更:undo 一步恰好撤掉它(宽 140 → 回 80),而非跳回更早状态
    host.undo()
    expect(host.getElement('a')?.w).toBe(100)
  })
})
