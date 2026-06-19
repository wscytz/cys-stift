/**
 * cy's Stift — Phase 0 placeholder.
 * A Bauhaus-styled hello page so we can verify tokens, fonts and the 8px grid
 * are wired before any real features land. See spec §5.
 */
import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="home">
      <header className="home__bar" aria-hidden="true" />
      <section className="home__content">
        <p className="home__eyebrow">phase 0 · scaffold</p>
        <h1 className="home__title">
          cy&rsquo;s <span className="home__title-accent">Stift</span>
        </h1>
        <p className="home__lede">灵感 3 秒记，画布上慢慢养。</p>
        <dl className="home__meta">
          <div>
            <dt>local-first</dt>
            <dd>data lives on your machine</dd>
          </div>
          <div>
            <dt>form follows function</dt>
            <dd>Bauhaus restraint, geometric grid</dd>
          </div>
          <div>
            <dt>feature-sliced</dt>
            <dd>each capability is an interface</dd>
          </div>
        </dl>
        <nav className="home__nav" aria-label="Primary">
          <Link href="/inbox" className="home__nav-link">
            <span className="home__nav-arrow" aria-hidden="true">→</span>
            <span className="home__nav-label">Inbox</span>
            <span className="home__nav-note">收件箱 · 创建 / 编辑 / 归档卡片</span>
          </Link>
          <Link href="/canvas" className="home__nav-link home__nav-link--canvas">
            <span className="home__nav-arrow" aria-hidden="true">→</span>
            <span className="home__nav-label">Canvas</span>
            <span className="home__nav-note">画布 · 把卡片摆开慢慢养</span>
          </Link>
        </nav>
        <footer className="home__foot">
          <span>phase 4 · canvas</span>
          <span>v0.5.0</span>
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
        .home__nav { margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-3); }
        .home__nav-link--canvas .home__nav-arrow { background: var(--color-black); }
        .home__nav-link--canvas:hover { box-shadow: 4px 4px 0 0 var(--color-black); }
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
