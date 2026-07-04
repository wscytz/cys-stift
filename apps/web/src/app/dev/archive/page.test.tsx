/**
 * Task 6: /dev/archive page — list (倒序 + trigger 色标 + note) + 手动 checkpoint
 * + 导出 JSON + 浏览 payload 卡片数。
 *
 * Codebase policy: no @testing-library/react in devDeps; mount via
 * `react-dom/client` + `act` (React 19 built-in). Sample boiler:
 * `lib/__tests__/use-debounced-callback.test.tsx`.
 *
 * Mock `@/lib/archive-store` (archiveStore + 5 spies) + `@/lib/build-archive-payload`
 * + `@/lib/version`. The page reads listMeta() in render + subscribes via
 * useSyncExternalStore(subscribe, getVersion) for reactivity.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// Mark the env as an act environment so React doesn't warn about act() usage.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

// --- Mock data: two archive entries (listMeta returns 倒序 — newest first) ---
const FIXED_CREATED_AT = new Date('2026-07-04T12:00:00Z').getTime()
const MOCK_ENTRIES = [
  {
    archiveVersion: 2,
    createdAt: FIXED_CREATED_AT,
    trigger: 'manual',
    appVersion: '0.52.0',
    note: 'manual note v2',
  },
  {
    archiveVersion: 1,
    createdAt: FIXED_CREATED_AT - 60_000,
    trigger: 'release',
    appVersion: '0.51.0',
    note: 'release note v1',
  },
]

const mockListMeta = vi.fn(() => MOCK_ENTRIES)
const mockAppend = vi.fn().mockResolvedValue({ archiveVersion: 3 })
const mockLoadPayload = vi
  .fn()
  .mockResolvedValue({ cards: [{ id: 'c1' }, { id: 'c2' }], mediaAssets: {} })

vi.mock('@/lib/archive-store', () => ({
  archiveStore: {
    listMeta: () => mockListMeta(),
    append: mockAppend,
    subscribe: () => () => {},
    getVersion: () => 1,
    loadPayload: mockLoadPayload,
  },
}))

vi.mock('@/lib/build-archive-payload', () => ({
  buildArchivePayload: vi.fn().mockResolvedValue({ cards: [], mediaAssets: {} }),
}))

vi.mock('@/lib/version', () => ({ VERSION: '0.51.0' }))

// --- Helper: mount <Page /> into #r; returns the root so callers can unmount. ---
async function renderPage(): Promise<Root> {
  const { default: Page } = await import('./page')
  const host = document.getElementById('r')!
  const root = createRoot(host)
  await act(async () => {
    root.render(React.createElement(Page))
  })
  return root
}

describe('/dev/archive page', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="r"></div>'
    vi.clearAllMocks()
    // jsdom doesn't define URL.createObjectURL — install a stub before spying.
    // Re-stub each test so the spy is bound to the current test cycle.
    ;(URL as unknown as { createObjectURL: unknown }).createObjectURL ??=
      vi.fn()
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
  })

  it('渲染存档列表(版号倒序 + trigger 色标 + note)', async () => {
    await renderPage()

    // listMeta 调过一次(渲染读缓存)
    expect(mockListMeta).toHaveBeenCalledTimes(1)

    // 两条 li,顺序为 listMeta 返回顺序(已倒序,v2 在前)
    const items = document.querySelectorAll('ul > li')
    expect(items.length).toBe(2)

    // v2 在前(manual = var(--color-gray)),v1 在后(release = var(--color-yellow))
    const first = items[0]!
    expect(first.textContent).toContain('v2')
    expect(first.textContent).toContain('manual note v2')
    const firstDot = first.querySelector('[aria-hidden]') as HTMLElement
    expect(firstDot.style.background).toBe('var(--color-gray)')

    const second = items[1]!
    expect(second.textContent).toContain('v1')
    expect(second.textContent).toContain('release note v1')
    const secondDot = second.querySelector('[aria-hidden]') as HTMLElement
    expect(secondDot.style.background).toBe('var(--color-yellow)')

    // appVersion 也要露出来(spec D7)
    expect(first.textContent).toContain('0.52.0')
  })

  it('点「打存档点」→ append manual + note + payload + VERSION', async () => {
    await renderPage()

    // Type a note into the input first (verify note flows into append).
    // React 19 controlled inputs override the `value` setter — use the
    // native setter so React's value tracker registers the change.
    const input = document.querySelector('input') as HTMLInputElement
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!
    await act(async () => {
      nativeSetter.call(input, 'my checkpoint note')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const btn = document.querySelector(
      '[data-testid="checkpoint-btn"]',
    ) as HTMLButtonElement
    await act(async () => {
      btn.click()
    })

    expect(mockAppend).toHaveBeenCalledTimes(1)
    expect(mockAppend).toHaveBeenCalledWith(
      'manual',
      'my checkpoint note',
      expect.objectContaining({ cards: [], mediaAssets: {} }),
      '0.51.0',
    )
  })

  it('点「导出 JSON」→ loadPayload + 创建下载链接(filename 形如 cys-stift-archive-v{v}-{trigger}-{ts}.json)', async () => {
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        // capture: the appended <a>'s download attribute is set before click()
        captured.push(this)
      })
    const captured: HTMLAnchorElement[] = []

    await renderPage()

    // First <li> = v2, manual, FIXED_CREATED_AT.
    const firstLi = document.querySelector('ul > li')!
    const exportBtn = Array.from(firstLi.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('导出'),
    ) as HTMLButtonElement

    await act(async () => {
      exportBtn.click()
    })

    // loadPayload called for v2
    expect(mockLoadPayload).toHaveBeenCalledWith(2)
    // Blob URL generated
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    // The download link was clicked — capture filename format
    expect(captured.length).toBe(1)
    const download = captured[0]!.download
    // Expected: cys-stift-archive-v2-manual-2026-07-04-12-00-00.json
    expect(download).toBe('cys-stift-archive-v2-manual-2026-07-04-12-00-00.json')

    clickSpy.mockRestore()
  })

  it('点「浏览」→ loadPayload + 显示卡片数', async () => {
    await renderPage()

    const firstLi = document.querySelector('ul > li')!
    const browseBtn = Array.from(firstLi.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('浏览'),
    ) as HTMLButtonElement

    await act(async () => {
      browseBtn.click()
    })

    expect(mockLoadPayload).toHaveBeenCalledWith(2)
    // mockLoadPayload returns 2 cards → "卡片数: 2"
    expect(document.body.textContent).toContain('卡片数')
    expect(document.body.textContent).toContain('2')
  })
})
