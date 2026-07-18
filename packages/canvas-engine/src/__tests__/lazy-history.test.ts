import { describe, expect, it } from 'vitest'
import { InMemoryCanvasHost } from '../in-memory-host'
import { SelfBuiltAdapter } from '../self-built-adapter'

type InspectableHistory = { undoStack: unknown[] }

function historyLength(host: object): number {
  return (host as unknown as InspectableHistory).undoStack.length
}

describe.each([
  ['InMemoryCanvasHost', () => new InMemoryCanvasHost()],
  ['SelfBuiltAdapter', () => new SelfBuiltAdapter(document.createElement('canvas'))],
])('%s lazy batch history', (_name, makeHost) => {
  it('empty/read-only/no-op batch does not create undo history', () => {
    const host = makeHost()
    const before = historyLength(host)
    host.batch(() => {})
    host.batch(() => { host.getElements() })
    host.batch(() => { host.remove('missing') })
    expect(historyLength(host)).toBe(before)
  })

  it('first real mutation in a batch creates exactly one undo snapshot', () => {
    const host = makeHost()
    const before = historyLength(host)
    host.batch(() => {
      host.upsert({ id: 'a', kind: 'rect', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
      host.upsert({ id: 'b', kind: 'rect', x: 20, y: 0, w: 10, h: 10, rotation: 0 })
    })
    expect(historyLength(host) - before).toBe(1)
  })

  it('applyWithoutEcho mutations inside batch remain history-free', () => {
    const host = makeHost()
    const before = historyLength(host)
    host.batch(() => {
      host.applyWithoutEcho(() => {
        host.upsert({ id: 'hydrate', kind: 'rect', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
      })
    })
    expect(historyLength(host)).toBe(before)
  })
})
