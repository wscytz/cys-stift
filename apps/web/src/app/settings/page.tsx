'use client'

import Link from 'next/link'
import { Toolbar } from '@cys-stift/ui'
import { settingsStore, useSettings } from '@/lib/settings-store'
import { buildExportPayload, downloadExport } from '@/lib/export-service'

/**
 * /settings — spec §5.5 "可在设置改". MVP exposes only the capture
 * shortcut (modifier + shift + key). Saved to web-local localStorage;
 * CaptureHost reads it live. Canvas shortcuts (+ - 0 1 g) and recording
 * UI are post-MVP.
 */
export default function SettingsPage() {
  const { settings, ready } = useSettings()
  const sc = settings.captureShortcut

  const labelFor = (code: string) => {
    if (code === 'Space') return 'Space'
    if (code.startsWith('Key')) return code.slice(3)
    if (code.startsWith('Digit')) return code.slice(5)
    return code
  }

  return (
    <main className="page">
      <Toolbar region="system">
        <span className="crumb">cy&rsquo;s stift</span>
        <span className="crumb-sep">/</span>
        <span className="crumb crumb--here">settings</span>
      </Toolbar>

      <div className="content">
        <section className="set">
          <h2 className="set__h">Capture shortcut</h2>
          <p className="set__lede">
            Press this combo anywhere (outside an input) to open the Mini
            Input. Changes apply immediately.
          </p>

          <div className="set__row">
            <label className="set__label">Modifier</label>
            <select
              className="set__select"
              value={sc.modKey}
              onChange={(e) =>
                settingsStore.updateCaptureShortcut({
                  modKey: e.target.value as 'meta' | 'ctrl',
                })
              }
            >
              <option value="meta">⌘ Cmd (mac)</option>
              <option value="ctrl">Ctrl (win)</option>
            </select>
          </div>

          <div className="set__row">
            <label className="set__label">Shift</label>
            <input
              type="checkbox"
              checked={sc.shift}
              onChange={(e) =>
                settingsStore.updateCaptureShortcut({ shift: e.target.checked })
              }
            />
          </div>

          <div className="set__row">
            <label className="set__label">Key</label>
            <select
              className="set__select"
              value={sc.code}
              onChange={(e) =>
                settingsStore.updateCaptureShortcut({ code: e.target.value })
              }
            >
              {['Space', 'KeyC', 'KeyN', 'KeyI', 'Comma', 'Period'].map((c) => (
                <option key={c} value={c}>
                  {labelFor(c)}
                </option>
              ))}
            </select>
          </div>

          <p className="set__current">
            Current:{' '}
            <code>
              {(sc.modKey === 'meta' ? '⌘' : 'Ctrl') +
                (sc.shift ? '+⇧' : '') +
                '+' +
                labelFor(sc.code)}
            </code>{' '}
            {ready ? '' : '(loading…)'}
          </p>

          <p className="set__hint">
            Note: on macOS, ⌘+⇧+Space may be captured by Spotlight at the OS
            level. The shortcut still works inside the browser. Recording UI
            and conflict detection are post-MVP.
          </p>
        </section>

        <section className="set">
          <h2 className="set__h">Data</h2>
          <p className="set__lede">
            Your data lives only on this machine. Export an open-format
            JSON backup any time — cards, media, drafts, and settings.
            (spec §1.2 — data is portable, no lock-in.)
          </p>
          <button
            type="button"
            className="set__export"
            onClick={() => {
              const bytes = downloadExport()
              console.info(
                `[export] ${bytes} bytes · ` +
                  `${buildExportPayload().cards.length} cards`,
              )
            }}
          >
            Export JSON
          </button>
        </section>

        <p className="footnote">
          <Link href="/" className="footnote__link">← home</Link>
          {' · '}
          <Link href="/inbox" className="footnote__link">inbox</Link>
        </p>
      </div>

      <style>{styles}</style>
    </main>
  )
}

const styles = `
.page { min-height: 100vh; background: var(--color-white); color: var(--color-black); }
.crumb { font-family: var(--font-mono); font-size: var(--font-size-sm); text-transform: uppercase; letter-spacing: 0.12em; color: var(--color-gray); }
.crumb--here { color: var(--color-black); }
.crumb-sep { color: var(--color-gray); }
.content { max-width: 720px; margin: 0 auto; padding: var(--space-5) var(--space-4); display: flex; flex-direction: column; gap: var(--space-4); }
.set { display: flex; flex-direction: column; gap: var(--space-3); }
.set__h { margin: 0; font-family: var(--font-display); font-size: var(--font-size-xl); font-weight: 500; letter-spacing: -0.01em; }
.set__lede { margin: 0; color: var(--color-black-soft); font-size: var(--font-size-base); line-height: 1.6; max-width: 60ch; }
.set__row { display: grid; grid-template-columns: 120px 1fr; align-items: center; gap: var(--space-3); }
.set__label { font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.12em; color: var(--color-gray); }
.set__select { font-family: var(--font-body); font-size: var(--font-size-base); padding: var(--space-1) var(--space-2); border: var(--border-hairline); border-radius: var(--radius-sm); background: var(--color-white); color: var(--color-black); }
.set__current { margin: 0; font-family: var(--font-mono); font-size: var(--font-size-sm); color: var(--color-black-soft); }
.set__current code { background: var(--color-gray-soft); padding: 2px var(--space-1); border-radius: 2px; }
.set__hint { margin: 0; font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-gray); line-height: 1.6; }
.set__export {
  align-self: flex-start;
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  background: var(--color-black);
  color: var(--color-white);
  border: var(--border-hairline);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.set__export:hover { box-shadow: 2px 2px 0 0 var(--color-red); }
.set__export:active { transform: translate(1px, 1px); box-shadow: none; }
.footnote { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-gray); margin: 0; padding-top: var(--space-2); border-top: var(--border-hairline); }
.footnote__link { color: var(--color-blue); text-decoration: underline; text-underline-offset: 2px; }
`
