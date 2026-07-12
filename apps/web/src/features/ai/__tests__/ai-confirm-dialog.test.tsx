// apps/web/src/features/ai/__tests__/ai-confirm-dialog.test.tsx
/**
 * AiConfirmDialog — 画布 AI 确认门三 mode 测。
 * Codebase policy: react-dom/client + act(非 @testing-library/react)。
 */
import { describe, it, expect, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { CanvasHost, CanvasElement } from '@cys-stift/canvas-engine'

const _locale: 'zh' | 'en' = 'zh'
import { messages } from '@/lib/i18n/messages'
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    locale: _locale,
    t: (key: keyof typeof messages, params?: Record<string, string | number | null | undefined>) => {
      const entry = messages[key]
      const msg = entry?.[_locale]
      if (!msg) return String(key)
      if (!params) return msg
      let out: string = msg
      for (const [k, v] of Object.entries(params)) out = out.replace(`{${k}}`, String(v ?? ''))
      return out
    },
  }),
}))
const pushToastSpy = vi.fn()
vi.mock('@/lib/toast-store', () => ({ pushToast: (...args: unknown[]) => pushToastSpy(...args) }))
vi.mock('@/lib/archive-store', () => ({
  archiveStore: { append: vi.fn().mockResolvedValue({}), subscribe: () => () => {}, getVersion: () => 0, listMeta: () => [], loadPayload: () => Promise.resolve(null), ensureReleaseRecord: () => Promise.resolve() },
}))
vi.mock('@/lib/build-archive-payload', () => ({ buildArchivePayload: vi.fn().mockResolvedValue({ cards: [], mediaAssets: {} }) }))

vi.mock('@/features/ai/cluster', () => ({
  applyClusters: vi.fn((host: { upsert: (el: unknown) => void }, _clusters: unknown[]) => {
    // 模拟 cluster apply:往 host upsert 一条 arrow(让预演 after 含箭头 → diff 可见 + apply 可观测)
    host.upsert({ id: 'arr-test', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'c1', to: 'c2', color: 'gray', dash: 'dotted', arrowhead: 'arrow', text: 'related-to' })
    return { arrowsCreated: 1, clustersApplied: 1 }
  }),
  CLUSTER_SYSTEM_PROMPT: '',
  buildClusterUserPrompt: () => '',
  parseClusters: () => [],
}))

vi.mock('@/app/inbox/markdown', () => ({
  MarkdownBody: ({ source }: { source: string }) => <div data-testid="md">{source}</div>,
}))

import { AiConfirmDialog } from '../ai-confirm-dialog'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function makeMockHost(initial: CanvasElement[]) {
  const calls = { batch: 0, upserts: [] as CanvasElement[] }
  let els: CanvasElement[] = [...initial]
  const host: CanvasHost = {
    getElements: () => els,
    getElement: (id: string) => els.find((e) => e.id === id),
    upsert: (el: CanvasElement) => { calls.upserts.push(el); els.push(el) },
    remove: () => {},
    batch: (fn: () => void) => { calls.batch++; fn() },
    applyWithoutEcho: (fn: () => void) => fn(),
    onUserChange: () => () => {},
    onSelectionChange: () => () => {},
    getSelectedIds: () => [],
    setSelectedIds: () => {},
    getView: () => ({ x: 0, y: 0, zoom: 1 }),
    setView: () => {},
    onViewChange: () => () => {},
  } as unknown as CanvasHost
  return { host, calls }
}

const byText = (host: HTMLElement, re: RegExp): HTMLButtonElement | null => {
  for (const el of host.querySelectorAll('button')) if (re.test(el.textContent ?? '')) return el as HTMLButtonElement
  return null
}
function mount(el: React.ReactElement) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => { root.render(el) })
  return { host, root, unmount: () => act(() => root.unmount()) }
}
const flushMicro = () => Promise.resolve()

