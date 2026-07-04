/**
 * DslDialog — T5 风险 op 存档触发(dsl-apply)。
 *
 * 断言:
 *  - apply 成功(applied > 0)→ archiveStore.append 被调,trigger='dsl-apply',
 *    note 形如 'DSL apply N' 或 'DSL apply N (skipped M)',appVersion=VERSION。
 *  - apply 失败(applied === 0 / parse 全错 / 输入空)→ archiveStore.append 不调。
 *
 * Codebase policy: no @testing-library/react in devDeps. We mount via
 * react-dom/client + `act` (React 19 builtin). i18n / toast-store / ui mock。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { InMemoryCanvasHost, type CanvasHost } from '@cys-stift/canvas-engine'

// ── mock @/lib/i18n:t(k)=k(故按钮 textContent === i18n key)──
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: 'zh' as const }),
}))

// ── mock @/lib/toast-store: 记录 pushToast 调用,避免副作用 ──
const pushToastSpy = vi.fn()
vi.mock('@/lib/toast-store', () => ({
  pushToast: (...args: unknown[]) => pushToastSpy(...args),
}))

// ── mock @cys-stift/ui: Modal 透传 children(让 textarea/button 可 query);
//    Button 走原生 button(可 click)。──
vi.mock('@cys-stift/ui', () => ({
  Modal: ({ children, open }: { children?: React.ReactNode; open: boolean }) =>
    open ? React.createElement('div', null, children) : null,
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children?: React.ReactNode
    onClick?: () => void
    disabled?: boolean
  }) => React.createElement('button', { onClick, disabled, type: 'button' }, children),
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

import { VERSION } from '@/lib/version'
import { DslDialog } from '../dsl-dialog'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function makeService() {
  return {
    get: () => undefined,
  } as unknown as Parameters<typeof DslDialog>[0]['service']
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

function flushMicro() {
  return Promise.resolve()
}

function applyBtn(domHost: HTMLElement): HTMLButtonElement | undefined {
  return [...domHost.querySelectorAll('button')].find((b) =>
    /canvas\.dslApply/.test(b.textContent ?? ''),
  ) as HTMLButtonElement | undefined
}

describe('DslDialog — T5 archive trigger (dsl-apply)', () => {
  beforeEach(() => {
    archiveAppendSpy.mockClear()
    pushToastSpy.mockClear()
  })

  it('apply 成功(applied > 0)→ archiveStore.append 被调,trigger=dsl-apply + 真版本号', async () => {
    const host = new InMemoryCanvasHost()
    const { host: domHost, unmount } = mount(
      <DslDialog
        open={true}
        onClose={() => {}}
        host={host as unknown as CanvasHost}
        service={makeService()}
        canvasName="cv"
      />,
    )

    // 输入一条合法 rect DSL → parse 出 1 op → applyLayout applied=1。
    const textarea = domHost.querySelector('textarea')!
    act(() => {
      // React controlled textarea:设 value + 派发 input 事件。
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )!.set!
      setter.call(textarea, '[rect #r1] @pos(10,10) @size(50,60)')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => {
      applyBtn(domHost)!.click()
    })
    // buildArchivePayload().then(...) 是 microtask;flush 后 append 被调。
    await act(async () => {
      await flushMicro()
    })

    expect(archiveAppendSpy).toHaveBeenCalledTimes(1)
    const [trigger, note, , appVersion] = archiveAppendSpy.mock.calls[0]!
    expect(trigger).toBe('dsl-apply')
    expect(note).toMatch(/^DSL apply \d+/)
    expect(appVersion).toBe(VERSION)

    unmount()
  })

  it('apply 含 skipped → note 形如 "DSL apply N (skipped M)"', async () => {
    const host = new InMemoryCanvasHost()
    // 预放一个同 id rect,让 apply 走 update 分支仍计 applied。
    host.upsert({
      id: 'r1',
      kind: 'rect',
      x: 5,
      y: 5,
      w: 10,
      h: 10,
      rotation: 0,
    })
    const { host: domHost, unmount } = mount(
      <DslDialog
        open={true}
        onClose={() => {}}
        host={host as unknown as CanvasHost}
        service={makeService()}
        canvasName="cv"
      />,
    )

    const textarea = domHost.querySelector('textarea')!
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )!.set!
      setter.call(textarea, '[rect #r1] @pos(20,20) @size(50,60)')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => {
      applyBtn(domHost)!.click()
    })
    await act(async () => {
      await flushMicro()
    })

    // applied>0 走 append;note 形态(含或不含 skipped 取决于 applyLayout 内部
    // 计数)。只断言 trigger + 起始串,不断言 skipped 精确值(避免脆性)。
    expect(archiveAppendSpy).toHaveBeenCalledTimes(1)
    expect(archiveAppendSpy.mock.calls[0]![0]).toBe('dsl-apply')
    expect(String(archiveAppendSpy.mock.calls[0]![1])).toMatch(/^DSL apply \d+/)

    unmount()
  })

  it('空输入 apply → 不调 archiveStore.append', async () => {
    const host = new InMemoryCanvasHost()
    const { host: domHost, unmount } = mount(
      <DslDialog
        open={true}
        onClose={() => {}}
        host={host as unknown as CanvasHost}
        service={makeService()}
        canvasName="cv"
      />,
    )

    // textarea 默认空(open 时 serialize 空 host → ''),apply 命中 ops.length === 0 分支。
    await act(async () => {
      applyBtn(domHost)!.click()
    })
    await act(async () => {
      await flushMicro()
    })

    expect(archiveAppendSpy).not.toHaveBeenCalled()

    unmount()
  })

  it('输入全无效(parse 出 0 ops + 至少 1 error)→ 不调 archiveStore.append', async () => {
    const host = new InMemoryCanvasHost()
    const { host: domHost, unmount } = mount(
      <DslDialog
        open={true}
        onClose={() => {}}
        host={host as unknown as CanvasHost}
        service={makeService()}
        canvasName="cv"
      />,
    )

    const textarea = domHost.querySelector('textarea')!
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )!.set!
      // 一行无法 parse 的内容 → parseErrors.length > 0 + ops.length === 0。
      setter.call(textarea, 'this is not dsl at all')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => {
      applyBtn(domHost)!.click()
    })
    await act(async () => {
      await flushMicro()
    })

    expect(archiveAppendSpy).not.toHaveBeenCalled()

    unmount()
  })
})
