/**
 * AgentConfirmCard — Plan B T1: liveHost 应用路径 + /ask temp 路径不回归。
 *
 * 三组断言:
 *  1. makeOnCardCreate 纯单测:返回的 fn → service.createWithId 被调,
 *     参数 mirror canvas-host-builder.ts:88-99(canvasPosition 含 z/rotation,
 *     source.deviceId='companion-agent')。
 *  2. live 模式:`liveHost={mockHost}` + 一个 rect DSL → 点 Apply →
 *     mockHost.batch 被调(live host 被改)且 mockHost.upsert 收到 rect;
 *     service.createWithId 未被调(rect op 不建卡)。
 *  3. /ask 模式(无 liveHost):smoke —— 组件挂载,Apply 按钮存在,
 *     点击不抛(liveHost 缺省时走 temp 路径分支;applyLayout 本身已被
 *     apply-layout 的测试覆盖,这里只验证分支结构 + 组件不炸)。
 *
 * Codebase policy: no @testing-library/react in devDeps. We mount via
 * react-dom/client + `act` (React 19 builtin). i18n / toast-store are mocked.
 */
import { describe, it, expect, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { CanvasHost, CanvasElement } from '@cys-stift/canvas-engine'

// ── mock @/lib/i18n: 真翻译绑定 messages 表(避免全套 I18nProvider)──
const _locale: 'zh' | 'en' = 'zh'
import { messages } from '@/lib/i18n/messages'
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    locale: _locale,
    t: (
      key: keyof typeof messages,
      params?: Record<string, string | number | null | undefined>,
    ) => {
      const entry = messages[key]
      const msg = entry?.[_locale]
      if (!msg) return String(key)
      if (!params) return msg
      let out: string = msg
      for (const [k, v] of Object.entries(params)) {
        out = out.replace(`{${k}}`, String(v ?? ''))
      }
      return out
    },
    setLocale: () => {},
  }),
}))

// ── mock @/lib/toast-store: 记录 pushToast 调用,避免副作用 ──
const pushToastSpy = vi.fn()
vi.mock('@/lib/toast-store', () => ({
  pushToast: (...args: unknown[]) => pushToastSpy(...args),
}))

// ── mock canvas-host-builder: 拦截 buildCanvasHostForCanvas / applyOpsAndPersist,
//    让 /ask 分支可观测(且不依赖真 CardService/store)。──
const buildCanvasHostForCanvasSpy = vi.fn()
const applyOpsAndPersistSpy = vi.fn()
vi.mock('@/features/canvas/canvas-host-builder', () => ({
  buildCanvasHostForCanvas: (...args: unknown[]) =>
    buildCanvasHostForCanvasSpy(...args),
  applyOpsAndPersist: (...args: unknown[]) =>
    applyOpsAndPersistSpy(...args),
}))

// ── T5 mock archive-store + build-archive-payload: spy append,断言风险 op 触发 ──
const archiveAppendSpy = vi.fn().mockResolvedValue({ archiveVersion: 1 })
vi.mock('@/lib/archive-store', () => ({
  archiveStore: {
    append: (...args: unknown[]) => archiveAppendSpy(...args),
    subscribe: () => () => {},
    getVersion: () => 0,
    listMeta: () => [],
    loadPayload: () => Promise.resolve(null),
    ensureReleaseRecord: () => Promise.resolve(),
  },
}))
vi.mock('@/lib/build-archive-payload', () => ({
  buildArchivePayload: vi.fn().mockResolvedValue({ cards: [], mediaAssets: {} }),
}))

// 真版本号(VERSION from @/lib/version,import 后断言 append 第 4 参数用)。
import { VERSION } from '@/lib/version'

import {
  AgentConfirmCard,
  makeOnCardCreate,
} from '@/features/ai/agent-confirm-card'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

