'use client'

/**
 * cy's Stift — Phase 0 + Phase 4 + Phase 6 + Phase 7. A Bauhaus-styled
 * home page so we can verify tokens, fonts and the 8px grid are wired.
 * Phase 6 adds the capture entry hint (Cmd/Ctrl+Shift+Space) — the
 * button itself is decorative; the actual Mini Input is global and
 * launched from anywhere.
 * Phase 7 adds the Archive entry (blue region stripe).
 */
import Link from 'next/link'
import { useI18n } from '@/lib/i18n'
import { isMac as detectIsMac } from '@/lib/platform'
import { CaptureHint } from '@/features/capture/capture-hint'

export default function HomePage() {
  const { t } = useI18n()
  const isMac = detectIsMac()
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
        <dl className="home__meta">
          <div>
            <dt>{t('home.feature.capture.title')}</dt>
            <dd>{t('home.feature.capture.desc')}</dd>
          </div>
          <div>
            <dt>{t('home.feature.inbox.title')}</dt>
            <dd>{t('home.feature.inbox.desc')}</dd>
          </div>
          <div>
            <dt>{t('home.feature.canvas.title')}</dt>
            <dd>{t('home.feature.canvas.desc')}</dd>
          </div>
          <div>
            <dt>{t('home.feature.archive.title')}</dt>
            <dd>{t('home.feature.archive.desc')}</dd>
          </div>
        </dl>
        <nav className="home__nav" aria-label={t('nav.homeNav')}>
          <div className="home__capture" aria-label="Quick capture">
            <div className="home__capture-arrow" aria-hidden="true">{isMac ? '⌘' : '^'}</div>
            <div className="home__capture-label">{t('home.feature.capture.title')}</div>
            <div className="home__capture-note">{isMac ? t('home.hint.mac') : t('home.hint.win')}</div>
          </div>
          <Link href="/inbox" className="home__nav-link">
            <span className="home__nav-arrow" aria-hidden="true">→</span>
            <span className="home__nav-label">{t('home.feature.inbox.title')}</span>
            <span className="home__nav-note">{t('home.feature.inbox.desc')}</span>
          </Link>
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
          <Link href="/search" className="home__secondary-link">{t('nav.search')}</Link>
          <span className="home__secondary-sep" aria-hidden="true">/</span>
          <Link href="/trash" className="home__secondary-link">{t('nav.trash')}</Link>
          <span className="home__secondary-sep" aria-hidden="true">/</span>
          <Link href="/settings" className="home__secondary-link">{t('nav.settings')}</Link>
        </nav>
        <footer className="home__foot">
          <span>{t('home.eyebrow')}</span>
          {/* Version: canonical source is the repo git tags (see docs/STATE.md)
              and root package.json "version". Kept in sync manually here —
              a static export has no build-time version injection without a
              new dependency. Update when bumping the tag. */}
          <span>v0.39.1</span>
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
          padding: var(--space-12) var(--space-10);
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
          font-size: var(--font-size-4xl);
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
        .home__meta {
          margin: var(--space-6) 0 0;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: var(--space-4);
        }
        .home__meta dt {
          font-family: var(--font-mono);
          font-size: var(--font-size-xs);
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--color-gray);
        }
        .home__meta dd {
          margin: var(--space-1) 0 0;
          padding-top: var(--space-1);
          border-top: var(--border-hairline);
          font-family: var(--font-display);
          font-size: var(--font-size-lg);
        }
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
        .home__secondary-sep { color: var(--color-gray); opacity: 0.6; }
        .home__nav { margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-3); }
        .home__nav-link--canvas .home__nav-arrow { background: var(--color-black); }
        .home__nav-link--canvas:hover { box-shadow: 4px 4px 0 0 var(--color-black); }
        .home__nav-link--archive .home__nav-arrow { background: var(--color-blue); }
        .home__nav-link--archive:hover { box-shadow: 4px 4px 0 0 var(--color-blue); }
        /* Capture hint card — decorative. The actual Mini Input is global
           and launches from anywhere via Cmd/Ctrl+Shift+Space. We don't
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
        }
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
        @media (max-width: 720px) {
          .home__capture-note { display: none; }
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
        @media (max-width: 720px) {
          .home__nav-link { grid-template-columns: 48px 1fr; }
          .home__nav-note { grid-column: 1 / -1; text-align: left; }
        }
      `}</style>
    </main>
  )
}
