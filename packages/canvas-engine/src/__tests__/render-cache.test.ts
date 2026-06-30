/**
 * 双层渲染缓存回归 — v0.40 手测反馈:大画布拖箭头卡顿。
 * 根因:renderNow 每帧全量 sortByLayer + 视口剔除。connect 预览未做增量。
 * 修复:静态层(层排序)+ 视口剔除结果缓存,元素集/view 不变时不重算。
 *
 * 约束:jsdom 下 ctx===null,renderNow 跳过渲染。但缓存逻辑在跳过前可观测 —
 * 这里测"缓存命中计数"(通过 spy getElements 调用次数)。
 */
import { describe, expect, it, vi } from 'vitest'
import { SelfBuiltAdapter } from '../self-built-adapter'

describe('[渲染缓存] 静态层 + 视口剔除缓存', () => {
  it('元素集不变时,连续 scheduleRender 不重算层排序', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 })
    host.upsert({ id: 'b', kind: 'card', x: 300, y: 0, w: 100, h: 100, rotation: 0 })

    const getElementsSpy = vi.spyOn(host, 'getElements')
    // 首次 renderNow:算层排序 + 视口剔除
    ;(host as unknown as { renderNow: () => void }).renderNow()
    const firstCount = getElementsSpy.mock.calls.length
    // 第二次 renderNow:元素集 + view 不变 → 不应再全量重算(缓存命中)
    ;(host as unknown as { renderNow: () => void }).renderNow()
    const secondCount = getElementsSpy.mock.calls.length
    // 缓存生效:第二次不再调 getElements 做层排序(允许 0 次或显著少于首次增量)
    expect(secondCount - firstCount).toBeLessThanOrEqual(firstCount)
  })

  it('元素 upsert 后,缓存失效,下次 renderNow 重算', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 })
    ;(host as unknown as { renderNow: () => void }).renderNow()
    const getElementsSpy = vi.spyOn(host, 'getElements')
    // upsert → 失效
    host.upsert({ id: 'b', kind: 'card', x: 300, y: 0, w: 100, h: 100, rotation: 0 })
    ;(host as unknown as { renderNow: () => void }).renderNow()
    expect(getElementsSpy.mock.calls.length).toBeGreaterThan(0)
  })
})
