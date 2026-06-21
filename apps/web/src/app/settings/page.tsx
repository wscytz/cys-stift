'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Toolbar } from '@cys-stift/ui'
import { settingsStore, useSettings } from '@/lib/settings-store'
import { useI18n } from '@/lib/i18n'
import { StorageMeter } from '@/components/storage-meter'
import {
  buildExportPayload,
  downloadExport,
  importFromJson,
  type ImportResult,
} from '@/lib/export-service'

/**
 * /settings — spec §5.5 "可在设置改". MVP exposes only the capture
 * shortcut (modifier + shift + key). Saved to web-local localStorage;
 * CaptureHost reads it live. Canvas shortcuts (+ - 0 1 g) and recording
 * UI are post-MVP.
 */
export default function SettingsPage() {
  const { t } = useI18n()
  const { settings, ready } = useSettings()
  const sc = settings.captureShortcut
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  const handleImportFile = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = importFromJson(String(reader.result))
      setImportResult(result)
      if (result.ok) {
        // Give the state a tick to render, then reload so all stores
        // re-hydrate from the freshly written localStorage.
        setTimeout(() => window.location.reload(), 800)
      }
    }
    reader.onerror = () =>
      setImportResult({ ok: false, cards: 0, mediaAssets: 0, error: 'read failed' })
    reader.readAsText(file)
  }

  const labelFor = (code: string) => {
    if (code === 'Space') return t('settings.key.space')
    if (code === 'Comma') return t('settings.key.comma')
    if (code === 'Period') return t('settings.key.period')
    if (code.startsWith('Key')) return code.slice(3)
    if (code.startsWith('Digit')) return code.slice(5)
    return code
  }

  return (
    <main className="page">
      <Toolbar region="system">
        <span className="crumb">cy&rsquo;s stift</span>
        <span className="crumb-sep">/</span>
        <span className="crumb crumb--here">{t('settings.crumb')}</span>
      </Toolbar>

      <div className="content">
        <StorageMeter />
        <section className="set">
          <h2 className="set__h">{t('settings.language')}</h2>
          <p className="set__lede">{t('settings.languageLede')}</p>
          <div className="set__row">
            <label className="set__label">{t('settings.language')}</label>
            <select
              className="set__select"
              value={settings.locale}
              onChange={(e) =>
                settingsStore.updateLocale(e.target.value as 'zh' | 'en')
              }
            >
              <option value="zh">{t('settings.languageZh')}</option>
              <option value="en">{t('settings.languageEn')}</option>
            </select>
          </div>
        </section>

        <section className="set">
          <h2 className="set__h">{t('settings.appearance')}</h2>
          <p className="set__lede">{t('settings.appearanceLede')}</p>
          <div className="set__row">
            <label className="set__label">{t('settings.theme')}</label>
            <select
              className="set__select"
              value={settings.theme}
              onChange={(e) =>
                settingsStore.updateTheme(
                  e.target.value as 'light' | 'dark' | 'system',
                )
              }
            >
              <option value="system">{t('settings.themeSystem')}</option>
              <option value="light">{t('settings.themeLight')}</option>
              <option value="dark">{t('settings.themeDark')}</option>
            </select>
          </div>
        </section>

        <section className="set">
          <h2 className="set__h">{t('settings.captureShortcut')}</h2>
          <p className="set__lede">{t('settings.captureShortcutLede')}</p>
          <div className="set__row">
            <label className="set__label">{t('settings.modifier')}</label>
            <select
              className="set__select"
              value={sc.modKey}
              onChange={(e) =>
                settingsStore.updateCaptureShortcut({
                  modKey: e.target.value as 'meta' | 'ctrl',
                })
              }
            >
              <option value="meta">{t('settings.modifierMeta')}</option>
              <option value="ctrl">{t('settings.modifierCtrl')}</option>
            </select>
          </div>
          <div className="set__row">
            <label className="set__label">{t('settings.shift')}</label>
            <input
              type="checkbox"
              checked={sc.shift}
              onChange={(e) =>
                settingsStore.updateCaptureShortcut({ shift: e.target.checked })
              }
            />
          </div>
          <div className="set__row">
            <label className="set__label">{t('settings.key')}</label>
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
            {t('settings.current')}:{' '}
            <code>
              {(sc.modKey === 'meta' ? '⌘' : 'Ctrl') +
                (sc.shift ? '+⇧' : '') +
                '+' +
                labelFor(sc.code)}
            </code>{' '}
            {ready ? '' : t('settings.currentSuffix')}
          </p>
          <p className="set__hint">{t('settings.captureHint')}</p>
        </section>

        <section className="set">
          <h2 className="set__h">{t('settings.data')}</h2>
          <p className="set__lede">{t('settings.dataLede')}</p>
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
            {t('settings.exportJson')}
          </button>
          <div className="set__import">
            <label className="set__import-label">
              {t('settings.importJson')}
              <input
                type="file"
                accept="application/json,.json"
                onChange={(e) => {
                  handleImportFile(e.target.files)
                  e.target.value = ''
                }}
                className="set__file"
              />
            </label>
            <p className="set__import-hint">{t('settings.importHint')}</p>
            {importResult && (
              <p
                className={`set__import-result ${
                  importResult.ok ? '' : 'set__import-result--error'
                }`}
              >
                {importResult.ok
                  ? t('settings.importOk', { cards: importResult.cards, mediaAssets: importResult.mediaAssets })
                  : t('settings.importFail', { error: importResult.error ?? '' })}
              </p>
            )}
          </div>
        </section>

        <p className="footnote">
          <Link href="/" className="footnote__link">← {t('common.home')}</Link>
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
.set__lede { margin: 0; color: var(--color-black-soft); font-size: var(--font-size-base); line-height: 1.6; max-width: 60ch; overflow: hidden; }
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
.set__import { margin-top: var(--space-2); display: flex; flex-direction: column; gap: var(--space-1); }
.set__import-label { font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.12em; color: var(--color-gray); cursor: pointer; }
.set__file { margin-top: var(--space-1); font-family: var(--font-body); font-size: var(--font-size-sm); }
.set__import-hint { margin: 0; font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-gray); }
.set__import-result { margin: 0; font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-black-soft); }
.set__import-result--error { color: var(--color-red); }
.footnote { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-gray); margin: 0; padding-top: var(--space-2); border-top: var(--border-hairline); }
.footnote__link { color: var(--color-blue); text-decoration: underline; text-underline-offset: 2px; }
`