// ── 最小 mock CanvasHost(实现契约里 live 路径用到的 4 个方法)──
function makeMockHost(initial: { elements: CanvasElement[] }) {
  const calls = {
    batch: 0,
    upserts: [] as CanvasElement[],
  }
  let els: CanvasElement[] = [...initial.elements]
  const host: CanvasHost = {
    getElements: () => els,
    getElement: (id: string) => els.find((e) => e.id === id),
    upsert: (el: CanvasElement) => {
      calls.upserts.push(el)
      els.push(el)
    },
    remove: () => {},
    batch: (fn: () => void) => {
      calls.batch++
      fn()
    },
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

function emptyEls(): CanvasElement[] {
  return []
}

// ── 最小 mock CardService(只记录 createWithId)──
function makeMockService() {
  const created: { id: string; input: unknown }[] = []
  return {
    service: {
      createWithId: (id: string, input: unknown) => {
        created.push({ id, input })
      },
    } as unknown as Parameters<typeof makeOnCardCreate>[1],
    created,
  }
}

// ── query helpers (text / data-attr based, 非 class)──
const byText = (host: HTMLElement, re: RegExp): HTMLButtonElement | null => {
  const all = host.querySelectorAll('button')
  for (const el of all) {
    if (re.test(el.textContent ?? '')) return el as HTMLButtonElement
  }
  return null
}

interface Mount {
  host: HTMLDivElement
  root: Root
  unmount: () => void
}
function mount(el: React.ReactElement): Mount {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(el)
  })
  return { host, root, unmount: () => act(() => root.unmount()) }
}

// 让异步 preview useEffect 完成后断言。jsdom 下无 flushMicrotasks,用一个
// 已 resolved 的 promise 的 then 回调充当「下一个微任务轮」。
function flushMicro() {
  return Promise.resolve()
}

// ───────────────────────────────────────────────────────────────────
describe('makeOnCardCreate', () => {
  it('调 service.createWithId,mirror canvas-host-builder 模板', () => {
    const { service, created } = makeMockService()
    const { onCardCreate: fn } = makeOnCardCreate('canvas-1' as never, service)
    fn({ cardId: 'c1', x: 10, y: 20, w: 240, h: 120 })
    expect(created).toHaveLength(1)
    const call = created[0]!
    expect(call.id).toBe('c1')
    expect(call.input).toMatchObject({
      title: '',
      body: '',
      type: 'note',
      canvasPosition: {
        canvasId: 'canvas-1',
        x: 10,
        y: 20,
        w: 240,
        h: 120,
        rotation: 0,
      },
      source: { kind: 'manual', deviceId: 'companion-agent' },
    })
    // canvasPosition 必须带 z(时间戳)。
    expect(
      (call.input as { canvasPosition: { z: number } }).canvasPosition.z,
    ).toBeTypeOf('number')
  })

  it('color 参数透传成 ColorToken(条件 spread,与模板一致)', () => {
    const { service, created } = makeMockService()
    makeOnCardCreate('c' as never, service).onCardCreate({
      cardId: 'c2', x: 0, y: 0, w: 1, h: 1, color: 'red',
    })
    expect(created[0]!.input).toMatchObject({ color: 'red' })
  })

  it('无 color 时不带 color 字段(模板:条件 spread)', () => {
    const { service, created } = makeMockService()
    makeOnCardCreate('c' as never, service).onCardCreate({ cardId: 'c3', x: 0, y: 0, w: 1, h: 1 })
    expect((created[0]!.input as { color?: string }).color).toBeUndefined()
  })

  it('createWithId 抛错时计入 failed(不向上传播,case 2a 不再静默)', () => {
    const boom = {
      createWithId: () => {
        throw new Error('dup id')
      },
    } as unknown as Parameters<typeof makeOnCardCreate>[1]
    const { onCardCreate: fn, getFailed } = makeOnCardCreate('c' as never, boom)
    expect(() => fn({ cardId: 'x', x: 0, y: 0, w: 1, h: 1 })).not.toThrow()
    expect(getFailed()).toBe(1)
  })
})

