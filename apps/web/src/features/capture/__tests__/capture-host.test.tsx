/**
 * CaptureHost keydown listener — B1 半守补测。
 *
 * 背景:B1 改键(⌘⇧E 默认,Storage 覆盖)的 settings 层有测,但
 * `capture-host.tsx` 里挂 window 的 keydown 监听(capture-host.tsx:135-164)
 * 一直无测 —— 改键后监听是否真按新 `sc.code` 匹配、编辑态是否真跳过、
 * 已 open 是否真防重,全凭肉眼。此测补上这条防线。
 *
 * 覆盖(capture-host.tsx:135-152 分支):
 *  1. 默认 ⌘⇧E(metaKey+shiftKey+code='KeyE')→ MiniInput open + preventDefault
 *  2. 编辑态(input/textarea/contentEditable)不触发
 *  3. 已 open 不重复触发(open=true 早返,不调 preventDefault)
 *  4. Windows Ctrl+Shift+E(ctrlKey)也触发(跨平台容错)
 *  5. 改 settings.captureShortcut.code(如 KeyC)→ 匹配新键;旧 KeyE 不再触发
 *
 * Codebase policy: react-dom/client + act(非 @testing-library/react),
 * 样板参考 capture-hint.test.tsx / agent-confirm-card.test.tsx。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { workbenchStore } from '@/lib/workbench-store'

// Mark the env as an act environment so React doesn't warn about act() usage.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// ── hoisted mutable state(vi.mock 工厂是 hoisted,顶层 const 会 TDZ)──
// settings 在测 5 里要改 captureShortcut.code,所以做成可变对象。
const { mockSettings } = vi.hoisted(() => {
  const mockSettings = {
    captureShortcut: { modKey: 'meta' as const, shift: true, code: 'KeyE' },
  }
  return { mockSettings }
})

const { mockPush, mockSubmit, mockPushToast } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockSubmit: vi.fn(),
  mockPushToast: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

// ── mock 依赖(只 mock capture-host.tsx 顶层 import 链必需的)──
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: 'zh' as const }),
}))

vi.mock('@/lib/settings-store', () => ({
  useSettings: () => ({ settings: mockSettings, ready: true }),
  settingsStore: { markCaptureHintSeen: vi.fn() },
}))

vi.mock('@/lib/db-client', () => ({
  useDb: () => ({ service: { create: vi.fn() } }),
}))

vi.mock('@/lib/canvas-store', () => ({
  useCanvases: () => ({ snapshot: { activeCanvasId: 'cv-1' } }),
}))

// MiniInput mock:把 open prop 落到 DOM(测断言它),阻断 draft-store/Input 链。
vi.mock('../mini-input', () => ({
  MiniInput: ({
    open,
    onSubmit,
  }: {
    open: boolean
    onSubmit: (input: { title: string; body?: string }) => Promise<boolean>
  }) => (
    <>
      <div data-testid="mini-input" data-open={open ? 'true' : 'false'} />
      <button
        type="button"
        data-testid="mini-input-submit"
        onClick={() => void onSubmit({ title: 'captured title' })}
      />
    </>
  ),
}))

// capture-sink:只 register/unregister/setFallbackService 被 CaptureHost 调,
// 不让真 WebCaptureSink 进来(避免触 better-sqlite3 / device-id 链)。
vi.mock('../capture-sink', () => ({
  captureSinkRegistry: {
    setFallbackService: vi.fn(),
    register: vi.fn(),
    unregister: vi.fn(),
    submit: mockSubmit,
  },
  WebCaptureSink: vi.fn(() => ({})),
}))

vi.mock('../menu-capture-sink', () => ({
  MenuCaptureSink: vi.fn(() => ({})),
}))

vi.mock('@/lib/toast-store', () => ({ pushToast: mockPushToast }))
vi.mock('@/lib/device-id', () => ({ getDeviceId: () => 'test-device' }))
vi.mock('../capture-redirect', () => ({
  buildCaptureRedirectActions: (args: { openCard: (id: string) => void }) => [
    { label: 'open', onClick: () => args.openCard('captured-card') },
  ],
}))

import { CaptureHost } from '../capture-host'

function mount(): { host: HTMLDivElement; unmount: () => void } {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(React.createElement(CaptureHost))
  })
  return {
    host,
    unmount() {
      act(() => {
        root.unmount()
      })
      host.remove()
    },
  }
}

/** dispatch window keydown(在 act 里,让 setOpen 的重渲染 flush);返回 event。 */
function fireKeydown(opts: {
  metaKey?: boolean
  ctrlKey?: boolean
  shiftKey?: boolean
  code?: string
  target?: HTMLElement | null
}): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    metaKey: opts.metaKey ?? false,
    ctrlKey: opts.ctrlKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    code: opts.code ?? 'KeyE',
  })
  // dispatch 到 target(默认 window)。生产里 window keydown listener 的
  // e.target 是触发事件的真实 DOM 节点(jsdom + 浏览器一致),所以测编辑态
  // 时把 input/textarea/contentEditable 作 target,ev.target 就是它。
  const dispatchOn = opts.target ?? window
  act(() => {
    dispatchOn.dispatchEvent(ev)
  })
  return ev
}

