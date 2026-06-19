'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CAPTURE_OPEN_EVENT } from '@/features/capture/capture-host'

/**
 * AppMenu — global top menu bar (Phase 6.5g). Four entries across every
 * route: Inbox / Canvas / Archive / Capture. The Capture entry dispatches
 * a CustomEvent so CaptureHost opens the Mini Input (one source of truth
 * for the global open state — no shared store, no event bus library).
 *
 * Visual: compact horizontal bar under a neutral 4px gray stripe. Does
 * not compete with region toolbars (inbox/canvas/archive keep their own
 * coloured 8px stripe inside the page).
 */
export function AppMenu() {
  const pathname = usePathname() ?? '/'

  const onCaptureClick = () => {
    window.dispatchEvent(new CustomEvent(CAPTURE_OPEN_EVENT))
  }

  const entries: { href: string; label: string; key: string }[] = [
    { href: '/inbox', label: 'Inbox', key: 'inbox' },
    { href: '/canvas', label: 'Canvas', key: 'canvas' },
    { href: '/archive', label: 'Archive', key: 'archive' },
  ]

  const activeKey = entries.find((e) => pathname.startsWith(e.href))?.key

  return (
    <nav className="app-menu" aria-label="Primary">
      <span className="app-menu__bar" aria-hidden="true" />
      <Link href="/" className="app-menu__brand">
        cy&rsquo;s stift
      </Link>
      <span className="app-menu__sep" aria-hidden="true">/</span>
      <div className="app-menu__entries">
        {entries.map((e) => (
          <Link
            key={e.key}
            href={e.href}
            className={`app-menu__link ${activeKey === e.key ? 'app-menu__link--active' : ''}`}
          >
            {e.label}
          </Link>
        ))}
      </div>
      <span className="app-menu__spacer" />
      <button type="button" className="app-menu__capture" onClick={onCaptureClick}>
        Capture
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
  display: none;
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
