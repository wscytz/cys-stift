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

    it('setView 净化脏 view:zoom=0 钳到 0.1(防交互坐标除 0 失真)', () => {
      const h = make()
      h.setView({ panX: 0, panY: 0, zoom: 0, gridMode: 'free' })
      expect(h.getView().zoom).toBe(0.1)
    })

    it('setView 净化脏 view:zoom=NaN 兜底 1', () => {
      const h = make()
      h.setView({ panX: 0, panY: 0, zoom: NaN, gridMode: 'free' })
      expect(h.getView().zoom).toBe(1)
    })

    it('onSelectionChange 在选区实际变化时触发,带新 id 列表', () => {
      const h = make()
      const seen: string[][] = []
      h.onSelectionChange((ids) => seen.push(ids))
      h.setSelectedIds(['a'])
      h.setSelectedIds(['a', 'b'])
      expect(seen).toEqual([['a'], ['a', 'b']])
    })

    it('onSelectionChange 在选区未变化时不触发(去抖)', () => {
      const h = make()
      let fired = 0
      h.onSelectionChange(() => fired++)
      h.setSelectedIds(['a'])
      h.setSelectedIds(['a']) // 同一选区,不应再触发
      expect(fired).toBe(1)
    })

    it('onSelectionChange 取消订阅后不再触发', () => {
      const h = make()
      let fired = 0
      const unsub = h.onSelectionChange(() => fired++)
      unsub()
      h.setSelectedIds(['a'])
      expect(fired).toBe(0)
    })

    it('getElements 按确定性 z 序分层(rect<freedraw<card<arrow<text),与插入序无关', () => {
      // 故意「反序」插入:先 text、再 card、再 rect —— getElements 必须仍按 KIND_LAYER 出。
      const h = make()
      h.upsert({ id: 't', kind: 'text', x: 0, y: 0, w: 1, h: 1, rotation: 0 })
      h.upsert({ id: 'c', kind: 'card', x: 0, y: 0, w: 1, h: 1, rotation: 0 })
      h.upsert({ id: 'r', kind: 'rect', x: 0, y: 0, w: 1, h: 1, rotation: 0 })
      h.upsert({ id: 'f', kind: 'freedraw', x: 0, y: 0, w: 1, h: 1, rotation: 0 })
      h.upsert({ id: 'a', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'c', to: 'c' })
      expect(h.getElements().map((e) => e.kind)).toEqual([
        'rect', 'freedraw', 'card', 'arrow', 'text',
      ])
    })

    it('同 kind 内保插入序(后建在上)', () => {
      const h = make()
      h.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 1, h: 1, rotation: 0 })
      h.upsert({ id: 'c2', kind: 'card', x: 0, y: 0, w: 1, h: 1, rotation: 0 })
      h.upsert({ id: 'c3', kind: 'card', x: 0, y: 0, w: 1, h: 1, rotation: 0 })
      expect(h.getElements().map((e) => e.id)).toEqual(['c1', 'c2', 'c3'])
    })
  })
}

runContract('InMemoryCanvasHost', () => new InMemoryCanvasHost())
runContract('SelfBuiltAdapter', () => new SelfBuiltAdapter(document.createElement('canvas')))