function isOpen(host: HTMLElement): boolean {
  const el = host.querySelector('[data-testid="mini-input"]')
  return el?.getAttribute('data-open') === 'true'
}

beforeEach(() => {
  // 每测重置默认快捷键(测 5 可能改成 KeyC)
  mockSettings.captureShortcut = { modKey: 'meta', shift: true, code: 'KeyE' }
  document.body.innerHTML = ''
  mockPush.mockClear()
  mockPushToast.mockClear()
  mockSubmit.mockReset()
  mockSubmit.mockResolvedValue({ cardId: 'captured-card' })
  workbenchStore.close()
  workbenchStore.setOrigin('/canvas')
})

describe('CaptureHost keydown — ⌘⇧E 触发 MiniInput open', () => {
  it('metaKey+shiftKey+code=KeyE → MiniInput open + preventDefault', () => {
    const { host, unmount } = mount()
    expect(isOpen(host)).toBe(false)
    const ev = fireKeydown({ metaKey: true, shiftKey: true, code: 'KeyE' })
    expect(ev.defaultPrevented).toBe(true)
    expect(isOpen(host)).toBe(true)
    unmount()
  })
})

describe('CaptureHost keydown — 编辑态不触发', () => {
  it('input focused → 不触发(input tag 守卫)', () => {
    const { host, unmount } = mount()
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    const ev = fireKeydown({
      metaKey: true,
      shiftKey: true,
      code: 'KeyE',
      target: input,
    })
    expect(ev.defaultPrevented).toBe(false)
    expect(isOpen(host)).toBe(false)
    input.remove()
    unmount()
  })

  it('textarea focused → 不触发(textarea tag 守卫)', () => {
    const { host, unmount } = mount()
    const ta = document.createElement('textarea')
    document.body.appendChild(ta)
    ta.focus()
    const ev = fireKeydown({
      metaKey: true,
      shiftKey: true,
      code: 'KeyE',
      target: ta,
    })
    expect(ev.defaultPrevented).toBe(false)
    expect(isOpen(host)).toBe(false)
    ta.remove()
    unmount()
  })

  it('contentEditable=true 元素 → 不触发(isContentEditable 守卫)', () => {
    const { host, unmount } = mount()
    const div = document.createElement('div')
    // jsdom 不实现 HTMLElement.isContentEditable(恒 undefined);我们 stub
    // 它,因为测的是 capture-host 的分支逻辑,不是 jsdom 的 DOM 正确性。
    Object.defineProperty(div, 'isContentEditable', {
      value: true,
      configurable: true,
    })
    document.body.appendChild(div)
    div.focus()
    const ev = fireKeydown({
      metaKey: true,
      shiftKey: true,
      code: 'KeyE',
      target: div,
    })
    expect(ev.defaultPrevented).toBe(false)
    expect(isOpen(host)).toBe(false)
    div.remove()
    unmount()
  })
})

