import { describe, expect, it } from 'vitest'
import { InMemoryCanvasHost } from '../in-memory-host'
import { SelfBuiltAdapter } from '../self-built-adapter'
import type { CanvasHost, UserChange } from '../canvas-host'

/**
 * 契约测试:任何 CanvasHost 实现都必须通过这套。
 * Phase 0 对 InMemoryCanvasHost 跑;Task 2 后同一套对 TldrawAdapter 跑(e2e),
 * Phase 1 对 SelfBuiltAdapter 跑。
 *
 * 用 runContract(makeHost) 形式,以便同一个断言套用在不同实现上。
 */
function runContract(name: string, make: () => CanvasHost) {
  describe(`CanvasHost contract: ${name}`, () => {
    it('upsert → getElement 回读,getElements 返回全部', () => {
      const h = make()
      h.upsert({ id: 'c1', kind: 'card', x: 10, y: 20, w: 240, h: 120, rotation: 0 })
      expect(h.getElement('c1')?.x).toBe(10)
      expect(h.getElements()).toHaveLength(1)
    })

    it('remove 触发 removed id 且不再可见', () => {
      const h = make()
      h.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
      const seen: UserChange[] = []
      h.onUserChange((c) => seen.push(c))
      h.remove('c1')
      expect(seen[0]?.removed).toEqual(['c1'])
      expect(h.getElement('c1')).toBeUndefined()
    })

    it('upsert 更新已存在元素而非重复', () => {
      const h = make()
      h.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
      h.upsert({ id: 'c1', kind: 'card', x: 99, y: 0, w: 10, h: 10, rotation: 0 })
      expect(h.getElements()).toHaveLength(1)
      expect(h.getElement('c1')?.x).toBe(99)
    })

    it('applyWithoutEcho 抑制 onUserChange,退出后恢复', () => {
      const h = make()
      let fired = 0
      h.onUserChange(() => fired++)
      h.applyWithoutEcho(() => {
        h.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 1, h: 1, rotation: 0 })
        h.remove('c1')
      })
      expect(fired).toBe(0)
      // echo 恢复后正常触发
      h.upsert({ id: 'c2', kind: 'card', x: 0, y: 0, w: 1, h: 1, rotation: 0 })
      expect(fired).toBe(1)
    })

    it('onUserChange 取消订阅后不再触发', () => {
      const h = make()
      let fired = 0
      const unsub = h.onUserChange(() => fired++)
      unsub()
      h.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 1, h: 1, rotation: 0 })
      expect(fired).toBe(0)
    })

    it('getView / setView 回读', () => {
      const h = make()
      h.setView({ panX: 5, panY: 6, zoom: 2, gridMode: 'snap' })
      expect(h.getView()).toEqual({ panX: 5, panY: 6, zoom: 2, gridMode: 'snap' })
    })
  })
}

runContract('InMemoryCanvasHost', () => new InMemoryCanvasHost())
runContract('SelfBuiltAdapter', () => new SelfBuiltAdapter(document.createElement('canvas')))
