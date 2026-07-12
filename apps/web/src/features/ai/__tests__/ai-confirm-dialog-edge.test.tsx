// apps/web/src/features/ai/__tests__/ai-confirm-dialog-edge.test.tsx
/**
 * AiConfirmDialog — edge-case gap 补测(配合 ai-confirm-dialog.test.tsx)。
 *
 * 覆盖盲区:
 *  1. dsl 编辑后 preview/diff 重算(ops 来自 editedDsl,非 props.dsl)
 *  2. dsl reject(sampleContext 在)→ addSample outcome 'rejected'
 *  3. cluster mode 无编辑按钮(props.mode !== 'cluster' 守卫)
 *  4. outline apply 抛错 → phase=error + toast + onApplied 不触发
 *  5. dsl 无变更(totalChanges===0)→ 应用按钮 disabled
 *  6. dsl reject(无 sampleContext)→ addSample 不被调(守卫)
 *
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

// sample-store mock:spy addSample(验证 reject/applied 记样本)。
const addSampleSpy = vi.fn()
vi.mock('@/features/ai/sample-store', () => ({
  addSample: (...args: unknown[]) => addSampleSpy(...args),
  genSampleId: () => 'sample-test-id',
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

/** 读 diff 区"新增 N"标签里的 N(无 diff 区返回 null)。 */
function addedCount(dom: HTMLElement): number | null {
  const labels = dom.querySelectorAll('.ac__group-label')
  for (const l of labels) {
    const m = (l.textContent ?? '').match(/新增\s*(\d+)/)
    if (m) return Number(m[1])
  }
  return null
}

describe('AiConfirmDialog edge — dsl 编辑后 preview/diff 重算', () => {
  it('edit DSL → afterState 重算 → diff 新增数从 1 变 2', async () => {
    const { host: mockHost } = makeMockHost([])
    const service = { createWithId: vi.fn() } as never
    const dsl1 = '[rect #r1] @pos(100,200) @size(300,400)'
    const { host: dom, unmount } = mount(
      <AiConfirmDialog mode="dsl" dsl={dsl1} targetCanvasId={'cv' as never} service={service} liveHost={mockHost} onApplied={() => {}} onRejected={() => {}} />,
    )
    await act(async () => { await flushMicro() })
    // 初始:1 个 rect → diff 新增 1
    expect(addedCount(dom)).toBe(1)

    // 点 edit → textarea
    const editBtn = byText(dom, /^编辑 DSL$|^Edit DSL$/)!
    await act(async () => { editBtn.click() })
    const ta = dom.querySelector('textarea') as HTMLTextAreaElement
    expect(ta).toBeTruthy()

    // 编辑为 2 个 rect
    const dsl2 = '[rect #r1] @pos(100,200) @size(300,400)\n[rect #r2] @pos(500,500) @size(100,100)'
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(ta, dsl2)
      ta.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => { await flushMicro() })

    // preview 用 editedDsl 重算 → afterState 2 rect → diff 新增 2
    expect(addedCount(dom)).toBe(2)
    unmount()
  })
})

