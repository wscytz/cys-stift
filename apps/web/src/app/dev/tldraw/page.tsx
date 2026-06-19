'use client'

/**
 * /dev/tldraw — Phase 4 spike smoke page.
 *
 * Goal: prove the tldraw v3 + React 19 + Next.js `output: 'export'` stack
 * actually mounts and renders at runtime (spec §12 risk #1). Not the real
 * /canvas feature — this is an isolated dev smoke page, same convention as
 * /dev/db and /dev/min.
 *
 * The dynamic import() lives inside useEffect so tldraw's module-level code
 * (which touches `window`) never runs during the static-export prerender — it
 * only loads in the browser after mount.
 */

import { useEffect, useState } from 'react'
// CSS is side-effect only (no JS, no window access) — safe to load eagerly.
// Bundled by Next; resolved via the package's `exports[./tldraw.css]`.
import '@tldraw/tldraw/tldraw.css'

type TldrawCmp = React.ComponentType<Record<string, unknown>>

export default function DevTldrawPage() {
  const [mounted, setMounted] = useState(false)
  const [Tldraw, setTldraw] = useState<TldrawCmp | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
    import('@tldraw/tldraw')
      .then((mod) => {
        setTldraw(() => mod.Tldraw as TldrawCmp)
      })
      .catch((e: unknown) => {
        setErr(e instanceof Error ? e.message : String(e))
      })
  }, [])

  return (
    <main className="page">
      <div className="bar" aria-hidden="true" />
      <div className="wrap">
        {!mounted ? (
          <p className="state">prerendered shell (server snapshot)</p>
        ) : err ? (
          <p className="state state--err">tldraw load error: {err}</p>
        ) : Tldraw ? (
          <Tldraw />
        ) : (
          <p className="state">loading tldraw…</p>
        )}
      </div>

      <style>{styles}</style>
    </main>
  )
}

const styles = `
.page { position: fixed; inset: 0; background: var(--color-white); display: flex; flex-direction: column; }
.bar { height: 8px; background: var(--color-black); flex-shrink: 0; }
.wrap { position: relative; flex: 1; min-height: 0; }
.state { position: absolute; inset: 0; display: grid; place-items: center; font-family: var(--font-mono); font-size: var(--font-size-sm); color: var(--color-gray); }
.state--err { color: var(--color-red); }
`