describe('CaptureHost keydown — 已 open 不重复触发', () => {
  it('open=true 时再按 ⌘⇧E → 早返(open=true),不 preventDefault', () => {
    const { host, unmount } = mount()
    // 第一次:打开
    const ev1 = fireKeydown({ metaKey: true, shiftKey: true, code: 'KeyE' })
    expect(ev1.defaultPrevented).toBe(true)
    expect(isOpen(host)).toBe(true)
    // 第二次:已 open → handler 里 `if (open) return` 在 preventDefault 之前
    // → defaultPrevented=false(open 不变,仍是 true)
    const ev2 = fireKeydown({ metaKey: true, shiftKey: true, code: 'KeyE' })
    expect(ev2.defaultPrevented).toBe(false)
    expect(isOpen(host)).toBe(true) // 仍 open(不重复触发也不关闭)
    unmount()
  })
})

describe('CaptureHost keydown — Ctrl+Shift+E 跨平台', () => {
  it('ctrlKey(无 metaKey)+ shiftKey + KeyE → 触发(Windows/Linux 路径)', () => {
    const { host, unmount } = mount()
    const ev = fireKeydown({
      ctrlKey: true,
      shiftKey: true,
      code: 'KeyE',
    })
    expect(ev.defaultPrevented).toBe(true)
    expect(isOpen(host)).toBe(true)
    unmount()
  })
})

describe('CaptureHost keydown — 改 settings 后匹配新键', () => {
  it('captureShortcut.code 改 KeyC → ⌘⇧C 触发,⌘⇧E 不再触发', () => {
    // 改 settings 并 mount(新 settings 通过 mock 流入 CaptureHost)
    mockSettings.captureShortcut = { modKey: 'meta', shift: true, code: 'KeyC' }
    const { host, unmount } = mount()
    // 旧键 KeyE 不触发(defaultPrevented=false + 不 open)
    const evOld = fireKeydown({ metaKey: true, shiftKey: true, code: 'KeyE' })
    expect(evOld.defaultPrevented).toBe(false)
    expect(isOpen(host)).toBe(false)
    // 新键 KeyC 触发
    const evNew = fireKeydown({ metaKey: true, shiftKey: true, code: 'KeyC' })
    expect(evNew.defaultPrevented).toBe(true)
    expect(isOpen(host)).toBe(true)
    unmount()
  })
})

describe('CaptureHost keydown — shift 缺失/修饰键缺失守卫', () => {
  it('⌘E(无 shift)→ 不触发(sc.shift 守卫)', () => {
    const { host, unmount } = mount()
    const ev = fireKeydown({ metaKey: true, shiftKey: false, code: 'KeyE' })
    expect(ev.defaultPrevented).toBe(false)
    expect(isOpen(host)).toBe(false)
    unmount()
  })

  it('Shift+E(无 meta/ctrl)→ 不触发(mod 守卫)', () => {
    const { host, unmount } = mount()
    const ev = fireKeydown({
      metaKey: false,
      ctrlKey: false,
      shiftKey: true,
      code: 'KeyE',
    })
    expect(ev.defaultPrevented).toBe(false)
    expect(isOpen(host)).toBe(false)
    unmount()
  })
})

describe('CaptureHost capture success — global open action', () => {
  it('toast 的打开动作直接选择工作台卡片并导航,不依赖 Inbox listener', async () => {
    const { host, unmount } = mount()
    act(() => {
      window.dispatchEvent(new CustomEvent('cys-stift:open-capture'))
    })
    expect(isOpen(host)).toBe(true)

    await act(async () => {
      ;(host.querySelector('[data-testid="mini-input-submit"]') as HTMLButtonElement).click()
      await Promise.resolve()
    })

    const success = mockPushToast.mock.calls
      .map((call) => call[0] as { kind?: string; actions?: Array<{ onClick: () => void }> })
      .find((toast) => toast.kind === 'success')
    expect(success?.actions).toHaveLength(1)
    act(() => success?.actions?.[0]?.onClick())

    expect(workbenchStore.getCardId()).toBe('captured-card')
    expect(workbenchStore.getOrigin()).toBe('/')
    expect(mockPush).toHaveBeenCalledWith('/workbench')
    unmount()
  })
})
