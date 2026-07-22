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
import type { CardService } from '@cys-stift/domain'

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

const addSampleSpy = vi.fn()
vi.mock('@/features/ai/sample-store', () => ({
  addSample: (...args: unknown[]) => addSampleSpy(...args),
  genSampleId: () => 'sample-test',
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
  makeOnCardUpdate,
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

  it('带 title/content 时写入(v5,不再落空标题卡)', () => {
    const { service, created } = makeMockService()
    makeOnCardCreate('c' as never, service).onCardCreate({
      cardId: 'c4', x: 0, y: 0, w: 1, h: 1, title: 'T', content: 'B',
    })
    expect(created[0]!.input).toMatchObject({ title: 'T', body: 'B' })
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
describe('makeOnCardUpdate — v5 内容写回(@title/@content,live 路径)', () => {
  it('带 title/content → service.update 写回(title→title, content→body)', () => {
    const updated: { id: string; patch: Record<string, unknown> }[] = []
    const cards = new Map<string, { id: string; title: string; body: string }>([
      ['c1', { id: 'c1', title: '旧', body: '旧正文' }],
    ])
    const service = {
      get: (id: string) => cards.get(id) ?? null,
      update: (id: string, patch: Record<string, unknown>) => {
        updated.push({ id, patch })
        const c = cards.get(id)
        if (c) cards.set(id, { ...c, ...patch } as { id: string; title: string; body: string })
        return cards.get(id) ?? null
      },
    } as unknown as CardService
    makeOnCardUpdate(service)({ cardId: 'c1', title: '新标题', content: '新正文' })
    expect(updated[0]).toMatchObject({ id: 'c1', patch: { title: '新标题', body: '新正文' } })
  })

  it('card 不存在 → 抛错(applyLayout 计 failed)', () => {
    const service = { get: () => null, update: () => null } as unknown as CardService
    expect(() => makeOnCardUpdate(service)({ cardId: 'nope', title: 'x' })).toThrow()
  })

  it('title/body 与当前一致 → 不调 update(无谓写入)', () => {
    const updated: unknown[] = []
    const service = {
      get: () => ({ id: 'c1', title: 'same', body: 'samebody' }),
      update: () => { updated.push(true); return { id: 'c1' } },
    } as unknown as CardService
    makeOnCardUpdate(service)({ cardId: 'c1', title: 'same', content: 'samebody' })
    expect(updated).toHaveLength(0)
  })

  it('service.update 返回 null → 抛错(applyLayout 计 failed)', () => {
    const service = {
      get: () => ({ id: 'c1', title: '旧', body: '' }),
      update: () => null,
    } as unknown as CardService
    expect(() => makeOnCardUpdate(service)({ cardId: 'c1', title: '新' })).toThrow()
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

  it('画布在确认门期间被手动修改时阻止 stale proposal 覆盖', async () => {
    const { host: mockHost, calls: hostCalls } = makeMockHost({ elements: emptyEls() })
    const { service } = makeMockService()
    const onRejected = vi.fn()
    const { host: domHost, unmount } = mount(
      <AgentConfirmCard
        dsl="[rect #r1] @pos(100,200) @size(300,400)"
        targetCanvasId={'canvas-live' as never}
        service={service}
        liveHost={mockHost}
        onApplied={() => {}}
        onRejected={onRejected}
      />,
    )
    await act(async () => { await flushMicro() })
    // 模拟用户在确认门外手动画了一个元素。
    mockHost.upsert({ id: 'manual', kind: 'rect', x: 1, y: 2, w: 3, h: 4, rotation: 0 } as CanvasElement)
    const applyBtn = byText(domHost, /^应用$|^Apply$/)
    expect(applyBtn).toBeTruthy()
    await act(async () => { applyBtn!.click() })
    expect(onRejected).toHaveBeenCalledTimes(1)
    // stale guard 在 applyLayout 前返回，旧 rect 不会写入 live host。
    expect(hostCalls.upserts.filter((e) => e.id === 'r1')).toHaveLength(0)
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

  it('temp 持久化明确失败(ok=false)时不误报成功/onApplied/archive', async () => {
    archiveAppendSpy.mockClear()
    pushToastSpy.mockClear()
    const { service } = makeMockService()
    const onApplied = vi.fn()
    buildCanvasHostForCanvasSpy.mockResolvedValue({
      host: { getElements: () => [] },
      before: [],
    })
    // 即使底层遗留/错误报告带了 applied>0，明确的事务失败仍必须优先。
    applyOpsAndPersistSpy.mockResolvedValue({
      ok: false,
      committed: false,
      applied: 1,
      failed: 1,
      cardsCreated: 0,
      cardsUpdated: 0,
      cardsFailed: 0,
      cardUpdatesFailed: 0,
      freeformChanged: 0,
    })

    const { host: domHost, unmount } = mount(
      <AgentConfirmCard
        dsl={'[rect #r1] @pos(10,10) @size(50,50)'}
        targetCanvasId={'canvas-ask' as never}
        service={service}
        onApplied={onApplied}
        onRejected={() => {}}
      />,
    )
    await act(async () => { await flushMicro() })
    await act(async () => { byText(domHost, /^应用$|^Apply$/)!.click() })
    await act(async () => { await flushMicro() })

    expect(onApplied).not.toHaveBeenCalled()
    expect(archiveAppendSpy).not.toHaveBeenCalled()
    expect(pushToastSpy.mock.calls.some(([toast]) => (toast as { kind?: string }).kind === 'success')).toBe(false)
    expect(pushToastSpy.mock.calls.some(([toast]) => (toast as { kind?: string }).kind === 'error')).toBe(true)
    unmount()
  })

  it('temp 成功 toast 提供一次性撤销 action', async () => {
    pushToastSpy.mockClear()
    const { service } = makeMockService()
    const undo = vi.fn().mockResolvedValue(true)
    buildCanvasHostForCanvasSpy.mockResolvedValue({
      host: { getElements: () => [] },
      before: [],
    })
    applyOpsAndPersistSpy.mockResolvedValue({
      ok: true,
      committed: true,
      applied: 1,
      failed: 0,
      cardsCreated: 0,
      cardsUpdated: 0,
      cardsFailed: 0,
      cardUpdatesFailed: 0,
      freeformChanged: 1,
      undo,
    })

    const { host: domHost, unmount } = mount(
      <AgentConfirmCard
        dsl={'[rect #r1] @pos(10,10) @size(50,50)'}
        targetCanvasId={'canvas-ask' as never}
        service={service}
        onApplied={() => {}}
        onRejected={() => {}}
      />,
    )
    await act(async () => { await flushMicro() })
    await act(async () => { byText(domHost, /^应用$|^Apply$/)!.click() })
    await act(async () => { await flushMicro() })

    const success = pushToastSpy.mock.calls
      .map(([toast]) => toast as { kind?: string; actions?: { label: string; onClick: () => void }[] })
      .find((toast) => toast.kind === 'success')
    expect(success?.actions?.[0]?.label).toMatch(/撤销/)
    success!.actions![0]!.onClick()
    success!.actions![0]!.onClick()
    await act(async () => { await flushMicro() })
    expect(undo).toHaveBeenCalledTimes(1)
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
    expect(archiveAppendSpy.mock.calls[0]![2]).toMatchObject({
      operation: {
        kind: 'ai-agent',
        before: { cards: [], mediaAssets: {} },
        after: { cards: [], mediaAssets: {} },
      },
    })

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

  it('final report 全失败 → 无成功 toast/sample/archive/onApplied', async () => {
    archiveAppendSpy.mockClear()
    pushToastSpy.mockClear()
    addSampleSpy.mockClear()
    const { service } = makeMockService()
    const onApplied = vi.fn()
    buildCanvasHostForCanvasSpy.mockResolvedValue({
      host: { getElements: () => [] },
      before: [],
    })
    applyOpsAndPersistSpy.mockResolvedValue({
      total: 1,
      applied: 0,
      skipped: 0,
      failed: 1,
      cardsCreated: 0,
      cardsUpdated: 0,
      cardsFailed: 1,
      freeformChanged: 0,
      opResults: [{ opIndex: 0, status: 'failed', reason: 'quota' }],
    })

    const { host: domHost, unmount } = mount(
      <AgentConfirmCard
        dsl={'[card #new create] @pos(10,10)'}
        targetCanvasId={'canvas-ask' as never}
        service={service}
        onApplied={onApplied}
        onRejected={() => {}}
        sampleContext={{ source: 'ask', context: 'ctx' }}
      />,
    )
    await act(async () => { await flushMicro() })
    await act(async () => { byText(domHost, /^应用$|^Apply$/)!.click() })
    await act(async () => { await flushMicro() })

    expect(onApplied).not.toHaveBeenCalled()
    expect(archiveAppendSpy).not.toHaveBeenCalled()
    expect(addSampleSpy).not.toHaveBeenCalled()
    expect(pushToastSpy.mock.calls.some(([toast]) => (toast as { kind?: string }).kind === 'success')).toBe(false)

    unmount()
  })
})

// ── Fix 4 batch-2:AgentConfirmCard 仍用 appliedTitle(Fix 4 只删 AiConfirmDialog 死相位) ──

describe('AgentConfirmCard — Fix 4 appliedTitle 仍用(不破 /ask + companion)', () => {
  /**
   * Fix 4 删了 AiConfirmDialog 的 appliedTitle 三元(死相位:onApplied 立即 unmount)。
   * 但 AgentConfirmCard 内联在 /ask + companion 对话流里,apply 后不 unmount →
   * phase='applied' 标题切换到 appliedTitle(「已应用 ✓」)是活的、用户可见的。
   * 此测验证:AgentConfirmCard apply 成功后,标题切换到 appliedTitle(不回归)。
   * 这是 appliedTitle i18n key 保留的理由 —— 删了会破 AgentConfirmCard。
   */
  it('live 模式 apply 成功 → phase=applied → 标题显示 appliedTitle(已应用 ✓)', async () => {
    const { host: mockHost } = makeMockHost({ elements: emptyEls() })
    const { service } = makeMockService()
    const onApplied = vi.fn()
    const dsl = '[rect #r1] @pos(10,20) @size(100,50)'
    const { host: dom, unmount } = mount(
      <AgentConfirmCard
        dsl={dsl}
        targetCanvasId={'cv' as never}
        service={service}
        liveHost={mockHost}
        onApplied={onApplied}
        onRejected={() => {}}
      />,
    )
    await act(async () => { await flushMicro() })

    // apply 前:标题是 proposeTitle(含 canvas 名)
    const titleBefore = dom.querySelector('.ac__title')
    expect(titleBefore?.textContent).toMatch(/cv/) // proposeTitle {canvas: 'cv'}

    const applyBtn = byText(dom, /^应用$|^Apply$/)!
    expect(applyBtn.disabled).toBe(false)
    await act(async () => { applyBtn.click() })
    await act(async () => { await flushMicro() })

    // apply 后:phase='applied' → 标题切换到 appliedTitle(「已应用 ✓」)
    expect(onApplied).toHaveBeenCalledTimes(1)
    const titleAfter = dom.querySelector('.ac__title')
    expect(titleAfter?.textContent).toMatch(/已应用/)

    // actions 区在 applied 相位隐藏(phase !== 'applied' 守卫)
    expect(byText(dom, /^应用$|^Apply$/)).toBeNull()

    unmount()
  })

  /**
   * 源码审计:AgentConfirmCard 仍引用 appliedTitle(与 AiConfirmDialog 对比)。
   * 防有人误删 appliedTitle i18n key(以为 AiConfirmDialog 不用 = 没人用)。
   */
  it('AgentConfirmCard 源码仍引用 appliedTitle(活的,非死代码)', async () => {
    const fs = await vi.importActual<typeof import('node:fs')>('node:fs')
    const path = await vi.importActual<typeof import('node:path')>('node:path')
    // 测试与源码同目录(src/features/ai/),无 __tests/ 子目录
    const file = path.resolve(__dirname, 'agent-confirm-card.tsx')
    const content = fs.readFileSync(file, 'utf8')
    expect(content).toMatch(/appliedTitle/)
  })
})
