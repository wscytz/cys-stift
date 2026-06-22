import { describe, expect, it } from 'vitest'
import { SelfBuiltAdapter } from '../self-built-adapter'

describe('SelfBuiltAdapter drag → onUserChange', () => {
  it('upsert during drag emits UserChange (canvas-binding writes back via this)', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    const changes: { updated: unknown[]; removed: string[] }[] = []
    host.onUserChange((c) => changes.push(c))
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
    host.upsert({ id: 'c1', kind: 'card', x: 5, y: 6, w: 10, h: 10, rotation: 0 })
    expect(changes).toHaveLength(2)
    expect(changes[1]!.updated[0]).toMatchObject({ id: 'c1', x: 5, y: 6 })
  })

  it('drag under applyWithoutEcho does NOT emit (writeback-loop suppression)', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    let fired = 0
    host.onUserChange(() => fired++)
    host.applyWithoutEcho(() => host.upsert({ id: 'c1', kind: 'card', x: 1, y: 1, w: 1, h: 1, rotation: 0 }))
    expect(fired).toBe(0)
  })
})
