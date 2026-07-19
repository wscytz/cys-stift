'use client'

/**
 * cy's Stift — Phase 0 + Phase 4 + Phase 6 + Phase 7. A Bauhaus-styled
 * home page so we can verify tokens, fonts and the 8px grid are wired.
 * Phase 6 adds the capture entry hint (Cmd/Ctrl+Shift+E). The same entry is
 * clickable so first-time users do not need to discover the shortcut.
 * Phase 7 adds the Archive entry (blue region stripe).
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/lib/i18n'
import { VERSION } from '@/lib/version'
import { isMac as detectIsMac, isDesktop } from '@/lib/platform'
import { CaptureHint } from '@/features/capture/capture-hint'
import { CAPTURE_OPEN_EVENT } from '@/features/capture/capture-host'
import { useDb } from '@/lib/db-client'
import { useCanvases } from '@/lib/canvas-store'
import { workbenchStore } from '@/lib/workbench-store'

export default function HomePage() {
  const { t } = useI18n()
  const { snap, service, ready } = useDb()
  const { snapshot: canvasSnapshot } = useCanvases()
  // 平台检测放 useEffect(navigator/window 客户端才有)。pre-mount 默认 false,
  // 让 SSG 构建期 HTML 与客户端首帧一致 —— 否则 hydration mismatch,dev 弹错误遮罩。
  const [isMac, setIsMac] = useState(false)
  const [desktop, setDesktop] = useState(false)
  useEffect(() => {
    setIsMac(detectIsMac())
    setDesktop(isDesktop())
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
    <main id="main" tabIndex={-1} className="home">
      <CaptureHint />
      <header className="home__bar" aria-hidden="true" />
      <section className="home__content">
        <p className="home__eyebrow">{t('home.eyebrow')}</p>
        <h1 className="home__title">
          cy&rsquo;s <span className="home__title-accent">Stift</span>
        </h1>
        <p className="home__lede">{t('home.tagline')}</p>
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
            <h2 id="home-continue-title">{t('home.continue')}</h2>
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
          {/* Version:单一可信源 = root package.json "version",由
              scripts/gen-version.mjs 在 prebuild 时写入 lib/version.ts。
              静态导出无 server,这里只 import build-time 常量。 */}
          <span>v{VERSION}</span>
        </footer>
      </section>
      <style>{`
        .home {
          min-height: 100vh;
          display: grid;
          grid-template-rows: 8px 1fr;
        }
        .home__bar {
          background: var(--color-red);
        }
        .home__content {
          padding: var(--space-8) var(--space-10);
          max-width: 960px;
          display: flex;
          flex-direction: column;
          gap: var(--space-6);
        }
        .home__eyebrow {
          margin: 0;
          font-family: var(--font-mono);
          font-size: var(--font-size-sm);
          text-transform: uppercase;
          letter-spacing: 0.16em;
          color: var(--color-gray);
        }
        .home__title {
          margin: 0;
          font-family: var(--font-display);
          font-weight: 500;
          font-size: var(--font-size-3xl);
          line-height: 1;
          letter-spacing: -0.02em;
        }
        .home__title-accent {
          color: var(--color-red);
        }
        .home__lede {
          margin: 0;
          font-family: var(--font-display);
          font-size: var(--font-size-xl);
          color: var(--color-black-soft);
        }
        .home__quick-actions { display: grid; grid-template-columns: minmax(0, 2fr) minmax(140px, 1fr); gap: var(--space-2); }
        .home__inbox-action { display: flex; min-height: 72px; align-items: center; justify-content: center; gap: var(--space-2); border: var(--border-thick); color: var(--color-black); text-decoration: none; font-family: var(--font-display); font-size: var(--font-size-lg); }
        .home__inbox-action:hover { background: var(--color-yellow); }
        .home__inbox-action:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
        .home__continue { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr); gap: var(--space-3); border-top: var(--border-thick); padding-top: var(--space-3); }
        .home__section-head { grid-column: 1 / -1; display: flex; align-items: baseline; justify-content: space-between; }
        .home__section-head h2 { margin: 0; font-family: var(--font-display); font-size: var(--font-size-xl); }
        .home__section-head a { color: var(--color-black); font-family: var(--font-mono); font-size: var(--font-size-xs); }
        .home__current, .home__recent { min-width: 0; }
        .home__current > span, .home__recent > span { display: block; margin-bottom: var(--space-1); font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-gray); text-transform: uppercase; }
        .home__current a, .home__recent a { display: flex; min-height: 44px; align-items: center; justify-content: space-between; gap: var(--space-2); color: var(--color-black); text-decoration: none; border-bottom: var(--border-hairline); }
        .home__current small, .home__recent small { color: var(--color-gray); font-family: var(--font-mono); font-size: var(--font-size-xs); }
        .home__recent ul { margin: 0; padding: 0; list-style: none; }
        .home__recent p { color: var(--color-gray); }
        @media (max-width: 640px) { .home__continue { grid-template-columns: 1fr; } .home__section-head { grid-column: 1; } }
        .home__foot {
          margin-top: auto;
          padding-top: var(--space-8);
          display: flex;
          justify-content: space-between;
          font-family: var(--font-mono);
          font-size: var(--font-size-xs);
          color: var(--color-gray);
          border-top: var(--border-hairline);
        }
        /* Secondary text-link row: low-emphasis mono links to Search /
           Trash / Settings so a user landing on / can reach them without
           opening the AppMenu. Bauhaus-restrained: gray, hairline, mono. */
        .home__secondary {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          font-family: var(--font-mono);
          font-size: var(--font-size-xs);
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--color-gray);
        }
        .home__secondary-link {
          color: var(--color-gray);
          text-decoration: none;
          border-bottom: var(--border-hairline);
          padding-bottom: 1px;
          transition: color 80ms ease-out;
        }
        .home__secondary-link:hover { color: var(--color-black); }
.home__secondary-link:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
        .home__secondary-sep { color: var(--color-gray); }
        .home__nav { margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-3); }
        .home__nav-link--canvas .home__nav-arrow { background: var(--color-black); }
        .home__nav-link--canvas:hover { box-shadow: 4px 4px 0 0 var(--color-black); }
        .home__nav-link--archive .home__nav-arrow { background: var(--color-blue); }
        .home__nav-link--archive:hover { box-shadow: 4px 4px 0 0 var(--color-blue); }
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
          background: var(--color-red);
          color: var(--color-white);
          border: var(--border-thick);
          border-color: var(--color-black);
          border-radius: var(--radius-sm);
          box-shadow: var(--shadow-md);
          cursor: pointer;
          text-align: left;
          font: inherit;
        }
        .home__capture:hover { box-shadow: 4px 4px 0 0 var(--color-black); }
        .home__capture:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
        .home__capture-arrow {
          display: inline-flex; align-items: center; justify-content: center;
          width: 48px; height: 48px;
          background: var(--color-white);
          color: var(--color-red);
          font-family: var(--font-mono);
          font-size: var(--font-size-2xl);
          font-weight: 700;
        }
        .home__capture-label {
          font-family: var(--font-display);
          font-size: var(--font-size-2xl);
          font-weight: 500;
          letter-spacing: -0.01em;
          color: var(--color-white);
        }
        .home__capture-note {
          font-family: var(--font-mono);
          font-size: var(--font-size-xs);
          text-transform: uppercase;
          letter-spacing: 0.12em;
          text-align: right;
        }
        @media (max-width: 768px) {
          .home__content { padding: var(--space-6) var(--space-3); gap: var(--space-4); }
          .home__quick-actions { grid-template-columns: 1fr; }
          .home__capture-note { display: block; text-align: left; grid-column: 2; }
          .home__capture { grid-template-columns: 48px 1fr; }
        }
        .home__nav-link {
          display: grid;
          grid-template-columns: 48px auto 1fr;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-3) var(--space-3);
          background: var(--color-white);
          color: var(--color-black);
          text-decoration: none;
          border: var(--border-thick);
          border-radius: var(--radius-sm);
          box-shadow: var(--shadow-md);
          transition: transform 80ms ease-out, box-shadow 80ms ease-out;
        }
        .home__nav-link:hover { box-shadow: 4px 4px 0 0 var(--color-red); }
        .home__nav-link:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
        .home__nav-link:active { transform: translate(2px, 2px); box-shadow: var(--shadow-sm); }
        .home__nav-arrow {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 48px;
          height: 48px;
          background: var(--color-red);
          color: var(--color-white);
          font-family: var(--font-display);
          font-size: var(--font-size-2xl);
          line-height: 1;
        }
        .home__nav-label {
          font-family: var(--font-display);
          font-size: var(--font-size-2xl);
          font-weight: 500;
          letter-spacing: -0.01em;
        }
        .home__nav-note {
          font-family: var(--font-mono);
          font-size: var(--font-size-xs);
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--color-gray);
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
