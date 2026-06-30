/**
 * 双层渲染缓存回归 — v0.40 手测反馈:大画布拖箭头卡顿。
 * 根因:renderNow 每帧全量 sortByLayer + 视口剔除。connect 预览未做增量。
 * 修复:静态层(层排序)+ 视口剔除结果缓存,元素集/view 不变时不重算。
 *
 * 关键设计点(曾踩坑):getSortedElements 必须直接读 this.elements(Map),
 * **不调 getElements()** —— 后者每次都 sortByLayer,若经它查缓存,排序发生在
 * 缓存检查之前,缓存形同虚设。这里用"同一数组引用 = 缓存命中"直接验证。
 *
 * 约束:jsdom 下 ctx===null,renderNow 跳过渲染。故直接测私有 getSortedElements /
 * getVisibleElements(经 cast),不依赖 renderNow/ctx。
 */
import { describe, expect, it } from 'vitest'
import { SelfBuiltAdapter } from '../self-built-adapter'
import type { CanvasElement } from '../canvas-host'

type CacheHost = {
  upsert(el: CanvasElement): void
  remove(id: string): void
  getSortedElements: () => CanvasElement[]
  getVisibleElements: (vp: { x: number; y: number; w: number; h: number }, w: number, h: number) => CanvasElement[]
}

function makeHost(): CacheHost {
  // 直接 cast 为 CacheHost(不经 SelfBuiltAdapter 交集 —— 后者有 private
  // getVisibleElements,与这里的 public 声明冲突致交集退化为 never)。
  return new SelfBuiltAdapter(document.createElement('canvas')) as unknown as CacheHost
}

const VP = { x: 0, y: 0, w: 800, h: 600 }

describe('[渲染缓存] 静态层 getSortedElements', () => {
  it('元素集不变 → 连续调用返回同一引用(缓存命中,不重排)', () => {
    const host = makeHost()
    host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 })
    const first = host.getSortedElements()
    const second = host.getSortedElements()
    expect(second).toBe(first) // 同一引用 = 命中缓存,未重算
  })

  it('upsert 后 → 返回新引用(缓存失效重排)', () => {
    const host = makeHost()
    host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 })
    const before = host.getSortedElements()
    host.upsert({ id: 'b', kind: 'card', x: 300, y: 0, w: 100, h: 100, rotation: 0 })
    const after = host.getSortedElements()
    expect(after).not.toBe(before) // 失效 → 新数组
    expect(after.map((e) => e.id)).toContain('b')
  })

  it('remove 后 → 缓存失效', () => {
    const host = makeHost()
    host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 })
    const before = host.getSortedElements()
    host.remove('a')
    const after = host.getSortedElements()
    expect(after).not.toBe(before)
    expect(after).toHaveLength(0)
  })
})

describe('[渲染缓存] 视口剔除 getVisibleElements', () => {
  it('元素集 + view 不变 → 同一引用(缓存命中)', () => {
    const host = makeHost()
    host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 })
    const first = host.getVisibleElements(VP, 800, 600)
    const second = host.getVisibleElements(VP, 800, 600)
    expect(second).toBe(first)
  })

  it('view 变化(pan) → 视口剔除重算,但层排序缓存仍命中', () => {
    const host = makeHost()
    host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 })
    const sortedBefore = host.getSortedElements()
    const vis1 = host.getVisibleElements(VP, 800, 600)
    // pan 改变视口 → visible 重算
    const vis2 = host.getVisibleElements({ x: 500, y: 0, w: 800, h: 600 }, 800, 600)
    expect(vis2).not.toBe(vis1)
    // 但 sorted 未变(元素集没变)→ 仍命中
    expect(host.getSortedElements()).toBe(sortedBefore)
  })

  it('upsert 后 → 视口剔除也失效(连带)', () => {
    const host = makeHost()
    host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 })
    const vis1 = host.getVisibleElements(VP, 800, 600)
    host.upsert({ id: 'b', kind: 'card', x: 300, y: 0, w: 100, h: 100, rotation: 0 })
    const vis2 = host.getVisibleElements(VP, 800, 600)
    expect(vis2).not.toBe(vis1)
    expect(vis2.map((e) => e.id)).toContain('b')
  })
})
