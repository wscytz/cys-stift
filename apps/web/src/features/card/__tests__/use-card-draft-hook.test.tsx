import { describe, expect, it, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Card } from '@cys-stift/domain'
import { useCardDraft, type CardDraftApi } from '../use-card-draft'
import { CARD_FIELDS } from '../field-registry'

// reset 身份稳定性回归(#4):跨 tab storage 同步会重建整批 card 对象(card 引用变)。
// 若 reset 的 useCallback 依赖 card 对象身份,workbench 的 [card.id, reset] effect 会
// 误触发 → 静默清掉进行中的草稿。修复后 reset 从 ref 读最新 card,身份稳定(空 deps)。
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function renderHook(card: Card): { current: CardDraftApi; rerender: (c: Card) => void; unmount: () => void } {
  const holder: { current: CardDraftApi } = {} as { current: CardDraftApi }
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  function Probe({ c }: { c: Card }) {
    holder.current = useCardDraft(c, CARD_FIELDS)
    return null
  }
  act(() => {
    root.render(<Probe c={card} />)
  })
  return {
    get current() {
      return holder.current
    },
    rerender(c: Card) {
      act(() => {
        root.render(<Probe c={c} />)
      })
    },
    unmount() {
      act(() => {
        root.unmount()
      })
      host.remove()
    },
  }
}

function makeCard(id: string, body: string): Card {
  return {
    id,
    title: 'T',
    body,
    type: 'note',
    media: [],
    links: [],
    codeSnippets: [],
    quotes: [],
    source: { kind: 'manual', deviceId: 'd' } as never,
    capturedAt: new Date('2026-01-01T00:00:00Z'),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    tags: [],
    pinned: false,
    archived: false,
  } as unknown as Card
}

describe('useCardDraft — reset 身份稳定性(跨 tab 同步不误重置草稿)', () => {
  it('card 对象重建(引用变、id 不变)→ reset 身份不变,不清空进行中的草稿', () => {
    const c1 = makeCard('c1', '旧正文')
    const hook = renderHook(c1)
    // 用户开始编辑
    act(() => {
      hook.current.setField('body', '用户正在输入的正文')
    })
    expect(hook.current.dirty).toBe(true)
    const resetBefore = hook.current.reset
    // 模拟跨 tab 同步:同 id 重建一个全新 card 对象(内容也更新)
    const c1Rebuilt = makeCard('c1', '旧正文') // 引用全新的对象,id 相同
    hook.rerender(c1Rebuilt)
    // 修复前:reset 身份随 card 变 → workbench effect 触发 reset → 草稿被清
    // 修复后:reset 稳定 → 草稿保留(用户未保存的输入不丢)
    expect(hook.current.reset).toBe(resetBefore)
    expect(hook.current.draft.body).toBe('用户正在输入的正文')
    expect(hook.current.dirty).toBe(true)
    hook.unmount()
  })

  it('真正切换 card.id → 壳调 reset 生效(草稿重置为新卡)', () => {
    const hook = renderHook(makeCard('c1', 'A'))
    act(() => {
      hook.current.setField('body', 'c1 草稿')
    })
    hook.rerender(makeCard('c2', 'B'))
    // 壳(workbench/card-detail)在 card.id 变时调 reset;hook 本身不自动重置。
    act(() => {
      hook.current.reset()
    })
    expect(hook.current.draft.body).toBe('B')
    expect(hook.current.dirty).toBe(false)
    hook.unmount()
  })

  it('reset 手动调用 → 从最新 card 重初始化(ref 读取,非旧卡)', () => {
    const hook = renderHook(makeCard('c1', 'A'))
    hook.rerender(makeCard('c1', 'B')) // 同 id 新对象,body 变了
    act(() => {
      hook.current.reset()
    })
    expect(hook.current.draft.body).toBe('B')
    hook.unmount()
  })
})
