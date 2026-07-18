'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CAPTURE_OPEN_EVENT } from '@/features/capture/capture-host'
import { useI18n } from '@/lib/i18n'
import type { MessageKey } from '@/lib/i18n/messages'
import { onQuotaExceeded } from '@/lib/db-client'
import { onQuotaExceeded as onMediaQuota } from '@/lib/media-store'
import { onQuotaExceeded as onFreeformQuota } from '@/lib/canvas-freeform-store'
import { onQuotaExceeded as onCanvasListQuota } from '@/lib/canvas-store'
import { onQuotaExceeded as onSettingsQuota } from '@/lib/settings-store'
import { onQuotaExceeded as onCanvasViewQuota } from '@/lib/canvas-view-store'
import { onQuotaExceeded as onSampleQuota } from '@/features/ai/sample-store'
import { onQuotaExceeded as onConversationQuota } from '@/lib/conversation-store'
import { onQuotaExceeded as onDraftQuota } from '@/lib/draft-store'
import { onQuotaExceeded as onGraphViewQuota } from '@/lib/graph-view-store'
import { pushToast } from '@/lib/toast-store'
import { VERSION } from '@/lib/version'
import { useMatchMedia } from '@/lib/use-match-media'

/**
 * AppMenu — global top menu bar.
 *
 * 响应式(v0.48):≥1024 横向导航(现状);<1024 平板态收成 ☰ 汉堡抽屉
 * (entries 变竖向覆盖列表 + backdrop 点关闭),version/sep 藏。useMatchMedia
 * 读断点,open state 控抽屉;路由切换 / 回桌面自动关。
 */
export function AppMenu() {
  const pathname = usePathname() ?? '/'
  const { t } = useI18n()
  const isNarrow = useMatchMedia('(max-width: 1023px)')
  const [open, setOpen] = useState(false)

  // 审计 H1 + R2.3/2.4 + quota-silence fix:所有非 React store(db-client /
  // media-store / canvas-freeform-store / canvas-store / settings-store /
  // canvas-view-store)都是非 React 模块,无法直接 pushToast。AppMenu 全局挂载
  // 且是 'use client',这里订阅各 store 的配额写入失败事件并提示用户(防静默丢
  // 卡片/媒体/画布几何/画布列表/设置/画布视图)。
  useEffect(() => {
    const message = t('storage.quotaExceeded')
    const toast = () => pushToast({ kind: 'error', message })
    const unsubs = [
      onQuotaExceeded(toast),
      onMediaQuota(toast),
      onFreeformQuota(toast),
      onCanvasListQuota(toast),
      onSettingsQuota(toast),
      onCanvasViewQuota(toast),
      onSampleQuota(toast),
      onConversationQuota(toast),
      onDraftQuota(toast),
      onGraphViewQuota(toast),
    ]
    return () => {
      unsubs.forEach((u) => u())
    }
  }, [t])

  // 路由切换关抽屉(点导航后)+ 回桌面关(防残留)。
  useEffect(() => {
    setOpen(false)
  }, [pathname])
  useEffect(() => {
    if (isNarrow === false) setOpen(false)
  }, [isNarrow])

  const onCaptureClick = () => {
    window.dispatchEvent(new CustomEvent(CAPTURE_OPEN_EVENT))
  }

  const groups: Array<{
    label: MessageKey
    entries: { href: string; key: MessageKey }[]
  }> = [
    { label: 'nav.group.capture', entries: [
      { href: '/inbox', key: 'nav.inbox' },
      { href: '/canvas', key: 'nav.canvas' },
      { href: '/workbench', key: 'nav.workbench' },
    ] },
    { label: 'nav.group.think', entries: [
      { href: '/ask', key: 'nav.ask' },
      { href: '/graph', key: 'nav.graph' },
    ] },
    { label: 'nav.group.find', entries: [
      { href: '/archive', key: 'nav.archive' },
      { href: '/tags', key: 'nav.tags' },
      { href: '/timeline', key: 'nav.timeline' },
      { href: '/search', key: 'nav.search' },
      { href: '/trash', key: 'nav.trash' },
    ] },
    { label: 'nav.group.system', entries: [
      { href: '/settings', key: 'nav.settings' },
    ] },
  ]
  const entries = groups.flatMap((group) => group.entries)

  const activeKey = entries.find((e) => pathname.startsWith(e.href))?.key

  return (
    <nav className="app-menu" aria-label="Primary">
      <span className="app-menu__bar" aria-hidden="true" />
      <Link href="/" className="app-menu__brand">
        {t('brand.name')}
      </Link>
      {!isNarrow && (
        <>
          <span className="app-menu__version" aria-label="app version">v{VERSION}</span>
          <span className="app-menu__sep" aria-hidden="true">/</span>
        </>
      )}
      <div
        className={`app-menu__entries${isNarrow && open ? ' app-menu__entries--open' : ''}`}
      >
        {groups.map((group) => (
          <div key={group.label} className="app-menu__group" role="group" aria-label={t(group.label)}>
            <span className="app-menu__group-label">{t(group.label)}</span>
            {group.entries.map((e) => (
              <Link
                key={e.key}
                href={e.href}
                className={`app-menu__link ${activeKey === e.key ? 'app-menu__link--active' : ''}`}
                onClick={() => setOpen(false)}
              >
                {t(e.key)}
              </Link>
            ))}
          </div>
        ))}
      </div>
      <span className="app-menu__spacer" />
      <button type="button" className="app-menu__capture" onClick={onCaptureClick}>
        {t('nav.capture')}
      </button>
      {isNarrow && (
        <button
          type="button"
          className="app-menu__burger"
          aria-expanded={open}
          aria-label={open ? t('common.close') : t('common.menu')}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? '✕' : '☰'}
        </button>
      )}
      {isNarrow && open && (
        <button
          type="button"
          className="app-menu__backdrop"
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => setOpen(false)}
        />
      )}
      <style>{styles}</style>
    </nav>
  )
}