describe('AiConfirmDialog edge — dsl reject 记样本', () => {
  it('reject(有 sampleContext)→ addSample outcome=rejected', async () => {
    const { host: mockHost } = makeMockHost([])
    const service = { createWithId: vi.fn() } as never
    const onRejected = vi.fn()
    const { host: dom, unmount } = mount(
      <AiConfirmDialog
        mode="dsl"
        dsl="[rect #r1] @pos(100,200) @size(300,400)"
        targetCanvasId={'cv' as never}
        service={service}
        liveHost={mockHost}
        sampleContext={{ source: 'layout', context: 'ctx', targetCanvasId: 'cv' }}
        onApplied={() => {}}
        onRejected={onRejected}
      />,
    )
    await act(async () => { await flushMicro() })
    addSampleSpy.mockClear()
    const rejectBtn = byText(dom, /^拒绝$|^Reject$/)!
    await act(async () => { rejectBtn.click() })
    expect(addSampleSpy).toHaveBeenCalledTimes(1)
    const sample = addSampleSpy.mock.calls[0]![0] as { outcome: string }
    expect(sample.outcome).toBe('rejected')
    expect(onRejected).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('reject(无 sampleContext)→ addSample 不被调', async () => {
    const { host: mockHost } = makeMockHost([])
    const service = { createWithId: vi.fn() } as never
    const { host: dom, unmount } = mount(
      <AiConfirmDialog mode="dsl" dsl="[rect #r1] @pos(100,200) @size(300,400)" targetCanvasId={'cv' as never} service={service} liveHost={mockHost} onApplied={() => {}} onRejected={() => {}} />,
    )
    await act(async () => { await flushMicro() })
    addSampleSpy.mockClear()
    const rejectBtn = byText(dom, /^拒绝$|^Reject$/)!
    await act(async () => { rejectBtn.click() })
    expect(addSampleSpy).not.toHaveBeenCalled()
    unmount()
  })
})

describe('AiConfirmDialog edge — cluster mode 无编辑按钮', () => {
  it('cluster mode 不渲染 Edit 按钮(props.mode !== cluster 守卫)', async () => {
    const initial: CanvasElement[] = [
      { id: 'c1', kind: 'card', x: 0, y: 0, w: 100, h: 50, rotation: 0, color: 'white' } as CanvasElement,
      { id: 'c2', kind: 'card', x: 200, y: 0, w: 100, h: 50, rotation: 0, color: 'white' } as CanvasElement,
    ]
    const { host: mockHost } = makeMockHost(initial)
    const service = { get: () => ({ id: 'c1' }) } as never
    const { host: dom, unmount } = mount(
      <AiConfirmDialog mode="cluster" clusters={[{ ids: ['c1', 'c2'], kind: 'related', reason: 'x' }]} targetCanvasId={'cv' as never} service={service} liveHost={mockHost} onApplied={() => {}} onRejected={() => {}} />,
    )
    await act(async () => { await flushMicro() })
    expect(byText(dom, /^编辑 DSL$|^Edit DSL$/)).toBeNull()
    // 应用 + 拒绝仍在
    expect(byText(dom, /^应用$|^Apply$/)).not.toBeNull()
    expect(byText(dom, /^拒绝$|^Reject$/)).not.toBeNull()
    unmount()
  })
})

describe('AiConfirmDialog edge — outline apply 抛错 → error 态', () => {
  it('service.create throw → phase=error + pushToast error + onApplied 不触发', async () => {
    const service = {
      create: () => { throw new Error('boom') },
    } as never
    const onApplied = vi.fn()
    const { host: dom, unmount } = mount(
      <AiConfirmDialog mode="outline" outlineMarkdown={'## T'} canvasId={'cv' as never} service={service} onApplied={onApplied} onRejected={() => {}} />,
    )
    await act(async () => { await flushMicro() })
    pushToastSpy.mockClear()
    const applyBtn = byText(dom, /^应用$|^Apply$/)!
    await act(async () => { applyBtn.click() })
    await act(async () => { await flushMicro() })
    expect(onApplied).not.toHaveBeenCalled()
    // catch → pushToast error message agent.applyFailed
    const errToast = pushToastSpy.mock.calls.find((c) => (c[0] as { kind: string }).kind === 'error')
    expect(errToast).toBeTruthy()
    expect((errToast![0] as { message: string }).message).toBe('应用失败')
    // apply 按钮在 applied 态消失(phase !== applied → 仍显示;但 phase=error 不是 applied)
    // phase=error 时 actions 区仍渲染(phase !== 'applied')→ 按钮在,但这是 error 态可重试。
    unmount()
  })
})

describe('AiConfirmDialog edge — dsl 无变更 → 应用 disabled', () => {
  it('totalChanges===0 → 应用按钮 disabled', async () => {
    // liveHost 已有 r1 在 (100,200) size 300,400;DSL 更新同位同尺寸 → diff 空。
    const initial: CanvasElement[] = [
      { id: 'r1', kind: 'rect', x: 100, y: 200, w: 300, h: 400, rotation: 0, color: 'black' } as CanvasElement,
    ]
    const { host: mockHost } = makeMockHost(initial)
    const service = { createWithId: vi.fn() } as never
    const { host: dom, unmount } = mount(
      <AiConfirmDialog mode="dsl" dsl="[rect #r1] @pos(100,200) @size(300,400)" targetCanvasId={'cv' as never} service={service} liveHost={mockHost} onApplied={() => {}} onRejected={() => {}} />,
    )
    await act(async () => { await flushMicro() })
    const applyBtn = byText(dom, /^应用$|^Apply$/)!
    // totalChanges===0 + dsl mode → disabled
    expect(applyBtn.disabled).toBe(true)
    unmount()
  })
})
