'use client'

/**
 * cy's Stift — Swiss Editorial home(v0.2 重绘;原 Phase 0/4/6/7 结构保留:
 * 捕获入口提示 / 快捷入口 / 继续工作区 / 大入口块 / 次级链接 / 页脚)。
 * 展示结构对齐 PRD workspace_home:编辑式顶栏(crumb + 本地同步呼吸点)、
 * hero 大日期锚点(display 级,编辑式不对称)、段落编号(01/02)。
 */
import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/lib/i18n'
import { VERSION } from '@/lib/version'
import { isMac as detectIsMac, isDesktop } from '@/lib/platform'
import { CaptureHint } from '@/features/capture/capture-hint'
import { CaptureSampleHint } from '@/components/capture-sample-hint'
import { CAPTURE_OPEN_EVENT } from '@/features/capture/capture-host'
import { useDb } from '@/lib/db-client'
import { useCanvases } from '@/lib/canvas-store'
import { workbenchStore } from '@/lib/workbench-store'
import { StatusDot } from '@cys-stift/ui/status-dot'

// SSR 渲染 useEffect(不跑)/ 客户端 useLayoutEffect(paint 前跑)的标准同构钩子。
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

export default function HomePage() {
  const { t, locale } = useI18n()
  const { snap, service, ready } = useDb()
  const { snapshot: canvasSnapshot } = useCanvases()
  // 平台检测放 useEffect(navigator/window 客户端才有)。pre-mount 默认 false,
  // 让 SSG 构建期 HTML 与客户端首帧一致 —— 否则 hydration mismatch,dev 弹错误遮罩。
  const [isMac, setIsMac] = useState(false)
  const [desktop, setDesktop] = useState(false)
  // 快态(本会话已播过完整编排):挂载时、首帧绘制前读 sessionStorage 翻类。
  // SSR 侧渲染 useEffect / 客户端 useLayoutEffect:首次客户端渲染输出 false
  // (与 SSG HTML 一致,无水合错配),layout 阶段翻 true 的重渲染发生在 paint 前
  // —— 完整模式的动画参数从未被画出来,无闪烁。(不能靠 layout.tsx 内联脚本:
  // SPA 导航回 home 时脚本不再执行。)
  const [fast, setFast] = useState(false)
  useIsoLayoutEffect(() => {
    try {
      if (sessionStorage.getItem('cys-stift.home-entered')) setFast(true)
    } catch {}
  }, [])
  // PRD workspace_home 的日期锚点:同样挂载后渲染(SSG 构建期日期会过期,且
  // toLocaleDateString 依赖运行时 ICU;首帧空串两侧一致,无水合错配)。
  const [dateParts, setDateParts] = useState({ full: '', day: '', my: '' })
  useEffect(() => {
    setIsMac(detectIsMac())
    setDesktop(isDesktop())
    const d = new Date()
    setDateParts({
      full: d.toLocaleDateString(locale === 'en' ? 'en-US' : 'zh-CN', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      }),
      day: String(d.getDate()),
      my:
        locale === 'en'
          ? `${d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()} ${d.getFullYear()}`
          : `${d.getFullYear()}年${d.getMonth() + 1}月`,
    })
  }, [locale])
  // 完整入场播完后标记本会话已播(下次进 home 走 350ms 快速态;提前离开则
  // cleanup 掉定时器不标记,下次仍看完整编排)。
  useEffect(() => {
    const t = setTimeout(() => {
      try { sessionStorage.setItem('cys-stift.home-entered', '1') } catch {}
    }, 1200)
    return () => clearTimeout(t)
  }, [])
  const activeCanvas = canvasSnapshot.canvases.find((canvas) => canvas.id === canvasSnapshot.activeCanvasId)
  const activeCount = ready ? service.listOnCanvas(canvasSnapshot.activeCanvasId).length : 0
  const recentCards = useMemo(() => {
    if (!ready) return []
    return service.listAll()
      .filter((card) => !card.deletedAt && !card.archived)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, 4)
  }, [ready, service, snap])
  return (
    <main id="main" tabIndex={-1} className={`home${fast ? ' home--fast' : ''}`}>
      <CaptureHint />
      <CaptureSampleHint />
      <section className="home__content">
        {/* 编辑式顶栏(PRD topbar:左 crumb / 右 本地同步呼吸点) */}
        <div className="home__topbar">
          <span className="home__crumb">
            {t('brand.name')} <span className="home__crumb-sep" aria-hidden="true">/</span> {t('home.topbar.index')}
          </span>
          <span className="home__sync">
            <StatusDot pulse />
            {t('home.topbar.sync')}
          </span>
        </div>

        {/* hero:左 标题组 / 右 大日期锚点(编辑式不对称) */}
        <div className="home__hero">
          <div className="home__hero-left">
            <p className="home__eyebrow">{t('home.eyebrow')}</p>
            <h1 className="home__title">
              cy&rsquo;s <span className="home__title-accent">Stift</span>
            </h1>
            <p className="home__lede">{t('home.tagline')}</p>
          </div>
          <div className="home__hero-date" role="group" aria-label={dateParts.full || undefined}>
            <span className="home__hero-day">{dateParts.day}</span>
            <span className="home__hero-my">{dateParts.my}</span>
          </div>
        </div>

        <div className="home__quick-actions">
          <button
            type="button"
            className="home__capture"
            onClick={() => window.dispatchEvent(new CustomEvent(CAPTURE_OPEN_EVENT))}
          >
            <span className="home__capture-arrow" aria-hidden="true">+</span>
            <span className="home__capture-label">{t('home.feature.capture.title')}</span>
            <span className="home__capture-note">
              {desktop ? (isMac ? t('home.hint.mac') : t('home.hint.win')) : t('home.feature.capture.desc')}
            </span>
          </button>
          <Link href="/inbox" className="home__inbox-action">
            <span aria-hidden="true">→</span>
            <span>{t('home.feature.inbox.title')}</span>
          </Link>
        </div>
        <section className="home__continue" aria-labelledby="home-continue-title">
          <div className="home__section-head">
            <h2 id="home-continue-title">
              <span className="home__secno" aria-hidden="true">01</span>
              {t('home.continue')}
            </h2>
            <Link href="/workbench">{t('home.openWorkbench')}</Link>
          </div>
          <div className="home__current">
            <span>{t('home.currentCanvas')}</span>
            <Link href="/canvas">
              <strong>{activeCanvas?.name ?? t('nav.canvas')}</strong>
              <small>{t('home.canvasCardCount', { n: String(activeCount) })}</small>
            </Link>
          </div>
          <div className="home__recent">
            <span>{t('home.recent')}</span>
            {recentCards.length === 0 ? (
              <p>{t('home.noRecent')}</p>
            ) : (
              <ul>
                {recentCards.map((card) => (
                  <li key={card.id}>
                    <Link href="/workbench" onClick={() => workbenchStore.open(card.id, '/')}>
                      <strong>{card.title || t('card.untitled')}</strong>
                      <small>{card.updatedAt.toLocaleDateString()}</small>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
        <nav className="home__nav" aria-label={t('nav.homeNav')}>
          <p className="home__secno-row">
            <span className="home__secno" aria-hidden="true">02</span>
            <span className="home__secno-label">{t('nav.homeNav')}</span>
          </p>
          <Link href="/canvas" className="home__nav-link home__nav-link--canvas">
            <span className="home__nav-arrow" aria-hidden="true">→</span>
            <span className="home__nav-label">{t('home.feature.canvas.title')}</span>
            <span className="home__nav-note">{t('home.feature.canvas.desc')}</span>
          </Link>
          <Link href="/archive" className="home__nav-link home__nav-link--archive">
            <span className="home__nav-arrow" aria-hidden="true">→</span>
            <span className="home__nav-label">{t('home.feature.archive.title')}</span>
            <span className="home__nav-note">{t('home.feature.archive.desc')}</span>
          </Link>
        </nav>
        <nav className="home__secondary" aria-label="Secondary">
          <Link href="/showcase" className="home__secondary-link">{t('nav.showcase')}</Link>
          <span className="home__secondary-sep" aria-hidden="true">/</span>
          <Link href="/ask" className="home__secondary-link home__secondary-link--accent">{t('nav.ask')}</Link>
          <span className="home__secondary-sep" aria-hidden="true">/</span>
          <Link href="/search" className="home__secondary-link">{t('nav.search')}</Link>
          <span className="home__secondary-sep" aria-hidden="true">/</span>
          <Link href="/trash" className="home__secondary-link">{t('nav.trash')}</Link>
          <span className="home__secondary-sep" aria-hidden="true">/</span>
          <Link href="/settings" className="home__secondary-link">{t('nav.settings')}</Link>
        </nav>
        <footer className="home__foot">
          <span>{t('home.eyebrow')}</span>
          {/* R11:首启隐私承诺 —— 数据仅存本机 + 可导出 JSON,指向 settings 数据区。
              此前完整说明埋在 /settings,隐私敏感用户第一天看不到会不安全感。 */}
          <Link href="/settings#data" className="home__privacy">
            {t('home.privacy')}
          </Link>
          {/* Version:单一可信源 = root package.json "version",由
              scripts/gen-version.mjs 在 prebuild 时写入 lib/version.ts。
              静态导出无 server,这里只 import build-time 常量。 */}
          <span>v{VERSION}</span>
        </footer>
      </section>
      <style>{`
        /* Swiss Editorial home(编辑式:纸底、1px 线、display 锚点、零阴影) */
        .home { min-height: 100vh; }
        /* 分段入场(PRD animated 稿:fadeInUp 600ms editorial 曲线,100ms 步进;
           标题加 letterSpacingIn 0.1em→-0.03em)。关掉 globals 的 main 级入场防叠加。 */
        .home { animation: none; }
        .home__content > * { animation: home-fade-up var(--duration-enter) var(--ease-editorial) both; }
        .home__content > *:nth-child(2) { animation-delay: calc(var(--stagger-step) * 1); }
        .home__content > *:nth-child(3) { animation-delay: calc(var(--stagger-step) * 2); }
        .home__content > *:nth-child(4) { animation-delay: calc(var(--stagger-step) * 3); }
        .home__content > *:nth-child(n + 5) { animation-delay: calc(var(--stagger-step) * 4); }
        /* hero 自身不入场(由内部子元素分段入场),避免双重位移 */
        .home__hero { animation: none; }
        .home__hero-left > * { animation: home-fade-up var(--duration-enter) var(--ease-editorial) both; }
        .home__hero-left > *:nth-child(2) { animation-delay: calc(var(--stagger-step) * 1); }
        .home__hero-left > *:nth-child(3) { animation-delay: calc(var(--stagger-step) * 2); }
        .home__hero-left > .home__title {
          animation:
            home-fade-up var(--duration-enter) var(--ease-editorial) calc(var(--stagger-step) * 1) both,
            home-tracking-in var(--duration-enter) var(--ease-editorial) calc(var(--stagger-step) * 1) both;
        }
        .home__hero-date { animation: home-fade-up var(--duration-enter) var(--ease-editorial) calc(var(--stagger-step) * 3) both; }
        @keyframes home-fade-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes home-tracking-in {
          from { letter-spacing: 0.1em; opacity: 0; }
          to { letter-spacing: -0.03em; opacity: 1; }
        }
        /* 快速态 .home--fast(本会话已播过完整编排):350ms 无步进,标题去
           字距动画 —— 首页是高频往返页,完整 1s 编排留给每次会话的第一眼。 */
        .home--fast .home__content > *,
        .home--fast .home__hero-left > *,
        .home--fast .home__hero-date {
          animation-duration: var(--duration-page);
          animation-delay: 0ms;
        }
        .home--fast .home__title {
          animation: home-fade-up var(--duration-page) var(--ease-editorial) both;
        }
        @media (prefers-reduced-motion: reduce) {
          .home, .home * { animation: none !important; }
          .home__capture:active, .home__inbox-action:active, .home__nav-link:active { transform: none; }
        }

        .home__content {
          padding: var(--space-4) var(--space-10) var(--space-8);
          max-width: 960px;
          display: flex;
          flex-direction: column;
          gap: var(--space-6);
        }
        /* 顶栏:crumb + 本地同步状态(PRD topbar 结构) */
        .home__topbar {
          height: var(--editorial-topbar-height);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-2);
          border-bottom: var(--border-muted);
        }
        .home__crumb {
          font-family: var(--font-display);
          font-weight: 600;
          font-size: var(--font-size-xs);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--color-on-surface);
        }
        .home__crumb-sep { color: var(--color-border-muted); padding: 0 var(--space-quarter); }
        .home__sync {
          display: inline-flex;
          align-items: center;
          gap: var(--space-1);
          padding: var(--space-quarter) var(--space-1);
          border: var(--border-muted);
          font-family: var(--font-mono);
          font-size: var(--font-size-2xs);
          letter-spacing: 0.05em;
          color: var(--color-secondary);
          white-space: nowrap;
        }
        /* hero:左标题组 / 右大日期(编辑式不对称,底边 1px 基线) */
        .home__hero {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: var(--space-6);
          align-items: end;
          padding-bottom: var(--space-3);
          border-bottom: var(--border-muted);
        }
        .home__eyebrow {
          margin: 0 0 var(--space-2);
          font-family: var(--font-display);
          font-weight: 600;
          font-size: var(--font-size-xs);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--color-secondary);
        }
        .home__title {
          margin: 0;
          font-family: var(--font-display);
          font-weight: 500;
          font-size: var(--font-size-4xl);
          line-height: 1.1;
          letter-spacing: -0.03em;
        }
        .home__title-accent { color: var(--color-primary); }
        .home__lede {
          margin: var(--space-2) 0 0;
          font-family: var(--font-body);
          font-size: var(--font-size-lg);
          line-height: 1.6;
          color: var(--color-on-surface-variant);
        }
        .home__hero-date {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: var(--space-1);
          padding-left: var(--space-6);
          border-left: var(--border-muted);
          text-align: right;
        }
        .home__hero-day {
          font-family: var(--font-display);
          font-weight: 500;
          font-size: var(--font-size-4xl);
          line-height: 0.9;
          letter-spacing: -0.03em;
          color: var(--color-on-surface);
          font-variant-numeric: tabular-nums;
        }
        .home__hero-my {
          font-family: var(--font-display);
          font-weight: 600;
          font-size: var(--font-size-xs);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--color-secondary);
        }
        .home__quick-actions { display: grid; grid-template-columns: minmax(0, 2fr) minmax(140px, 1fr); gap: var(--space-2); }
        .home__inbox-action {
          display: flex; min-height: 72px; align-items: center; justify-content: center; gap: var(--space-2);
          border: var(--border-hairline);
          background: var(--color-surface);
          color: var(--color-on-surface);
          text-decoration: none;
          font-family: var(--font-display);
          font-size: var(--font-size-lg);
          transition: background-color var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard), transform var(--duration-press) var(--ease-standard);
        }
        /* hover 反白(spec Buttons:Surface↔Text 反转) */
        .home__inbox-action:hover { background: var(--color-on-surface); color: var(--color-surface); }
        .home__inbox-action:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
        .home__inbox-action:active { transform: scale(0.98); }
        .home__continue { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr); gap: var(--space-3); border-top: var(--border-muted); padding-top: var(--space-3); }
        .home__section-head { grid-column: 1 / -1; display: flex; align-items: baseline; justify-content: space-between; }
        .home__section-head h2 { margin: 0; font-family: var(--font-display); font-size: var(--font-size-xl); font-weight: 500; letter-spacing: -0.01em; }
        .home__section-head a { color: var(--color-on-surface); font-family: var(--font-display); font-weight: 600; font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.08em; }
        .home__current > span, .home__recent > span { display: block; margin-bottom: var(--space-1); font-family: var(--font-display); font-weight: 600; font-size: var(--font-size-2xs); color: var(--color-secondary); text-transform: uppercase; letter-spacing: 0.08em; }
        /* 48px 行 + muted 底线 + 白 hover(Data Tables 行规范) */
        .home__current a, .home__recent a {
          display: flex; min-height: var(--editorial-row-height); align-items: center; justify-content: space-between; gap: var(--space-2);
          color: var(--color-on-surface); text-decoration: none;
          border-bottom: var(--border-muted);
          padding: 0 var(--space-1);
          margin: 0 calc(-1 * var(--space-1));
          transition: background-color var(--duration-fast) var(--ease-standard);
        }
        .home__current a:hover, .home__recent a:hover { background: var(--color-surface-white); }
        /* 共享元素过渡:此画布名与 /canvas 的切换器(.cselect)同名 —— 支持同文档
           VT 的引擎里,首页→画布的元素级 morph(名字"飞过去");其余引擎无副作用。 */
        .home__current strong { view-transition-name: current-canvas; }
        .home__current small, .home__recent small { color: var(--color-secondary); font-family: var(--font-mono); font-size: var(--font-size-2xs); }
        .home__recent ul { margin: 0; padding: 0; list-style: none; }
        .home__recent p { color: var(--color-secondary); }
        /* 段落编号(PRD 编辑式编号锚,红色小号) */
        .home__secno {
          font-family: var(--font-mono);
          font-size: var(--font-size-2xs);
          font-weight: 500;
          letter-spacing: 0.08em;
          color: var(--color-accent);
          margin-right: var(--space-2);
        }
        .home__secno-row { margin: 0; display: flex; align-items: baseline; }
        .home__secno-label {
          font-family: var(--font-display);
          font-weight: 600;
          font-size: var(--font-size-2xs);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--color-secondary);
        }
        @media (max-width: 640px) { .home__continue { grid-template-columns: 1fr; } .home__section-head { grid-column: 1; } }
        .home__foot {
          margin-top: auto;
          padding-top: var(--space-8);
          display: flex;
          gap: var(--space-2);
          justify-content: space-between;
          font-family: var(--font-mono);
          font-size: var(--font-size-2xs);
          letter-spacing: 0.05em;
          color: var(--color-secondary);
          border-top: var(--border-muted);
        }
        /* Secondary text-link row: low-emphasis links to Search / Trash / Settings
           so a user landing on / can reach them without opening the sidebar. */
        .home__secondary {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          font-family: var(--font-display);
          font-weight: 600;
          font-size: var(--font-size-xs);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--color-secondary);
        }
        .home__secondary-link {
          color: var(--color-secondary);
          text-decoration: none;
          border-bottom: 1px solid transparent;
          padding-bottom: 1px;
          transition: color var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard);
        }
        .home__secondary-link:hover { color: var(--color-on-surface); border-bottom-color: var(--color-on-surface); }
        .home__secondary-link--accent:hover { color: var(--color-primary); border-bottom-color: var(--color-primary); }
        .home__secondary-link:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
        .home__secondary-sep { color: var(--color-border-muted); }
        .home__nav { margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-3); }
        /* Capture hint card — decorative. The actual Mini Input is global
           and launches from anywhere via Cmd/Ctrl+Shift+E. We don't
           wire a click handler to this card to keep the capture flow
           single-source (the keyboard shortcut). */
        .home__capture {
          display: grid;
          grid-template-columns: 48px auto 1fr;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-3) var(--space-3);
          background: var(--color-primary);
          color: var(--color-on-primary);
          border: 1px solid var(--color-on-surface);
          border-radius: var(--radius-sm);
          cursor: pointer;
          text-align: left;
          font: inherit;
          transition: background-color var(--duration-fast) var(--ease-standard), transform var(--duration-press) var(--ease-standard);
        }
        .home__capture:hover { background: var(--color-primary-container); }
        .home__capture:active { background: var(--color-on-surface); transform: scale(0.98); }
        .home__capture:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
        .home__capture-arrow {
          display: inline-flex; align-items: center; justify-content: center;
          width: 48px; height: 48px;
          background: var(--color-surface);
          color: var(--color-primary);
          font-family: var(--font-mono);
          font-size: var(--font-size-2xl);
          font-weight: 700;
        }
        .home__capture-label {
          font-family: var(--font-display);
          font-size: var(--font-size-2xl);
          font-weight: 500;
          letter-spacing: -0.01em;
          color: var(--color-on-primary);
        }
        .home__capture-note {
          font-family: var(--font-display);
          font-weight: 600;
          font-size: var(--font-size-2xs);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          text-align: right;
        }
        @media (max-width: 768px) {
          .home__content { padding: var(--space-2) var(--space-3) var(--space-4); gap: var(--space-4); }
          .home__hero { grid-template-columns: 1fr; }
          .home__hero-date { align-items: flex-start; text-align: left; border-left: none; padding-left: 0; border-top: var(--border-muted); padding-top: var(--space-2); }
          .home__quick-actions { grid-template-columns: 1fr; }
          .home__capture-note { display: block; text-align: left; grid-column: 2; }
          .home__capture { grid-template-columns: 48px 1fr; }
        }
        /* 大入口块(canvas/archive):1px 墨线 + 白 hover,箭头方块区域色 */
        .home__nav-link {
          display: grid;
          grid-template-columns: 48px auto 1fr;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-3) var(--space-3);
          background: var(--color-surface);
          color: var(--color-on-surface);
          text-decoration: none;
          border: var(--border-hairline);
          border-radius: var(--radius-sm);
          transition: background-color var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard), transform var(--duration-press) var(--ease-standard);
        }
        .home__nav-link:hover { background: var(--color-surface-white); }
        .home__nav-link:active { background: var(--color-surface-container); transform: scale(0.98); }
        .home__nav-link:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
        .home__nav-arrow {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 48px;
          height: 48px;
          background: var(--color-secondary);
          color: var(--color-surface);
          font-family: var(--font-display);
          font-size: var(--font-size-2xl);
          line-height: 1;
        }
        .home__nav-link--canvas .home__nav-arrow { background: var(--color-on-surface); }
        .home__nav-link--archive .home__nav-arrow { background: var(--color-tertiary); }
        .home__nav-label {
          font-family: var(--font-display);
          font-size: var(--font-size-2xl);
          font-weight: 500;
          letter-spacing: -0.01em;
        }
        .home__nav-note {
          font-family: var(--font-display);
          font-weight: 600;
          font-size: var(--font-size-2xs);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--color-secondary);
          text-align: right;
        }
        @media (max-width: 768px) {
          .home__nav-link { grid-template-columns: 48px 1fr; }
          .home__nav-note { grid-column: 1 / -1; text-align: left; }
        }
      `}</style>
    </main>
  )
}
