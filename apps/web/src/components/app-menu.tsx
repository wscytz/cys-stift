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
import { useIsMac } from '@/lib/use-platform'
import { settingsStore } from '@/lib/settings-store'

/** R11:捕获按钮的快捷键 tooltip —— 按平台(⌘/Ctrl)+ 用户自定义快捷键显示。
 *  文案走 i18n(ocr 审 S3 P3-5:此前「随时记灵感」硬编码中文,英文用户看到
 *  混合语言;现成 key capture.hintCombo 一直没用上)。 */
function captureComboHint(isMac: boolean, t: (key: MessageKey, params?: Record<string, string | number | null | undefined>) => string): string {
  const sc = settingsStore.get().captureShortcut
  const mod = isMac ? '⌘' : 'Ctrl'
  const key =
    sc?.code === 'Comma' ? ','
    : sc?.code === 'Period' ? '.'
    : sc?.code?.startsWith('Key') ? sc.code.slice(3)
    : sc?.code ?? 'E'
  return t('capture.hintCombo', { combo: `${mod}${sc?.shift ? '+⇧' : ''}+${key}` })
}

/**
 * AppMenu — Swiss Editorial 全局侧栏(v0.2,PRD unified sidebar)。
 *
 * ≥1200:280px 固定左侧栏 —— 品牌头 / 分组导航(可见组标,sidebar-label 大写)/
 * 底部固定 Capture 主行动。active = 2px 品牌红左线(Sidebar 规范)。
 * <1200:64px 顶条(汉堡 + 品牌 + Capture)+ 左滑抽屉(1200 = 既有可读性断点:
 * 完整导航在 1024px 会把中文链接压成逐字竖排,比标准 bp-md 更窄的设备应优先
 * 保证可读和可点)。useMatchMedia 读断点,open state 控抽屉;路由切换 / 回
 * 宽屏自动关。
 */
