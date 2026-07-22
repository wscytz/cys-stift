import { describe, it, expect } from 'vitest'
import { applyLayout } from '../apply-layout'
import { InMemoryCanvasHost } from '@cys-stift/canvas-engine'
import { parseDsl } from '@cys-stift/dsl'
import type { CardCreateParams, CardUpdateContent } from '../apply-layout'

/**
 * v5 集成:DSL 带 @title/@content 时,applyLayout 经 onCardCreate(建卡)/ onCardUpdate(改卡)
 * 把内容写到 CardService 侧(CanvasElement 本身无内容字段,靠 handler 桥接)。
 */
describe('applyLayout v5 — DSL apply 写卡片内容(@title/@content)', () => {
  it('card-create with @title/@content → onCardCreate 收到 title/content', () => {
    const host = new InMemoryCanvasHost()
    let created: CardCreateParams | undefined
    const ops = parseDsl('[card #c1 create] @pos(10,20) @size(100,80) @title("Hi") @content("body")')
    applyLayout(host, ops, undefined, (p) => {
      created = p
      return { ok: true }
    })
    expect(created).toMatchObject({ cardId: 'c1', title: 'Hi', content: 'body' })
    expect(host.getElement('c1')).toMatchObject({ x: 10, y: 20 })
  })

  it('card-update with @title/@content → onCardUpdate 收到 title/content', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 100, h: 80, rotation: 0 })
    let updated: CardUpdateContent | undefined
    const ops = parseDsl('[card #c1] @pos(0,0) @title("New Title") @content("new body")')
    applyLayout(host, ops, undefined, undefined, (p) => {
      updated = p
    })
    expect(updated).toMatchObject({ cardId: 'c1', title: 'New Title', content: 'new body' })
  })

  it('card-update without @title/@content → onCardUpdate 不被调用(几何-only)', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 100, h: 80, rotation: 0 })
    let called = false
    const ops = parseDsl('[card #c1] @pos(50,50)')
    applyLayout(host, ops, undefined, undefined, () => {
      called = true
    })
    expect(called).toBe(false)
  })

  it('card-create without @title/@content → onCardCreate params 无 title/content', () => {
    const host = new InMemoryCanvasHost()
    let created: CardCreateParams | undefined
    const ops = parseDsl('[card #c1 create] @pos(0,0) @size(10,10)')
    applyLayout(host, ops, undefined, (p) => {
      created = p
      return { ok: true }
    })
    expect(created?.title).toBeUndefined()
    expect(created?.content).toBeUndefined()
  })

  it('@content 多行经 \\n 在 apply 时还原为真实换行', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
    let updated: CardUpdateContent | undefined
    const ops = parseDsl('[card #c1] @pos(0,0) @content("line1\\nline2")')
    applyLayout(host, ops, undefined, undefined, (p) => {
      updated = p
    })
    expect(updated?.content).toBe('line1\nline2')
  })

  it('v5(E): 无 @pos 的纯内容编辑 → 几何沿用现有卡 + 内容写回(keepExistingPos)', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'c1', kind: 'card', x: 50, y: 60, w: 100, h: 80, rotation: 0 })
    let updated: CardUpdateContent | undefined
    const ops = parseDsl('[card #c1] @title("新标题") @content("新正文")')
    applyLayout(host, ops, undefined, undefined, (p) => {
      updated = p
    })
    expect(updated).toMatchObject({ cardId: 'c1', title: '新标题', content: '新正文' })
    // 几何完全沿用现有卡(不被占位 0,0 覆盖):
    expect(host.getElement('c1')).toMatchObject({ x: 50, y: 60, w: 100, h: 80 })
  })

  it('v5(E): keepExistingPos 指向不存在的卡 → skipped(不能凭空内容编辑)', () => {
    const host = new InMemoryCanvasHost()
    let called = false
    const ops = parseDsl('[card #ghost] @title("x")')
    const r = applyLayout(host, ops, undefined, undefined, () => {
      called = true
    })
    expect(called).toBe(false)
    expect(r.applied).toBe(0)
    expect(r.skipped).toBeGreaterThanOrEqual(1)
  })

  it('v5(E): 无 @pos 的纯 color 编辑 → 几何沿用 + 颜色改(keepExistingPos)', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'c1', kind: 'card', x: 50, y: 60, w: 100, h: 80, rotation: 0, color: 'blue' })
    const ops = parseDsl('[card #c1] @color(red)')
    applyLayout(host, ops, undefined, undefined, () => {})
    expect(host.getElement('c1')).toMatchObject({ x: 50, y: 60, color: 'red' })
  })

  it('v5(D): @title("") / @content("") → onCardUpdate 收到空串(清空意图)', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
    let updated: CardUpdateContent | undefined
    const ops = parseDsl('[card #c1] @pos(0,0) @title("") @content("")')
    applyLayout(host, ops, undefined, undefined, (p) => {
      updated = p
    })
    expect(updated).toMatchObject({ cardId: 'c1', title: '', content: '' })
  })
})
