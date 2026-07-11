'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Toolbar, Modal, Button } from '@cys-stift/ui'
import { settingsStore, useSettings } from '@/lib/settings-store'
import { rehydrateCards } from '@/lib/db-client'
import { useI18n } from '@/lib/i18n'
import { useIsDesktop } from '@/lib/use-platform'
import { pushToast } from '@/lib/toast-store'
import { StorageMeter } from '@/components/storage-meter'
import { AISettingsPanel } from '@/features/settings/ai-settings-panel'
import { SampleExportPanel } from '@/features/settings/sample-export-panel'
import { LabToggle } from '@/features/ai/lab-toggle'
import { LAB_REGISTRY } from '@/features/ai/labs-registry'
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
  // isDesktop 走 hook(非 render 直读):SSG 期 isDesktop=true、安卓客户端首帧
  // =false,直读会 hydration mismatch(capture 快捷键配置段闪现又消失)。pre-mount
  // =true 与 SSG 一致;移动端整段隐藏(无系统全局热键概念)。
  const isDesktopVal = useIsDesktop()
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

  const formatBytes = (b: number): string => {
    if (b < 1024) return `${b} B`
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
    return `${(b / 1024 / 1024).toFixed(1)} MB`
  }

  return (
    <main id="main" tabIndex={-1} className="page">
      <Toolbar region="system">
        <span className="crumb">{t('brand.name')}</span>
        <span className="crumb-sep">/</span>
        <h1 className="crumb crumb--here">{t('settings.crumb')}</h1>
        <span className="crumb-spacer" />
      </Toolbar>

      <div className="page-content">
        <StorageMeter />
        <section className="section">
          <h2 className="section__h">{t('settings.language')}</h2>
          <p className="section__lede">{t('settings.languageLede')}</p>
          <div className="field-row">
            <label className="mono-label" htmlFor="set-lang">{t('settings.language')}</label>
            <select
              id="set-lang"
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
          <h2 className="section__h">{t('settings.cardDisplay')}</h2>
          <p className="section__lede">{t('settings.cardDisplayLede')}</p>
          <div className="field-row">
            <label className="mono-label" htmlFor="set-card-display">{t('settings.cardDisplay')}</label>
            <select
              id="set-card-display"
              className="set__select"
              value={settings.cardDisplayMode ?? 'compact'}
              onChange={(e) =>
                settingsStore.updateCardDisplayMode(
                  e.target.value as 'compact' | 'auto' | 'title' | 'subtitle',
                )
              }
            >
              <option value="compact">{t('settings.cardDisplayCompact')}</option>
              <option value="auto">{t('settings.cardDisplayAuto')}</option>
              <option value="title">{t('settings.cardDisplayTitle')}</option>
              <option value="subtitle">{t('settings.cardDisplaySubtitle')}</option>
            </select>
          </div>
        </section>

        {isDesktopVal && (
        <section className="section">
          <h2 className="section__h">{t('settings.captureShortcut')}</h2>
          <p className="section__lede">{t('settings.captureShortcutLede')}</p>
          <div className="field-row">
            <label className="mono-label" htmlFor="set-mod">{t('settings.modifier')}</label>
            <select
              id="set-mod"
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
            <label className="mono-label" htmlFor="set-shift">{t('settings.shift')}</label>
            <input
              id="set-shift"
              type="checkbox"
              checked={sc.shift}
              onChange={(e) =>
                settingsStore.updateCaptureShortcut({ shift: e.target.checked })
              }
            />
          </div>
          <div className="field-row">
            <label className="mono-label" htmlFor="set-key">{t('settings.key')}</label>
            <select
              id="set-key"
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
        )}

        <AISettingsPanel />

        <SampleExportPanel />

        {/* 实验室 / Labs — 附加能力,默认全关。开启 = 用户显式接受附加风险。
            从 LAB_REGISTRY 渲染;每个 lab 走确认门(不可撤销风险让步);关闭直接生效。
            分层判据见 docs/specs/2026-06-30-ai-labs-strategy.md。 */}
        <section className="section section--labs">
          <h2 className="section__h">{t('settings.labs.title')}</h2>
          <p className="section__lede">{t('settings.labs.lede')}</p>
          {LAB_REGISTRY.map((meta) => (
            <LabToggle
              key={meta.id}
              lab={meta.id}
              enabled={settings.labs?.[meta.id] ?? false}
            />
          ))}
        </section>

        <section className="section">
          <h2 className="section__h">{t('settings.data')}</h2>
          <p className="section__lede">{t('settings.dataLede')}</p>
          <label
            className="mono-label set__export-include"
            style={{ display: 'block', marginBottom: 'var(--space-2)' }}
          >
            <input
              type="checkbox"
              checked={settings.export?.includeDeleted ?? true}
              onChange={(e) => {
                const cur = settings.export?.includeDeleted ?? true
                // Only persist on actual change (matches update* no-op guards).
                if (cur === e.target.checked) return
                settingsStore.update({
                  export: { includeDeleted: e.target.checked },
                })
              }}
            />
            {t('settings.exportIncludeDeleted')}
          </label>
          <Button
            variant="primary"
            type="button"
            onClick={async () => {
              try {
                const includeDeleted = settings.export?.includeDeleted ?? true
                const bytes = await downloadExport({ includeDeleted })
                const payload = await buildExportPayload({ includeDeleted })
                const live = payload.cards.filter(
                  (c) => !c.archived && !c.deletedAt,
                ).length
                if (includeDeleted) {
                  pushToast({
                    kind: 'success',
                    message: t('settings.exportOk', {
                      cards: String(payload.cards.length),
                      bytes: formatBytes(bytes),
                    }),
                  })
                } else {
                  pushToast({
                    kind: 'success',
                    message: t('settings.exportOkFiltered', {
                      live: String(live),
                      excluded: String(payload.cards.length - live),
                      bytes: formatBytes(bytes),
                    }),
                  })
                }
              } catch (e) {
                pushToast({ kind: 'error', message: t('settings.exportFail', { error: (e as Error).message }) })
              }
            }}
          >
            {t('settings.exportJson')}
          </Button>
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
                role={importResult.ok === false ? 'alert' : 'status'}
              >
                {importResult.ok
                  ? t('settings.importOk', {
                      cards: importResult.cards,
                      mediaAssets: importResult.mediaAssets,
                      canvases: importResult.canvases ?? 0,
                      freeform: importResult.freeformCanvases ?? 0,
                    }) +
                    (importResult.freeformSkipped && importResult.freeformSkipped > 0
                      ? t('settings.importFreeformSkipped', {
                          n: importResult.freeformSkipped,
                        })
                      : '')
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
        closeLabel={t('common.close')}
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
.set__select {
  appearance: none; -webkit-appearance: none;
  font-family: var(--font-body); font-size: var(--font-size-base);
  padding: var(--space-1) var(--space-6) var(--space-1) var(--space-2);
  border: var(--border-hairline); border-radius: var(--radius-sm);
  background: var(--color-white); color: var(--color-black);
  background-image: linear-gradient(45deg, transparent 50%, var(--color-gray) 50%),
    linear-gradient(135deg, var(--color-gray) 50%, transparent 50%);
  background-position: calc(100% - 14px) calc(50% - 2px), calc(100% - 10px) calc(50% - 2px);
  background-size: 4px 4px, 4px 4px; background-repeat: no-repeat;
}
.set__current-code { background: var(--color-gray-soft); padding: 2px var(--space-1); border-radius: var(--radius-sm); }
.set__import { margin-top: var(--space-2); display: flex; flex-direction: column; gap: var(--space-1); }
.set__file { margin-top: var(--space-1); font-family: var(--font-body); font-size: var(--font-size-sm); }
.set__import-result--error { color: var(--color-red); }
.set__confirm-body { margin: 0 0 var(--space-3); font-family: var(--font-body); font-size: var(--font-size-sm); color: var(--color-black-soft); line-height: 1.5; }
.set__confirm-actions { display: flex; gap: var(--space-2); justify-content: flex-end; }
/* 实验室区:红色左边框 + 警告底色,视觉上区别于普通设置区(暗示附加风险)。 */
.section--labs { border-left: 3px solid var(--color-red); padding-left: var(--space-3); background: var(--color-red-soft); padding-top: var(--space-3); padding-bottom: var(--space-3); padding-right: var(--space-3); border-radius: 0 var(--radius-sm) var(--radius-sm) 0; }
.set__lab-item { display: flex; gap: var(--space-2); align-items: flex-start; }
.set__lab-warn { display: block; margin-top: 2px; color: var(--color-red); }
`}</style>
    </main>
  )
}
