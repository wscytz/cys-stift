'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CAPTURE_OPEN_EVENT } from '@/features/capture/capture-host'
import { useI18n } from '@/lib/i18n'
import type { MessageKey } from '@/lib/i18n/messages'
import { onQuotaExceeded } from '@/lib/db-client'
import { onQuotaExceeded as onMediaQuota } from '@/lib/media-store'
import { onQuotaExceeded as onFreeformQuota } from '@/lib/canvas-freeform-store'
import { pushToast } from '@/lib/toast-store'

/**
 * AppMenu — global top menu bar (v0.22.3-i18n-restore).
 * i18n bilingual + ZH/EN switcher + 4px grey stripe restored
 * (Part B1/B2 of i18n-bugfixes decision).
 */
export function AppMenu() {
  const pathname = usePathname() ?? '/'
  const { t } = useI18n()

  // 审计 H1 + R2.3/2.4:db-client / media-store / canvas-freeform-store 都是非
  // React 模块,无法直接 pushToast。AppMenu 全局挂载且是 'use client',这里订阅
  // 三个 store 的配额写入失败事件并提示用户(防静默丢卡片/媒体/画布几何)。
  useEffect(() => {
    const message = t('storage.quotaExceeded')
    const toast = () => pushToast({ kind: 'error', message })
    const unsubs = [
      onQuotaExceeded(toast),
      onMediaQuota(toast),
      onFreeformQuota(toast),
    ]
    return () => {
      unsubs.forEach((u) => u())
    }
  }, [t])

  const onCaptureClick = () => {
    window.dispatchEvent(new CustomEvent(CAPTURE_OPEN_EVENT))
  }

  const entries: { href: string; key: MessageKey }[] = [
    { href: '/inbox', key: 'nav.inbox' },
    { href: '/canvas', key: 'nav.canvas' },
    { href: '/archive', key: 'nav.archive' },
    { href: '/search', key: 'nav.search' },
    { href: '/trash', key: 'nav.trash' },
    { href: '/settings', key: 'nav.settings' },
  ]

  const activeKey = entries.find((e) => pathname.startsWith(e.href))?.key

  return (
    <nav className="app-menu" aria-label="Primary">
      <span className="app-menu__bar" aria-hidden="true" />
      <Link href="/" className="app-menu__brand">
        {t('brand.name')}
      </Link>
      <span className="app-menu__sep" aria-hidden="true">/</span>
      <div className="app-menu__entries">
        {entries.map((e) => (
          <Link
            key={e.key}
            href={e.href}
            className={`app-menu__link ${activeKey === e.key ? 'app-menu__link--active' : ''}`}
          >
            {t(e.key)}
          </Link>
        ))}
      </div>
      <span className="app-menu__spacer" />
      <button type="button" className="app-menu__capture" onClick={onCaptureClick}>
        {t('nav.capture')}
      </button>
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
  background: var(--color-gray);
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
.app-menu__entries { display: flex; gap: var(--space-1); }
.app-menu__link {
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--color-gray);
  text-decoration: none;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
}
.app-menu__link:hover { color: var(--color-black); background: var(--color-gray-soft); }
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
}
.app-menu__capture:hover { box-shadow: 2px 2px 0 0 var(--color-black); }
.app-menu__capture:active { transform: translate(1px, 1px); box-shadow: none; }
`