const styles = `
.app-menu {
  position: sticky;
  top: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  background: var(--color-white);
  border-bottom: var(--border-hairline);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
}
.app-menu__bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: var(--color-red);
}
.app-menu__brand {
  font-family: var(--font-display);
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--color-black);
  text-decoration: none;
  letter-spacing: -0.005em;
}
.app-menu__sep { color: var(--color-gray); }
.app-menu__version {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--color-gray);
  letter-spacing: 0.04em;
  user-select: none;
}
.app-menu__entries { display: flex; gap: var(--space-1); }
.app-menu__group { display: flex; align-items: center; gap: var(--space-1); border-left: 1px solid var(--color-gray-soft); padding-left: var(--space-1); }
.app-menu__group:first-child { border-left: 0; padding-left: 0; }
.app-menu__group-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.app-menu__link {
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--color-gray);
  text-decoration: none;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
}
.app-menu__link:hover { color: var(--color-black); background: var(--color-gray-soft); }
.app-menu__link:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
.app-menu__link--active { color: var(--color-black); border-bottom: 2px solid var(--color-black); }
.app-menu__spacer { flex: 1; }
.app-menu__capture {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  background: var(--color-red);
  color: var(--color-white);
  border: var(--border-hairline);
  border-color: var(--color-black);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-sm);
  cursor: pointer;
  min-width: 44px;
  min-height: 44px;
}
.app-menu__capture:hover { box-shadow: 2px 2px 0 0 var(--color-black); }
.app-menu__capture:active { transform: translate(2px, 2px); box-shadow: none; }
.app-menu__capture:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }

/* 汉堡按钮(<1024 显;桌面不 render) */
.app-menu__burger {
  font-family: var(--font-mono);
  font-size: var(--font-size-base);
  background: transparent;
  color: var(--color-black);
  border: none;
  cursor: pointer;
  padding: 0 var(--space-1);
  line-height: 1;
  min-width: 44px;
  min-height: 44px;
}
.app-menu__burger:hover { color: var(--color-red); }
.app-menu__burger:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }

/* 抽屉 backdrop(open 时 render;<1024) */
.app-menu__backdrop {
  position: fixed;
  inset: 0;
  background: var(--color-scrim);
  border: none;
  padding: 0;
  cursor: default;
  z-index: 39;
}

/* <1024:entries 变竖向覆盖抽屉(--open 控显隐) */
@media (max-width: 1023px) {
  .app-menu__entries {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    flex-direction: column;
    align-items: stretch;
    background: var(--color-white);
    border-bottom: var(--border-hairline);
    box-shadow: 4px 4px 0 0 var(--color-black);
    padding: var(--space-2) var(--space-4);
    gap: var(--space-1);
    transform: translateY(-8px);
    opacity: 0;
    pointer-events: none;
    transition: transform 120ms ease-out, opacity 120ms ease-out;
    z-index: 40;
  }
  .app-menu__entries--open {
    transform: translateY(0);
    opacity: 1;
    pointer-events: auto;
  }
  .app-menu__group { flex-direction: column; align-items: stretch; border-left: 0; border-top: 1px solid var(--color-gray-soft); padding: var(--space-1) 0 0; }
  .app-menu__group:first-child { border-top: 0; }
  .app-menu__group-label { position: static; width: auto; height: auto; overflow: visible; clip-path: none; padding: var(--space-1) var(--space-2) 0; color: var(--color-gray); font-size: 10px; text-transform: uppercase; }
  /* 竖向抽屉里 active 用左条而非下划线 */
  .app-menu__link--active {
    border-bottom: none;
    border-left: 3px solid var(--color-black);
    padding-left: var(--space-2);
  }
}
`