describe('AiConfirmDialog — dsl mode(layout)', () => {
  it('点应用 → liveHost.batch 被调 + upsert 收到 rect;onApplied 触发', async () => {
    const { host: mockHost, calls } = makeMockHost([])
    const service = { createWithId: vi.fn() } as never
    const onApplied = vi.fn()
    const dsl = '[rect #r1] @pos(100,200) @size(300,400)'
    const { host: dom, unmount } = mount(
      <AiConfirmDialog mode="dsl" dsl={dsl} targetCanvasId={'cv' as never} service={service} liveHost={mockHost} onApplied={onApplied} onRejected={() => {}} />,
    )
    await act(async () => { await flushMicro() })
    const applyBtn = byText(dom, /^应用$|^Apply$/)!
    expect(applyBtn.disabled).toBe(false)
    await act(async () => { applyBtn.click() })
    expect(calls.batch).toBeGreaterThanOrEqual(1)
    expect(calls.upserts.some((e) => (e as { kind?: string }).kind === 'rect')).toBe(true)
    expect(onApplied).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('parseError 态(空 DSL)→ 显示错误 + 无应用按钮', async () => {
    const { host: mockHost } = makeMockHost([])
    const service = { createWithId: vi.fn() } as never
    const { host: dom, unmount } = mount(
      <AiConfirmDialog mode="dsl" dsl="[rect]" targetCanvasId={'cv' as never} service={service} liveHost={mockHost} onApplied={() => {}} onRejected={() => {}} />,
    )
    await act(async () => { await flushMicro() })
    expect(byText(dom, /^应用$|^Apply$/)).toBeNull() // 应用按钮不出现(parseError)
    unmount()
  })
})

describe('AiConfirmDialog — cluster mode', () => {
  it('点应用 → liveHost.batch 被调(单 undo);摘要显示将新增箭头', async () => {
    // 初始 2 张卡(供 cluster 连)
    const initial: CanvasElement[] = [
      { id: 'c1', kind: 'card', x: 0, y: 0, w: 100, h: 50, rotation: 0, color: 'white' } as CanvasElement,
      { id: 'c2', kind: 'card', x: 200, y: 0, w: 100, h: 50, rotation: 0, color: 'white' } as CanvasElement,
    ]
    const { host: mockHost, calls } = makeMockHost(initial)
    const service = { get: () => ({ id: 'c1' }) } as never
    const onApplied = vi.fn()
    const { host: dom, unmount } = mount(
      <AiConfirmDialog mode="cluster" clusters={[{ ids: ['c1', 'c2'], kind: 'related', reason: 'x' }]} targetCanvasId={'cv' as never} service={service} liveHost={mockHost} onApplied={onApplied} onRejected={() => {}} />,
    )
    await act(async () => { await flushMicro() })
    // 摘要:diff added arrow 可见("新增"/"关系" 文案)。mocked applyClusters 往预演 host upsert 了 arrow。
    expect(dom.textContent).toMatch(/新增|关系|relation|arrow/i)
    const applyBtn = byText(dom, /^应用$|^Apply$/)!
    await act(async () => { applyBtn.click() })
    // cluster apply 走 liveHost.batch(外部包,单 undo)
    expect(calls.batch).toBeGreaterThanOrEqual(1)
    expect(onApplied).toHaveBeenCalledTimes(1)
    unmount()
  })
})

describe('AiConfirmDialog — outline mode', () => {
  it('渲染 markdown 预览;点应用 → service.create 建卡;onApplied 触发', async () => {
    const created: unknown[] = []
    const service = { create: (input: unknown) => { created.push(input) } } as never
    const onApplied = vi.fn()
    const { host: dom, unmount } = mount(
      <AiConfirmDialog mode="outline" outlineMarkdown={'## T\n- a'} canvasId={'cv' as never} service={service} onApplied={onApplied} onRejected={() => {}} />,
    )
    await act(async () => { await flushMicro() })
    expect(dom.querySelector('[data-testid="md"]')?.textContent).toBe('## T\n- a')
    const applyBtn = byText(dom, /^应用$|^Apply$/)!
    await act(async () => { applyBtn.click() })
    expect(created).toHaveLength(1)
    expect((created[0] as { body: string }).body).toBe('## T\n- a')
    expect(onApplied).toHaveBeenCalledTimes(1)
    unmount()
  })
})
