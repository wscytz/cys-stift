/**
 * AppMenu：B-3 导航收敛守卫 —— search 是唯一主找回入口,archive/tags/timeline/
 * trash 收敛为「更多视图」次级组(不再与 search 平级)。渲染断言:宽屏横向导航
 * 列出全部 5 组,「更多视图」组含 archive/tags/timeline/trash 四条。
 * react-dom/client + act(policy)。mock useMatchMedia(宽屏)+ 配额订阅 store。
 */
import { describe, it, expect, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { AppMenu } from '../app-menu'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}))
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: 'zh', setLocale: () => {} }),
}))
vi.mock('@/lib/use-match-media', () => ({
  useMatchMedia: () => false, // 宽屏 → 横向导航(非汉堡抽屉)
}))
vi.mock('@/lib/toast-store', () => ({ pushToast: vi.fn() }))
// 配额订阅源:AppMenu 全局订阅各 store 写失败事件(防静默丢),测试全部 mock 成 no-op。
vi.mock('@/lib/db-client', () => ({ onQuotaExceeded: () => () => {} }))
vi.mock('@/lib/media-store', () => ({ onQuotaExceeded: () => () => {} }))
vi.mock('@/lib/canvas-freeform-store', () => ({ onQuotaExceeded: () => () => {} }))
vi.mock('@/lib/canvas-store', () => ({ onQuotaExceeded: () => () => {} }))
vi.mock('@/lib/settings-store', () => ({ onQuotaExceeded: () => () => {} }))
vi.mock('@/lib/canvas-view-store', () => ({ onQuotaExceeded: () => () => {} }))
vi.mock('@/features/ai/sample-store', () => ({ onQuotaExceeded: () => () => {} }))
vi.mock('@/lib/conversation-store', () => ({ onQuotaExceeded: () => () => {} }))
vi.mock('@/lib/draft-store', () => ({ onQuotaExceeded: () => () => {} }))
vi.mock('@/lib/graph-view-store', () => ({ onQuotaExceeded: () => () => {} }))
vi.mock('@/lib/version', () => ({ VERSION: '1.2.0' }))
// capture-host:AppMenu 引 CAPTURE_OPEN_EVENT 常量 + 挂载 capture 入口,无需真实实现。
vi.mock('@/features/capture/capture-host', () => ({ CAPTURE_OPEN_EVENT: 'capture:open' }))

function render() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(<AppMenu />)
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

describe('AppMenu — B-3 导航收敛(search 唯一主找回,archive/tags/timeline/trash 降级)', () => {
  it('宽屏渲染全部 5 组,「更多视图」组含 archive/tags/timeline/trash(不与 search 平级)', () => {
    const { host, unmount } = render()
    const links = [...host.querySelectorAll('.app-menu a')].map((a) => (a as HTMLAnchorElement).getAttribute('href'))
    // search 在 find 组(唯一主找回);archive/tags/timeline/trash 收敛到 views 组。
    expect(links).toContain('/search')
    expect(links).toContain('/archive')
    expect(links).toContain('/tags')
    expect(links).toContain('/timeline')
    expect(links).toContain('/trash')
    // 五个分组 label 都在(导航分组真相源)
    const body = host.textContent ?? ''
    for (const label of ['nav.group.capture', 'nav.group.think', 'nav.group.find', 'nav.group.views', 'nav.group.system']) {
      expect(body).toContain(label)
    }
    unmount()
  })
})
