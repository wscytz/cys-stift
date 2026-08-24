'use client'

import { useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react'
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

/** 折叠钉住态的持久化 key。layout.tsx 的 inline script 用同名 key 在首帧前
 *  设 --app-sidebar-w(零闪烁);此处读/写同一份。 */
const SIDEBAR_PINNED_KEY = 'cys-stift.sidebar-pinned'

function applySidebarWidth(pinned: boolean) {
  // 值引用 token(非字面量):宽度真相源 = tokens.css 的 --editorial-*-width
  document.documentElement.style.setProperty(
    '--app-sidebar-w',
    pinned ? 'var(--editorial-sidebar-width)' : 'var(--editorial-rail-width)',
  )
}

/* ── 导航图标(Swiss Editorial:24 viewBox、1.5px 线描、方角、currentColor,
      复刻 PRD 侧栏的几何线稿风;无 hex,随 token 换色)────────────────── */
function NavIcon({ id }: { id: string }) {
  const common = {
    width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.5, 'aria-hidden': true as const,
    focusable: 'false' as const,
  }
  switch (id) {
    case 'canvas': // 画板:外框 + 内方(画布上的卡)
      return (
        <svg {...common}><rect x="4" y="4" width="13" height="13" /><rect x="8.5" y="8.5" width="4" height="4" /></svg>
      )
    case 'inbox': // 捕获队列:纸面横线组(未放置的条目)
      return (
        <svg {...common}><path d="M4.5 6.5h12M4.5 11h12M4.5 15.5h7" /></svg>
      )
    case 'workbench': // 工作台:台面 + 上架
      return (
        <svg {...common}><rect x="5" y="8" width="10" height="10" /><path d="M8 8V4.5h7.5V8" /></svg>
      )
    case 'ask': // 提问:框内一点(待答)
      return (
        <svg {...common}><rect x="4.5" y="4.5" width="12" height="12" /><circle cx="10.5" cy="10.5" r="1.4" fill="currentColor" stroke="none" /></svg>
      )
    case 'graph': // 网络:三节点连线
      return (
        <svg {...common}>
          <path d="M7.5 7.5l6.5 1M7.5 7.5l2.5 6.5M14 8.5l-4 5.5" />
          <circle cx="7.5" cy="7.5" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="14" cy="8.5" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="10" cy="14" r="1.6" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'search': // 找回:方镜 + 柄(方角放大镜)
      return (
        <svg {...common}><rect x="4.5" y="4.5" width="11" height="11" /><path d="M15.5 15.5L20 20" /></svg>
      )
    case 'archive': // 归档:盒 + 沿 + 中线
      return (
        <svg {...common}><path d="M5 6.5V4.5h11v2M4.5 6.5h12v10h-12z" /><path d="M9 11.5h3.5" /></svg>
      )
    case 'tags': // 标签:小方 + 引线
      return (
        <svg {...common}><rect x="4.5" y="4.5" width="8" height="8" /><path d="M12.5 12.5l4.5 4.5M17 17v-3M17 17h-3" /></svg>
      )
    case 'timeline': // 时间轴:竖轴 + 三点
      return (
        <svg {...common}>
          <path d="M9.5 4.5v13" />
          <circle cx="9.5" cy="6.5" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="9.5" cy="11" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="9.5" cy="15.5" r="1.6" fill="currentColor" stroke="none" />
          <path d="M13 6.5h4M13 11h4M13 15.5h4" />
        </svg>
      )
    case 'trash': // 回收:桶 + 沿 + 提手
      return (
        <svg {...common}><path d="M6 7.5h11v10H6z" /><path d="M4.5 7.5h14M9.5 7.5V5h4v2.5" /></svg>
      )
    case 'settings': // 设置:中方 + 四向齿线
      return (
        <svg {...common}><rect x="8" y="8" width="7" height="7" /><path d="M11.5 4.5v2M11.5 16.5v2M4.5 11.5h2M16.5 11.5h2" /></svg>
      )
    default:
      return null
  }
}

/**
 * AppMenu — Swiss Editorial 全局侧栏(v0.2,PRD unified sidebar)。
 *
 * 收起/展开机制(用户需求:默认收起、移入展开、按钮可钉住):
 *   - 默认 64px 图标轨(rail):品牌记号 + 图标导航 + 底部 Capture 加号块;
 *     图标锚定在轨中心(x=32),标签原地显隐 —— 是宽度收张(width 64↔280),
 *     不是面板平移(旧 translate 方案收起态会露出被裁切的标签尾巴,已废弃)。
 *   - 鼠标移入(:hover)或键盘聚焦(:focus-within,保证 Tab 可达)→ 展开到
 *     280px(覆盖式,不推挤内容);移出即收。150ms。
 *   - head 上的 pin 钮(«/»)钉住展开:常驻 280 并推挤内容(main margin 由
 *     --app-sidebar-w 控制,layout inline script 首帧前按持久化偏好设好,
 *     零闪烁);再点回收起。偏好 localStorage 持久化。
 *   - <1200:64px 顶条(汉堡 + 品牌 + Capture)+ 左滑抽屉(1200 = 既有可读
 *     性断点);rail/pin 机制仅在宽屏生效。
 *
 * 配额订阅 / i18n 分组 IA / active 探测 / 捕获快捷键 tooltip 逻辑自 v0.1 起不变。
 */
export function AppMenu() {
  const pathname = usePathname() ?? '/'
  const { t } = useI18n()
  const isNarrow = useMatchMedia('(max-width: 1199px)')
  const isMac = useIsMac()
  const [open, setOpen] = useState(false)
  // 默认 false(收起轨);挂载后读持久化偏好(SSG 首帧 = 客户端首帧,无水合错配)。
  const [pinned, setPinned] = useState(false)
  // 取消钉住的即时反馈:unpin 时鼠标仍悬在栏上,:hover 会让它"看起来没收"。
  // 抑制 hover 展开到鼠标离开侧栏为止 —— 按下即见收起,同一按钮就地切换。
  const [suppressHover, setSuppressHover] = useState(false)

  useEffect(() => {
    let stored = false
    try {
      stored = localStorage.getItem(SIDEBAR_PINNED_KEY) === '1'
    } catch {
      stored = false
    }
    setPinned(stored)
    applySidebarWidth(stored)
  }, [])

  const togglePinned = (e?: ReactMouseEvent<HTMLButtonElement>) => {
    // 注意:不要把副作用(setSuppressHover/localStorage)写进 setPinned 的 updater
    // —— updater 在渲染期执行,副作用会被丢(updater 只该算下一个 state)。
    const next = !pinned
    try {
      localStorage.setItem(SIDEBAR_PINNED_KEY, next ? '1' : '0')
    } catch {
      // 私隐模式等 localStorage 不可写:仅本会话生效
    }
    applySidebarWidth(next)
    setPinned(next)
    if (!next) {
      // 点击即收的完整闭环:①抑制 :hover(鼠标还停在栏上)②blur 按钮 ——
      // 否则焦点留在 pin 上,:focus-within 也会把栏撑在 280(实测踩过);
      // 按钮即将随收起隐藏,留着焦点本就不对。键盘用户下一次 Tab 从头进
      // 轨,链接聚焦照样展开(focus-within 不受抑制)。
      setSuppressHover(true)
      e?.currentTarget.blur()
    }
  }

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
  const iconFor = (href: string) => href.replace(/^\//, '').split('/')[0] ?? ''

  return (
    <nav
      className={`app-menu${pinned ? ' app-menu--pinned' : ' app-menu--rail'}${suppressHover ? ' app-menu--no-hover' : ''}`}
      aria-label="Primary"
      onMouseLeave={() => setSuppressHover(false)}
    >
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
          {/* 品牌记号(收起轨里单独可见):墨斜杠 + 红点 */}
          <svg className="app-menu__mark" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <line x1="6" y1="18" x2="18" y2="6" stroke="var(--color-on-surface)" strokeWidth="2" />
            <circle cx="16" cy="8" r="2.5" fill="var(--color-accent)" />
          </svg>
          <span className="app-menu__brand-name">{t('brand.name')}</span>
        </Link>
        <span className="app-menu__version" aria-label="app version">v{VERSION}</span>
        <button
          type="button"
          className="app-menu__pin"
          aria-pressed={pinned}
          title={pinned ? '⇤ 收起侧栏' : '⇥ 钉住展开'}
          onClick={togglePinned}
        >
          {pinned ? '«' : '»'}

        </button>
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
                <span className="app-menu__icon"><NavIcon id={iconFor(e.href)} /></span>
                <span className="app-menu__link-label">{t(e.key)}</span>
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
          <span className="app-menu__icon app-menu__icon--capture" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7.5 12h9M12 7.5v9" />
            </svg>
          </span>
          <span className="app-menu__link-label">{t('nav.capture')}</span>
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
/* ── ≥1200:侧栏收起/展开(width 收张,非平移)────────────────────────────
   图标锚定 64px 轨中心(x=32):head/links 的左 padding 恒 20px,图标恒在原位;
   标签原地显隐(clip by overflow)。收起 64 ↔ 悬停/聚焦 280(覆盖式,不推挤);
   钉住 = 常驻 280 并推挤内容(margin = --app-sidebar-w,layout inline script
   按 pin 偏好首帧设定,AppMenu 切换时更新)。 */
.app-menu {
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  width: var(--editorial-rail-width);
  overflow: hidden;
  background: var(--color-surface);
  border-right: var(--border-muted);
  font-family: var(--font-display);
  transition: width var(--duration-fast) var(--ease-standard);
}

/* 钉住态:常驻全宽 */
.app-menu--pinned { width: var(--editorial-sidebar-width); }

/* 悬停 / 键盘聚焦 → 展开(:focus-within 保证 Tab 进导航时焦点可见)。
   展开是覆盖式 overlay:右边界线加重为墨线(零阴影规范内的线层级)。
   --no-hover:刚取消钉住(unpin)时抑制 hover 展开(到 mouseleave)——
   否则鼠标还停在栏上,「点了收起却没反应」。键盘聚焦不受抑制。 */
.app-menu--rail:hover:not(.app-menu--no-hover),
.app-menu--rail:focus-within {
  width: var(--editorial-sidebar-width);
  border-right: var(--border-hairline);
}
.app-menu--no-hover .app-menu__pin { color: var(--color-secondary); }

/* 标签族(文字部分):收起隐藏、展开原地淡入。visibility 带 delay 收尾,
   防止隐形占位拦截点击;展开时立即恢复可见。 */
.app-menu--rail .app-menu__link-label,
.app-menu--rail .app-menu__group-label,
.app-menu--rail .app-menu__brand-name,
.app-menu--rail .app-menu__version,
.app-menu--rail .app-menu__pin {
  opacity: 0;
  visibility: hidden;
  transition:
    opacity var(--duration-fast) var(--ease-standard),
    visibility 0s linear var(--duration-fast);
}
.app-menu--rail:hover .app-menu__link-label,
.app-menu--rail:focus-within .app-menu__link-label,
.app-menu--rail:hover .app-menu__group-label,
.app-menu--rail:focus-within .app-menu__group-label,
.app-menu--rail:hover .app-menu__brand-name,
.app-menu--rail:focus-within .app-menu__brand-name,
.app-menu--rail:hover .app-menu__version,
.app-menu--rail:focus-within .app-menu__version,
.app-menu--rail:hover .app-menu__pin,
.app-menu--rail:focus-within .app-menu__pin {
  opacity: 1;
  visibility: visible;
  transition: opacity var(--duration-fast) var(--ease-standard) 50ms;
}

.app-menu__head {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  height: var(--editorial-topbar-height);
  padding: 0 var(--space-1) 0 calc((var(--editorial-rail-width) - 24px) / 2);
  border-bottom: var(--border-muted);
  flex-shrink: 0;
}
.app-menu__mark { flex-shrink: 0; }
.app-menu__brand {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  min-height: 44px;
  font-family: var(--font-display);
  font-size: var(--font-size-sm);
  font-weight: 500;
  letter-spacing: -0.005em;
  color: var(--color-on-surface);
  text-decoration: none;
  white-space: nowrap;
}
.app-menu__brand:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.app-menu__version {
  font-family: var(--font-mono);
  font-size: var(--font-size-2xs);
  color: var(--color-secondary);
  letter-spacing: 0.05em;
  user-select: none;
  margin-left: auto;
  white-space: nowrap;
}
/* pin 钉住钮:44px 触达面积,双态字符 «/» */
.app-menu__pin {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--color-secondary);
  border: none;
  font-family: var(--font-mono);
  font-size: var(--font-size-base);
  cursor: pointer;
  transition: color var(--duration-fast) var(--ease-standard), background-color var(--duration-fast) var(--ease-standard);
}
.app-menu__pin:hover { color: var(--color-on-surface); background: var(--color-surface-container); }
.app-menu__pin:focus-visible { outline: 2px solid var(--color-primary); outline-offset: -2px; }
.app-menu__pin[aria-pressed='true'] { color: var(--color-on-surface); }

/* 导航主体:纵向分组,可见组标(ui-label-caps),48px 行 */
.app-menu__entries {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3) 0;
}
.app-menu__group { display: flex; flex-direction: column; }
.app-menu__group-label {
  /* 与 .app-menu__link-label 文字起点对齐:border2+padding18+图标24+gap16 = 60px */
  padding: 0 var(--space-3) 0 calc((var(--editorial-rail-width) - 24px) / 2 - var(--space-quarter) + 24px + var(--space-2));
  font-family: var(--font-display);
  font-weight: 600;
  font-size: var(--font-size-2xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-secondary);
  white-space: nowrap;
}
.app-menu__link {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--editorial-row-height);
  /* 左 padding 减 border-left 宽(2px,border-box 内收),保证图标中心 = 轨心 32px,
     与品牌记号/Capture 加号严格成一条垂直线 */
  padding: 0 var(--space-3) 0 calc((var(--editorial-rail-width) - 24px) / 2 - var(--space-quarter));
  border-left: 2px solid transparent;
  color: var(--color-secondary);
  text-decoration: none;
  white-space: nowrap;
  transition:
    color var(--duration-fast) var(--ease-standard),
    background-color var(--duration-fast) var(--ease-standard),
    border-color var(--duration-fast) var(--ease-standard);
}
.app-menu__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}
.app-menu__link-label {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: var(--font-size-sm);
  text-transform: uppercase;
  letter-spacing: 0.05em;
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

/* 底部固定 Capture 主行动(红填充,唯一常驻红块);收起轨内只露 + 图标块 */
.app-menu__foot {
  flex-shrink: 0;
  /* 左右 space-1(8px):8(foot pad)+1(btn border)+11(btn padding)=20 →
     图标中心 = 轨心 32px,与导航图标严格同轴 */
  padding: var(--space-2) var(--space-1) var(--space-3) var(--space-1);
  border-top: var(--border-muted);
}
.app-menu__capture {
  width: 100%;
  min-height: var(--editorial-row-height);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  /* foot 自带 space-2 外边距 + 按钮 1px 边框:8+1+11=20px → 图标中心 = 轨心 32px */
  padding: 0 var(--space-2) 0 calc(var(--space-1) + var(--space-quarter) + 1px);
  background: var(--color-primary);
  color: var(--color-on-primary);
  border: 1px solid var(--color-on-surface);
  font-family: var(--font-display);
  font-weight: 600;
  font-size: var(--font-size-sm);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color var(--duration-fast) var(--ease-standard),
    color var(--duration-fast) var(--ease-standard);
}
.app-menu__capture:hover { background: var(--color-primary-container); }
.app-menu__capture:active { background: var(--color-on-surface); }
.app-menu__capture:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }

/* ── <1200:顶条 + 左滑抽屉(rail/pin 机制停用)────────────────────── */
@media (max-width: 1199px) {
  .app-menu,
  .app-menu--rail,
  .app-menu--pinned,
  .app-menu--rail:hover,
  .app-menu--rail:focus-within {
    position: sticky;
    bottom: auto;
    right: 0;
    width: auto;
    overflow: visible;
    flex-direction: column;
    border-right: none;
    border-bottom: var(--border-muted);
    background: var(--color-surface);
  }
  /* 抽屉形态标签恒可见(顶条上品牌名也显示) */
  .app-menu--rail .app-menu__link-label,
  .app-menu--rail .app-menu__group-label,
  .app-menu--rail .app-menu__brand-name {
    opacity: 1;
    visibility: visible;
  }
  .app-menu__head {
    height: var(--editorial-topbar-height);
    border-bottom: none;
    padding: 0 var(--space-2);
  }
  .app-menu__brand { flex: 1; }
  .app-menu__version,
  .app-menu__pin { display: none; }
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
  /* 抽屉开时底部 Capture 跟随滑入(entries 在前 foot 在后,~ 兄弟选择器) */
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
  .app-menu__entries--open ~ .app-menu__foot { transform: translateX(0); }
  .app-menu__capture { padding-left: var(--space-2); }
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

/* 减少动效:宽高收张瞬切(显隐本身保留) */
@media (prefers-reduced-motion: reduce) {
  .app-menu { transition: none; }
}
`