// ───────────────────────────────────────────────────────────────────
describe('AgentConfirmCard — live 模式(liveHost 提供)', () => {
  it('点 Apply → mockHost.batch 被调 + upsert 收到 rect;不调 applyOpsAndPersist', async () => {
    const { host: mockHost, calls: hostCalls } = makeMockHost({
      elements: emptyEls(),
    })
    const { service, created } = makeMockService()
    applyOpsAndPersistSpy.mockResolvedValue({
      applied: 0, skipped: 0, cardsCreated: 0, cardsUpdated: 0, freeformChanged: 0,
    })

    // rect DSL → parse 成 free op → applyLayout 调 host.batch + host.upsert。
    const dsl = '[rect #r1] @pos(100,200) @size(300,400)'
    const onApplied = vi.fn()
    const { host: domHost, unmount } = mount(
      <AgentConfirmCard
        dsl={dsl}
        targetCanvasId={'canvas-live' as never}
        service={service}
        liveHost={mockHost}
        onApplied={onApplied}
        onRejected={() => {}}
      />,
    )

    // 等 preview 异步 useEffect(live 模式 getElements 同步,但仍走 microtask)。
    await act(async () => {
      await flushMicro()
    })

    const applyBtn = byText(domHost, /^应用$|^Apply$/)
    expect(applyBtn).toBeTruthy()
    expect(applyBtn!.disabled).toBe(false)

    await act(async () => {
      applyBtn!.click()
    })

    // live 路径:走了 applyLayout(mockHost.batch 被调,upsert 收到 rect)。
    expect(hostCalls.batch).toBeGreaterThanOrEqual(1)
    const upsertedRect = hostCalls.upserts.find(
      (e) => (e as { kind?: string }).kind === 'rect',
    )
    expect(upsertedRect).toBeTruthy()
    // live 路径:绝不调 applyOpsAndPersist(免双写)。
    expect(applyOpsAndPersistSpy).not.toHaveBeenCalled()
    // rect op 不建卡 → createWithId 没被调。
    expect(created).toHaveLength(0)
    expect(onApplied).toHaveBeenCalledTimes(1)

    unmount()
  })
})

// ───────────────────────────────────────────────────────────────────
describe('AgentConfirmCard — /ask temp 模式(无 liveHost,不回归)', () => {
  it('挂载冒烟 + Apply 走 temp 分支(buildCanvasHostForCanvas/applyOpsAndPersist),不作用于外部 host', async () => {
    const { service } = makeMockService()
    buildCanvasHostForCanvasSpy.mockResolvedValue({
      host: { getElements: () => [] },
      before: [],
    })
    applyOpsAndPersistSpy.mockResolvedValue({
      applied: 1, skipped: 0, cardsCreated: 0, cardsUpdated: 0, freeformChanged: 1,
    })

    const dsl = '[rect #r1] @pos(10,10) @size(50,50)'
    const onApplied = vi.fn()
    const { host: domHost, unmount } = mount(
      <AgentConfirmCard
        dsl={dsl}
        targetCanvasId={'canvas-ask' as never}
        service={service}
        onApplied={onApplied}
        onRejected={() => {}}
      />,
    )

    await act(async () => {
      await flushMicro()
    })

    const applyBtn = byText(domHost, /^应用$|^Apply$/)
    expect(applyBtn).toBeTruthy()

    await act(async () => {
      applyBtn!.click()
    })

    // /ask temp 路径:调 buildCanvasHostForCanvas + applyOpsAndPersist。
    expect(buildCanvasHostForCanvasSpy).toHaveBeenCalled()
    expect(applyOpsAndPersistSpy).toHaveBeenCalled()
    expect(onApplied).toHaveBeenCalledTimes(1)
    expect(onApplied.mock.calls[0]![0]).toMatchObject({
      applied: 1, cardsUpdated: 0, cardsCreated: 0,
    })

    unmount()
  })
})

