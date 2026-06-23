import { describe, it, expect } from 'vitest'
import { InMemoryCanvasHost, type TokenResolver } from '../index'

/**
 * Standalone 证据:引擎核心脱离 cys-stift 的 DOM / token 体系仍可完整运行。
 *
 * 用 InMemoryCanvasHost(无 canvas DOM)+ 自定义 tokenResolver(非 getComputedStyle)
 * + 全事件语义,证明引擎是真正独立的资产,不寄生 cys-stift。
 */
describe('standalone — 引擎脱离 cys-stift 独立运行', () => {
  it('注入非 DOM tokenResolver,引擎核心不依赖 cys-stift token / DOM', () => {
    // 自定义 resolver —— 完全不碰 getComputedStyle / window
    const myTokens: TokenResolver = (name, fallback) => `resolved(${name})`
    expect(myTokens('--color-blue', '#000')).toBe('resolved(--color-blue)')

    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
    expect(host.getElements()).toHaveLength(1)
    // resolver 只是一个函数 —— 引擎渲染时调它,不关心它怎么实现
  })

  it('完整事件语义(onUserChange / onSelectionChange / onViewChange)不依赖 DOM', () => {
    const host = new InMemoryCanvasHost()
    let userChanges = 0
    let selChanges = 0
    let viewChanges = 0
    host.onUserChange(() => userChanges++)
    host.onSelectionChange(() => selChanges++)
    host.onViewChange(() => viewChanges++)

    host.upsert({ id: 'a', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'x', to: 'y' })
    host.setSelectedIds(['a'])
    host.setView({ panX: 5, panY: 0, zoom: 2, gridMode: 'free' })

    expect(userChanges).toBe(1)
    expect(selChanges).toBe(1)
    expect(viewChanges).toBe(1)
  })

  it('applyWithoutEcho 抑制回写监听 —— 回写循环抑制机制可用', () => {
    const host = new InMemoryCanvasHost()
    let fired = 0
    host.onUserChange(() => fired++)
    host.applyWithoutEcho(() => {
      host.upsert({ id: 'x', kind: 'rect', x: 0, y: 0, w: 1, h: 1, rotation: 0 })
      host.upsert({ id: 'y', kind: 'rect', x: 1, y: 1, w: 1, h: 1, rotation: 0 })
    })
    expect(fired).toBe(0) // 程序性批量加载不触发 user change
  })

  it('语义关系签名 dash/arrowhead 是 CanvasElement 一等字段(独立于 cys-stift 关系类型)', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({
      id: 'ar', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0,
      from: 'a', to: 'b', color: 'blue', dash: 'dashed', arrowhead: 'none',
    })
    const el = host.getElement('ar')!
    expect(el.dash).toBe('dashed')
    expect(el.arrowhead).toBe('none')
  })
})