export function AppMenu() {
  const pathname = usePathname() ?? '/'
  const { t } = useI18n()
  const isNarrow = useMatchMedia('(max-width: 1199px)')
  const isMac = useIsMac()
  const [open, setOpen] = useState(false)

  // 审计 H1 + R2.3/2.4 + quota-silence fix:所有非 React store(db-client /
  // media-store / canvas-freeform-store / canvas-store / settings-store /
  // canvas-view-store)都是非 React 模块,无法直接 pushToast。AppMenu 全局挂载
  // 且是 'use client',这里订阅各 store 的配额写入失败事件并提示用户(防静默丢
  // 卡片/媒体/画布几何/画布列表/设置/画布视图)。
  useEffect(() => {
    const message = t('storage.quotaExceeded')
    // R16:配额 toast 带「去清理」action(指向回收站硬删,最直接的腾空间入口)。
    // 此前纯文字 toast,用户刚保存失败还得凭记忆找清理路径。
    const toast = () => pushToast({
      kind: 'error',
      message,
      actions: [{ label: t('storage.quotaCleanAction'), onClick: () => { window.location.href = '/trash' } }],
    })
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

  // 路由切换关抽屉(点导航后)+ 回宽屏关(防残留)。
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
    // B-4「canvas 为家」:capture 组 canvas 排第一(唯一空间主场),inbox 是「未放置
    // 队列」(canvas 未放置面板已承载「看未放」,inbox 缩为捕获整理入口)。
    { label: 'nav.group.capture', entries: [
      { href: '/canvas', key: 'nav.canvas' },
      { href: '/inbox', key: 'nav.inbox' },
      { href: '/workbench', key: 'nav.workbench' },
    ] },
    { label: 'nav.group.think', entries: [
      { href: '/ask', key: 'nav.ask' },
      { href: '/graph', key: 'nav.graph' },
    ] },
    // B-3「收敛找回」:search 是唯一主找回入口(含 tag/时间/状态筛选);archive/tags/
    // timeline 是次级视图(专有角色:生命周期/治理/时间浏览),不再与 search 平级。
    { label: 'nav.group.find', entries: [
      { href: '/search', key: 'nav.search' },
    ] },
    { label: 'nav.group.views', entries: [
      { href: '/archive', key: 'nav.archive' },
      { href: '/tags', key: 'nav.tags' },
      { href: '/timeline', key: 'nav.timeline' },
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
      <div className="app-menu__head">
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
        <Link href="/" className="app-menu__brand">
          {t('brand.name')}
        </Link>
        <span className="app-menu__version" aria-label="app version">v{VERSION}</span>
      </div>
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
      <div className="app-menu__foot">
        <button
          type="button"
          className="app-menu__capture"
          onClick={onCaptureClick}
          // R11:捕获按钮恒带快捷键 tooltip(首次提示被过早关掉/从深链进入的用户
          // 也能从这里发现 ⌘⇧E/Ctrl+⇧E —— 不再一次性 dismiss 永久失学)。
          title={captureComboHint(isMac, t)}
        >
          {t('nav.capture')}
        </button>
      </div>
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
/* ── ≥1200:280px 固定左侧栏(编辑式 unified sidebar)─────────────────────
   main 让位由 globals.css 的 body > main { margin-left } 承担。 */
.app-menu {
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  width: var(--editorial-sidebar-width);
  background: var(--color-surface);
  border-right: var(--border-muted);
  font-family: var(--font-display);
}
.app-menu__head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: var(--editorial-topbar-height);
  padding: 0 var(--space-3);
  border-bottom: var(--border-muted);
  flex-shrink: 0;
}
.app-menu__brand {
  font-family: var(--font-display);
  font-size: var(--font-size-base);
  font-weight: 500;
  letter-spacing: -0.005em;
  color: var(--color-on-surface);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  min-height: 44px;
}
.app-menu__brand:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.app-menu__version {
  font-family: var(--font-mono);
  font-size: var(--font-size-2xs);
  color: var(--color-secondary);
  letter-spacing: 0.05em;
  user-select: none;
  margin-left: auto;
}

/* 导航主体:纵向分组,可见组标(ui-label-caps),48px 行 */
.app-menu__entries {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3) 0;
}
.app-menu__group { display: flex; flex-direction: column; }
.app-menu__group-label {
  padding: 0 var(--space-3);
  font-family: var(--font-display);
  font-weight: 600;
  font-size: var(--font-size-2xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-secondary);
}
.app-menu__link {
  display: flex;
  align-items: center;
  min-height: var(--editorial-row-height);
  padding: 0 var(--space-3) 0 calc(var(--space-3) - 2px);
  border-left: 2px solid transparent;
  font-family: var(--font-display);
  font-weight: 500;
  font-size: var(--font-size-sm);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-secondary);
  text-decoration: none;
  transition:
    color var(--duration-fast) var(--ease-standard),
    background-color var(--duration-fast) var(--ease-standard),
    border-color var(--duration-fast) var(--ease-standard);
}
.app-menu__link:hover {
  color: var(--color-on-surface);
  background: var(--color-surface-container);
}
.app-menu__link:focus-visible { outline: 2px solid var(--color-primary); outline-offset: -2px; }
/* active = 2px 品牌红左线(Sidebar 规范:#e03c31)+ 墨字 + 纸白面 */
.app-menu__link--active {
  border-left-color: var(--color-accent);
  background: var(--color-surface-white);
  color: var(--color-on-surface);
}

/* 底部固定 Capture 主行动(红填充,唯一常驻红块) */
.app-menu__foot {
  flex-shrink: 0;
  padding: var(--space-2) var(--space-2) var(--space-3);
  border-top: var(--border-muted);
}
.app-menu__capture {
  width: 100%;
  min-height: var(--editorial-row-height);
  background: var(--color-primary);
  color: var(--color-on-primary);
  border: 1px solid var(--color-on-surface);
  font-family: var(--font-display);
  font-weight: 600;
  font-size: var(--font-size-sm);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition:
    background-color var(--duration-fast) var(--ease-standard),
    color var(--duration-fast) var(--ease-standard);
}
.app-menu__capture:hover { background: var(--color-primary-container); }
.app-menu__capture:active { background: var(--color-on-surface); }
.app-menu__capture:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }

/* ── <1200:顶条 + 左滑抽屉 ─────────────────────────────────────────────
   顶条占文档流(sticky),main 不让位;entries/foot 收进 fixed 抽屉。 */
@media (max-width: 1199px) {
  .app-menu {
    position: sticky;
    bottom: auto;
    right: 0;
    width: auto;
    flex-direction: column;
    border-right: none;
    border-bottom: var(--border-muted);
    background: var(--color-surface);
  }
  .app-menu__head {
    height: var(--editorial-topbar-height);
    border-bottom: none;
  }
  .app-menu__version { display: none; }
  .app-menu__entries {
    position: fixed;
    top: var(--editorial-topbar-height);
    bottom: 0;
    left: 0;
    width: var(--editorial-sidebar-width);
    background: var(--color-surface);
    border-right: var(--border-hairline);
    transform: translateX(-100%);
    opacity: 0;
    pointer-events: none;
    transition:
      transform var(--duration-fast) var(--ease-standard),
      opacity var(--duration-fast) var(--ease-standard);
    z-index: 40;
  }
  .app-menu__entries--open {
    transform: translateX(0);
    opacity: 1;
    pointer-events: auto;
  }
  .app-menu__group { border-top: var(--border-muted); padding-top: var(--space-2); }
  .app-menu__group:first-child { border-top: 0; padding-top: 0; }
  .app-menu__foot {
    position: fixed;
    left: 0;
    bottom: 0;
    width: var(--editorial-sidebar-width);
    background: var(--color-surface);
    transform: translateX(-100%);
    transition: transform var(--duration-fast) var(--ease-standard);
    z-index: 40;
  }
  /* 抽屉开时底部 Capture 跟随滑入(entries 在前 foot 在后,~ 兄弟选择器) */
  .app-menu__entries--open ~ .app-menu__foot { transform: translateX(0); }
}

/* 汉堡按钮(<1200 显;宽屏不 render) */
.app-menu__burger {
  font-family: var(--font-mono);
  font-size: var(--font-size-base);
  background: transparent;
  color: var(--color-on-surface);
  border: none;
  cursor: pointer;
  padding: 0 var(--space-1);
  line-height: 1;
  min-width: 44px;
  min-height: 44px;
}
.app-menu__burger:hover { color: var(--color-primary); }
.app-menu__burger:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }

/* 抽屉 backdrop(open 时 render;<1200) */
.app-menu__backdrop {
  position: fixed;
  inset: 0;
  top: var(--editorial-topbar-height);
  background: var(--color-scrim);
  border: none;
  padding: 0;
  cursor: default;
  z-index: 39;
}
`