// ───────────────────────────────────────────────────────────────────
// T5:风险 op 存档触发(ai-agent)。断言:
//   - live 模式 apply 成功(applyLayout applied>0)→ archiveStore.append 被调,
//     trigger='ai-agent', note 形如 'agent: N 行', appVersion=VERSION。
//   - 失败路径(applyOpsAndPersist 抛错)→ archiveStore.append 不调。
// 注:live 模式 applied=0 在 agent-confirm-card 极难触发(preview 0 ops 时按钮
// disabled)。「applied=0 不打档」语义在 dsl-dialog 测试覆盖。
describe('AgentConfirmCard — T5 archive trigger (ai-agent)', () => {
  it('live 模式 apply 成功 → append 被调,trigger=ai-agent + 真版本号', async () => {
    archiveAppendSpy.mockClear()
    const { host: mockHost } = makeMockHost({ elements: emptyEls() })
    const { service } = makeMockService()
    applyOpsAndPersistSpy.mockResolvedValue({
      applied: 0, skipped: 0, cardsCreated: 0, cardsUpdated: 0, freeformChanged: 0,
    })

    // rect DSL → applyLayout applied=1(live host upsert 成功计 1)。
    const dsl = '[rect #r1] @pos(100,200) @size(300,400)'
    const { host: domHost, unmount } = mount(
      <AgentConfirmCard
        dsl={dsl}
        targetCanvasId={'canvas-live' as never}
        service={service}
        liveHost={mockHost}
        onApplied={() => {}}
        onRejected={() => {}}
      />,
    )
    await act(async () => { await flushMicro() })

    const applyBtn = byText(domHost, /^应用$|^Apply$/)!
    expect(applyBtn.disabled).toBe(false)
    await act(async () => { applyBtn.click() })
    // buildArchivePayload().then(...) 是 microtask;flush 后 append 被调。
    await act(async () => { await flushMicro() })

    expect(archiveAppendSpy).toHaveBeenCalledTimes(1)
    const [trigger, note, , appVersion] = archiveAppendSpy.mock.calls[0]!
    expect(trigger).toBe('ai-agent')
    expect(note).toMatch(/^agent: \d+ 行$/)
    expect(appVersion).toBe(VERSION)

    unmount()
  })

  it('temp 模式(/ask)apply 成功(applied>0)→ append 也被调', async () => {
    archiveAppendSpy.mockClear()
    const { service } = makeMockService()
    buildCanvasHostForCanvasSpy.mockResolvedValue({
      host: { getElements: () => [] },
      before: [],
    })
    applyOpsAndPersistSpy.mockResolvedValue({
      applied: 2, skipped: 0, cardsCreated: 0, cardsUpdated: 1, freeformChanged: 1,
    })

    const dsl = '[rect #a] @pos(0,0) @size(10,10)\n[rect #b] @pos(20,20) @size(10,10)'
    const { host: domHost, unmount } = mount(
      <AgentConfirmCard
        dsl={dsl}
        targetCanvasId={'canvas-ask' as never}
        service={service}
        onApplied={() => {}}
        onRejected={() => {}}
      />,
    )
    await act(async () => { await flushMicro() })
    const applyBtn = byText(domHost, /^应用$|^Apply$/)!
    await act(async () => { applyBtn.click() })
    await act(async () => { await flushMicro() })

    expect(archiveAppendSpy).toHaveBeenCalledTimes(1)
    expect(archiveAppendSpy.mock.calls[0]![0]).toBe('ai-agent')
    // 2 行 DSL → note 'agent: 2 行'
    expect(archiveAppendSpy.mock.calls[0]![1]).toBe('agent: 2 行')

    unmount()
  })

  it('temp 模式 apply 失败(applyOpsAndPersist reject)→ append 不调', async () => {
    archiveAppendSpy.mockClear()
    const { service } = makeMockService()
    buildCanvasHostForCanvasSpy.mockResolvedValue({
      host: { getElements: () => [] },
      before: [],
    })
    applyOpsAndPersistSpy.mockRejectedValue(new Error('persist boom'))

    const dsl = '[rect #r1] @pos(10,10) @size(50,50)'
    const { host: domHost, unmount } = mount(
      <AgentConfirmCard
        dsl={dsl}
        targetCanvasId={'canvas-ask' as never}
        service={service}
        onApplied={() => {}}
        onRejected={() => {}}
      />,
    )
    await act(async () => { await flushMicro() })
    const applyBtn = byText(domHost, /^应用$|^Apply$/)!
    await act(async () => { applyBtn.click() })
    await act(async () => { await flushMicro() })

    // 失败路径:phase 转 'error',archive 不调。
    expect(archiveAppendSpy).not.toHaveBeenCalled()

    unmount()
  })
})
