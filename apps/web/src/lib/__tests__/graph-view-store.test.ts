import { describe, expect, it, beforeEach } from 'vitest'
import { graphViewStore } from '../graph-view-store'

beforeEach(() => {
  window.localStorage.clear()
  // 重置 store 内部 hydration + 内存(模块单例,需通过 resetAll)
  graphViewStore.resetAll()
})

describe('graph-view-store', () => {
  it('默认视口 zoom=1 panX=0 panY=0', () => {
    const v = graphViewStore.getView()
    expect(v).toEqual({ zoom: 1, panX: 0, panY: 0 })
  })

  it('updateView 持久化 + 读取', () => {
    graphViewStore.updateView({ zoom: 2, panX: 100, panY: 50 })
    expect(graphViewStore.getView()).toEqual({ zoom: 2, panX: 100, panY: 50 })
    // reload 模拟:新 store 实例从 localStorage 读(同模块,hydrateOnce 已 hydrate)
    expect(graphViewStore.getView().zoom).toBe(2)
  })

  it('忽略运行时 NaN/Infinity 视口写入,不污染当前图谱', () => {
    graphViewStore.updateView({ zoom: 2, panX: 10, panY: 20 })
    graphViewStore.updateView({ zoom: Number.NaN, panX: Number.POSITIVE_INFINITY })
    expect(graphViewStore.getView()).toEqual({ zoom: 2, panX: 10, panY: 20 })
  })

  it('节点坐标:setPosition / getPosition', () => {
    graphViewStore.setPosition('n1', { x: 10, y: 20, fx: 10, fy: 20 })
    expect(graphViewStore.getPosition('n1')).toEqual({ x: 10, y: 20, fx: 10, fy: 20 })
  })

  it('拒绝非有限节点坐标并丢弃半截固定点', () => {
    graphViewStore.setPosition('bad', { x: Number.NaN, y: 2 })
    expect(graphViewStore.getPosition('bad')).toBeNull()
    graphViewStore.setPosition('partial', { x: 1, y: 2, fx: 3, fy: Number.NaN })
    expect(graphViewStore.getPosition('partial')).toEqual({ x: 1, y: 2 })
    graphViewStore.setPositions({
      good: { x: 4, y: 5, fx: 6, fy: 7 },
      bad: { x: Number.POSITIVE_INFINITY, y: 8 },
    })
    expect(graphViewStore.getPosition('good')).toEqual({ x: 4, y: 5, fx: 6, fy: 7 })
    expect(graphViewStore.getPosition('bad')).toBeNull()
  })

  it('节点坐标:批量覆盖 setPositions(过滤掉传入但不在 knownIds 的? — 不过滤,全存)', () => {
    graphViewStore.setPositions({ n1: { x: 1, y: 2 }, n2: { x: 3, y: 4 } })
    expect(graphViewStore.getPosition('n1')).toEqual({ x: 1, y: 2 })
    expect(graphViewStore.getPosition('n2')).toEqual({ x: 3, y: 4 })
  })

  it('删除节点:prunePositions(knownIds) 清掉未知节点缓存', () => {
    graphViewStore.setPositions({ n1: { x: 1, y: 2 }, n2: { x: 3, y: 4 } })
    graphViewStore.prunePositions(new Set(['n1']))
    expect(graphViewStore.getPosition('n1')).toEqual({ x: 1, y: 2 })
    expect(graphViewStore.getPosition('n2')).toBeNull()
  })

  it('getAllPositions 返回全部(供 mount 恢复)', () => {
    graphViewStore.setPositions({ n1: { x: 1, y: 2 } })
    expect(graphViewStore.getAllPositions()).toEqual({ n1: { x: 1, y: 2 } })
  })

  it('resetAll 清空视口 + 坐标', () => {
    graphViewStore.updateView({ zoom: 3, panX: 1, panY: 1 })
    graphViewStore.setPositions({ n1: { x: 1, y: 2 } })
    graphViewStore.resetAll()
    expect(graphViewStore.getView()).toEqual({ zoom: 1, panX: 0, panY: 0 })
    expect(graphViewStore.getAllPositions()).toEqual({})
  })
})
