/**
 * cy's Stift — Phase 0 placeholder.
 * A Bauhaus-styled hello page so we can verify tokens, fonts and the 8px grid
 * are wired before any real features land. See spec §5.
 */
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
        <footer className="home__foot">
          <span>phase 0 · v0.1.0</span>
          <span>no business logic yet — scaffold only</span>
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
      `}</style>
    </main>
  )
}
