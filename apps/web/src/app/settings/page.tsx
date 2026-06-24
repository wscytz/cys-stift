'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Toolbar, Modal, Button } from '@cys-stift/ui'
import { settingsStore, useSettings } from '@/lib/settings-store'
import { rehydrateCards } from '@/lib/db-client'
import { useI18n } from '@/lib/i18n'
import { StorageMeter } from '@/components/storage-meter'
import { AISettingsPanel } from '@/features/settings/ai-settings-panel'
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
  const { t, locale, setLocale } = useI18n()
  const { settings, ready } = useSettings()
  const sc = settings.captureShortcut
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)

  // 选文件后先弹确认门(覆盖不可撤销),确认后才真正导入。
  const handleImportFile = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]
    if (!file) return
    setPendingFile(file)
  }

  const confirmImport = () => {
    const file = pendingFile
    setPendingFile(null)
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      const result = await importFromJson(String(reader.result))
      setImportResult(result)
      if (result.ok) {
        // Re-sync the in-memory card store from the freshly written
        // localStorage BEFORE the reload. Without this, any in-tab mutation
        // during the reload window would call persist() and overwrite the
        // imported cards with the stale pre-import list (silent data loss —
        // the cross-tab 'storage' event doesn't fire in the same tab).
        rehydrateCards()
        // Reload so media/draft/settings stores (which keep their own
        // in-memory cache) also re-hydrate from disk.
        setTimeout(() => window.location.reload(), 400)
      }
    }
    reader.onerror = () =>
      setImportResult({ ok: false, cards: 0, mediaAssets: 0, error: t('settings.importReadFailed') })
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
    <main className="page" role="main">
      <Toolbar region="system">
        <span className="crumb">{t('brand.name')}</span>
        <span className="crumb-sep">/</span>
        <span className="crumb crumb--here">{t('settings.crumb')}</span>
        <span className="crumb-spacer" />
      </Toolbar>

      <div className="page-content">
        <StorageMeter />
        <section className="section">
          <h2 className="section__h">{t('settings.language')}</h2>
          <p className="section__lede">{t('settings.languageLede')}</p>
          <div className="field-row">
            <label className="mono-label">{t('settings.language')}</label>
            <select
              className="set__select"
              value={locale}
              onChange={(e) => setLocale(e.target.value as 'zh' | 'en')}
            >
              <option value="zh">{t('settings.languageZh')}</option>
              <option value="en">{t('settings.languageEn')}</option>
            </select>
          </div>
        </section>

        <section className="section">
          <h2 className="section__h">{t('settings.appearance')}</h2>
          <p className="section__lede">{t('settings.appearanceLede')}</p>
          <div className="field-row">
            <label className="mono-label">{t('settings.theme')}</label>
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

        <section className="section">
          <h2 className="section__h">{t('settings.captureShortcut')}</h2>
          <p className="section__lede">{t('settings.captureShortcutLede')}</p>
          <div className="field-row">
            <label className="mono-label">{t('settings.modifier')}</label>
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
          <div className="field-row">
            <label className="mono-label">{t('settings.shift')}</label>
            <input
              type="checkbox"
              checked={sc.shift}
              onChange={(e) =>
                settingsStore.updateCaptureShortcut({ shift: e.target.checked })
              }
            />
          </div>
          <div className="field-row">
            <label className="mono-label">{t('settings.key')}</label>
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
          <p className="mono">
            {t('settings.current')}:{' '}
            <code className="set__current-code">
              {(sc.modKey === 'meta' ? '⌘' : 'Ctrl') +
                (sc.shift ? '+⇧' : '') +
                '+' +
                labelFor(sc.code)}
            </code>{' '}
            {ready ? '' : t('settings.currentSuffix')}
          </p>
          <p className="mono mono--xs">{t('settings.captureHint')}</p>
        </section>

        <AISettingsPanel />

        <section className="section">
          <h2 className="section__h">{t('settings.data')}</h2>
          <p className="section__lede">{t('settings.dataLede')}</p>
          <button
            type="button"
            className="btn-primary"
            onClick={async () => {
              const bytes = await downloadExport()
              const payload = await buildExportPayload()
              console.info(
                `[export] ${bytes} bytes · ` +
                  `${payload.cards.length} cards`,
              )
            }}
          >
            {t('settings.exportJson')}
          </button>
          <div className="set__import">
            <label className="mono-label">
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
            <p className="mono mono--xs">{t('settings.importHint')}</p>
            {importResult && (
              <p
                className={`mono mono--xs ${
                  importResult.ok ? '' : 'set__import-result--error'
                }`}
              >
                {importResult.ok
                  ? t('settings.importOk', {
                      cards: importResult.cards,
                      mediaAssets: importResult.mediaAssets,
                      canvases: importResult.canvases ?? 0,
                      freeform: importResult.freeformCanvases ?? 0,
                    })
                  : t('settings.importFail', { error: importResult.error ?? '' })}
              </p>
            )}
          </div>
        </section>

        <footer className="footnote">
          <Link href="/" className="footnote__link">← {t('common.home')}</Link>
          {' · '}
          <Link href="/inbox" className="footnote__link">{t('nav.inbox')}</Link>
        </footer>
      </div>

      <Modal
        open={pendingFile !== null}
        onClose={() => setPendingFile(null)}
        title={t('settings.importConfirmTitle')}
      >
        <p className="set__confirm-body">{t('settings.importConfirmBody')}</p>
        <div className="set__confirm-actions">
          <Button variant="ghost" onClick={() => setPendingFile(null)}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={confirmImport}>
            {t('settings.importJson')}
          </Button>
        </div>
      </Modal>

      <style>{`
.page { min-height: 100vh; background: var(--color-white); color: var(--color-black); }
.set__select { font-family: var(--font-body); font-size: var(--font-size-base); padding: var(--space-1) var(--space-2); border: var(--border-hairline); border-radius: var(--radius-sm); background: var(--color-white); color: var(--color-black); }
.set__current-code { background: var(--color-gray-soft); padding: 2px var(--space-1); border-radius: 2px; }
.set__import { margin-top: var(--space-2); display: flex; flex-direction: column; gap: var(--space-1); }
.set__file { margin-top: var(--space-1); font-family: var(--font-body); font-size: var(--font-size-sm); }
.set__import-result--error { color: var(--color-red); }
.set__confirm-body { margin: 0 0 var(--space-3); font-family: var(--font-body); font-size: var(--font-size-sm); color: var(--color-black-soft); line-height: 1.5; }
.set__confirm-actions { display: flex; gap: var(--space-2); justify-content: flex-end; }
`}</style>
    </main>
  )
}
