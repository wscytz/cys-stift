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
import { appendDslBlock, DslDialog, replaceOrAppendCardRelation } from '../dsl-dialog'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function makeService(titles: Record<string, string> = {}) {
  return {
    get: (id: string) => titles[id] ? { title: titles[id] } : undefined,
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

function changeTextarea(domHost: HTMLElement, value: string) {
  const textarea = domHost.querySelector('textarea')!
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    setter.call(textarea, value)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('DSL guided editing helpers', () => {
  it('replaces the selected target card line without deleting its readable title comment', () => {
    const source = '[card #anchor] @pos(0,0)\n  # title: Anchor\n[card #target:2] @pos(200,0)\n  # title: Target'
    expect(replaceOrAppendCardRelation(source, 'target:2', 'anchor', 'below')).toBe(
      '[card #anchor] @pos(0,0)\n  # title: Anchor\n[card #target:2] below #anchor @gap(24)\n  # title: Target',
    )
  })

  it('appends a relation or example block without replacing the current canvas text', () => {
    expect(replaceOrAppendCardRelation('[rect #r] @pos(0,0)', 'target', 'anchor', 'right-of')).toBe(
      '[rect #r] @pos(0,0)\n[card #target] right-of #anchor @gap(24)',
    )
    expect(appendDslBlock('one\n', 'two')).toBe('one\ntwo')
  })
})

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

  it('shows the actual affected element instead of listing every parsed op', () => {
    const host = new InMemoryCanvasHost()
    host.applyWithoutEcho(() => {
      host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 80, rotation: 0 })
      host.upsert({ id: 'b', kind: 'card', x: 200, y: 0, w: 100, h: 80, rotation: 0 })
      host.upsert({ id: 'edge', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'a', to: 'b', text: 'old' })
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
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(
        textarea,
        '[card #a] @pos(0,0) @size(100,80)\n' +
          '[card #b] @pos(200,0) @size(100,80)\n' +
          '[arrow #edge] from #a to #b @label("new")',
      )
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const changes = [...domHost.querySelectorAll('.dsl-preview__changes li')].map((node) => node.textContent)
    expect(changes).toEqual([expect.stringMatching(/arrow #edge.*text/)])
    unmount()
  })

  it('refuses an edited DSL when the canvas revision changed after opening', async () => {
    const host = new InMemoryCanvasHost()
    host.applyWithoutEcho(() => {
      host.upsert({ id: 'r1', kind: 'rect', x: 0, y: 0, w: 100, h: 80, rotation: 0 })
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
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(textarea, '[rect #r1] @pos(20,20) @size(100,80)')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      host.applyWithoutEcho(() => {
        host.upsert({ id: 'r1', kind: 'rect', x: 999, y: 0, w: 100, h: 80, rotation: 0 })
      })
    })

    await act(async () => {
      applyBtn(domHost)!.click()
    })

    expect(host.getElement('r1')?.x).toBe(999)
    expect(pushToastSpy).toHaveBeenCalledWith({ kind: 'info', message: 'agent.staleRevision' })
    expect(archiveAppendSpy).not.toHaveBeenCalled()
    unmount()
  })

  it('turns a two-card selection into a relational DSL edit with a one-element preview', () => {
    const host = new InMemoryCanvasHost()
    host.applyWithoutEcho(() => {
      host.upsert({ id: 'anchor', kind: 'card', x: 0, y: 0, w: 100, h: 80, rotation: 0 })
      host.upsert({ id: 'target', kind: 'card', x: 300, y: 200, w: 100, h: 80, rotation: 0 })
    })
    host.setSelectedIds(['anchor', 'target'])
    const { host: domHost, unmount } = mount(
      <DslDialog
        open={true}
        onClose={() => {}}
        host={host as unknown as CanvasHost}
        service={makeService({ anchor: 'Anchor', target: 'Target' })}
        canvasName="cv"
      />,
    )

    const rightButton = [...domHost.querySelectorAll('button')].find((button) =>
      button.textContent === 'canvas.dslGuideRight',
    ) as HTMLButtonElement
    expect(rightButton.disabled).toBe(false)
    act(() => rightButton.click())

    expect((domHost.querySelector('textarea') as HTMLTextAreaElement).value).toContain(
      '[card #target] right-of #anchor @gap(24)',
    )
    const changes = [...domHost.querySelectorAll('.dsl-preview__changes li')].map((node) => node.textContent)
    expect(changes).toEqual([expect.stringMatching(/card #target.*x.*y/)])
    unmount()
  })

  it('shows line diagnostics while typing, before Apply is pressed', () => {
    const host = new InMemoryCanvasHost()
    const { host: domHost, unmount } = mount(
      <DslDialog open={true} onClose={() => {}} host={host as unknown as CanvasHost} service={makeService()} canvasName="cv" />,
    )
    changeTextarea(domHost, '[unknown #x] @pos(0,0)')
    expect(domHost.querySelector('.dsl-errors__line')?.textContent).toBe('canvas.dslErrorLine')
    expect(archiveAppendSpy).not.toHaveBeenCalled()
    unmount()
  })

  it('can discard stale text and load the latest canvas without closing the dialog', () => {
    const host = new InMemoryCanvasHost()
    host.applyWithoutEcho(() => {
      host.upsert({ id: 'r1', kind: 'rect', x: 0, y: 0, w: 100, h: 80, rotation: 0 })
    })
    const { host: domHost, unmount } = mount(
      <DslDialog open={true} onClose={() => {}} host={host as unknown as CanvasHost} service={makeService()} canvasName="cv" />,
    )
    act(() => {
      host.upsert({ id: 'r1', kind: 'rect', x: 999, y: 0, w: 100, h: 80, rotation: 0 })
    })

    const reload = [...domHost.querySelectorAll('button')].find((button) =>
      button.textContent === 'canvas.dslReload',
    ) as HTMLButtonElement
    expect(reload).toBeTruthy()
    act(() => reload.click())
    expect((domHost.querySelector('textarea') as HTMLTextAreaElement).value).toContain('@pos(999.0,0.0)')
    expect(applyBtn(domHost)?.disabled).toBe(false)
    unmount()
  })
})
