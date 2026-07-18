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
import { CaptureShortcutSettings } from '@/features/capture/capture-shortcut-settings'
import {
  buildExportPayload,
  downloadExport,
  importFromJson,
  type ImportMode,
  type ImportResult,
} from '@/lib/export-service'

/**
 * /settings — 用户设置页(spec §5.5)。语言 / 卡片显示模式(密度,v0.57.2)/ 捕获快捷键
 * (仅桌面,移动端无系统全局热键)/ AI provider profile(AISettingsPanel)/ AI 样本导出
 * (SampleExportPanel)/ 实验室区(LAB_REGISTRY,默认全关 + 确认门)/ 数据导出导入(JSON 全量备份)。
 * useIsDesktop hook 守捕获快捷键段(防 SSG/安卓首帧 hydration mismatch)。
 */
export default function SettingsPage() {
  const { t, locale, setLocale } = useI18n()
  const { settings, ready } = useSettings()
  // isDesktop 走 hook(非 render 直读):SSG 期 isDesktop=true、安卓客户端首帧
  // =false,直读会 hydration mismatch(capture 快捷键配置段闪现又消失)。pre-mount
  // =true 与 SSG 一致;移动端整段隐藏(无系统全局热键概念)。
  const isDesktopVal = useIsDesktop()
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [pendingImport, setPendingImport] = useState<{
    name: string
    text: string
    summary: ImportResult
  } | null>(null)
  const [importMode, setImportMode] = useState<ImportMode>('replace')
  const [importing, setImporting] = useState(false)

  // 选文件后先弹确认门(覆盖不可撤销),确认后才真正导入。
  const handleImportFile = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]
    if (!file) return
    try {
      const text = await file.text()
      const summary = await importFromJson(text, { mode: 'replace', dryRun: true })
      if (!summary.ok) {
        setImportResult(summary)
        return
      }
      setImportResult(null)
      setImportMode('replace')
      setPendingImport({ name: file.name, text, summary })
    } catch (error) {
      setImportResult({
        ok: false,
        cards: 0,
        mediaAssets: 0,
        error: (error as Error).message || t('settings.importReadFailed'),
      })
    }
  }

  const confirmImport = async () => {
    const pending = pendingImport
    if (!pending || importing) return
    setImporting(true)
    try {
      const result = await importFromJson(pending.text, { mode: importMode })
      setImportResult(result)
      if (result.ok) {
        // Re-sync the in-memory card store from the freshly written
        // localStorage BEFORE the reload. Without this, any in-tab mutation
        // during the reload window would call persist() and overwrite the
        // imported cards with the stale pre-import list (silent data loss —
        // the cross-tab 'storage' event doesn't fire in the same tab).
        rehydrateCards()
        // Reload immediately — no setTimeout delay. importFromJson completes
        // all synchronous localStorage writes (writes[] loop) before resolving,
        // so localStorage is fully consistent at this point. A delayed reload
        // would leave a window where other in-memory stores (settings /
        // canvas-view / drafts) still hold stale caches; any user action in
        // that window would persist() the stale cache and overwrite the just-
        // imported data. Immediate reload forces every store to re-hydrate
        // from the authoritative localStorage with zero window.
        window.location.reload()
      }
    } finally {
      setImporting(false)
      setPendingImport(null)
    }
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
        <nav className="set__index" aria-label={t('settings.sections')}>
          <a href="#settings-data">{t('settings.data')}</a>
          <a href="#settings-capture">{t('settings.capture')}</a>
          <a href="#settings-appearance">{t('settings.appearance')}</a>
          <a href="#settings-ai">{t('settings.ai')}</a>
          <a href="#settings-research">{t('settings.research')}</a>
          <a href="#settings-labs">{t('settings.labs.title')}</a>
        </nav>
        <section className="section" id="settings-data">
          <h2 className="section__h">{t('settings.data')}</h2>
          <p className="section__lede">{t('settings.dataLede')}</p>
          <StorageMeter />
          <label
            className="mono-label set__export-include"
            style={{ display: 'block', marginBottom: 'var(--space-2)' }}
          >
            <input
              type="checkbox"
              checked={settings.export?.includeDeleted ?? true}
              onChange={(e) => {
                const cur = settings.export?.includeDeleted ?? true
                if (cur === e.target.checked) return
                settingsStore.update({ export: { includeDeleted: e.target.checked } })
              }}
            />
            {t('settings.exportIncludeDeleted')}
          </label>
          <Button
            variant="primary"
            type="button"
            className="set__export-btn"
            onClick={async () => {
              try {
                const includeDeleted = settings.export?.includeDeleted ?? true
                const bytes = await downloadExport({ includeDeleted })
                const payload = await buildExportPayload({ includeDeleted })
                const live = payload.cards.filter((c) => !c.archived && !c.deletedAt).length
                pushToast({
                  kind: 'success',
                  message: includeDeleted
                    ? t('settings.exportOk', { cards: String(payload.cards.length), bytes: formatBytes(bytes) })
                    : t('settings.exportOkFiltered', {
                        live: String(live),
                        excluded: String(payload.cards.length - live),
                        bytes: formatBytes(bytes),
                      }),
                })
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
                  void handleImportFile(e.target.files)
                  e.target.value = ''
                }}
                className="set__file"
              />
            </label>
            <p className="mono mono--xs">{t('settings.importHint')}</p>
            {importResult && (
              <p
                className={`mono mono--xs ${importResult.ok ? '' : 'set__import-result--error'}`}
                role={importResult.ok === false ? 'alert' : 'status'}
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

        <div id="settings-capture">
          {isDesktopVal && (
            <CaptureShortcutSettings shortcut={settings.captureShortcut} ready={ready} />
          )}
          {!isDesktopVal && (
            <section className="section">
              <h2 className="section__h">{t('settings.capture')}</h2>
              <p className="section__lede">{t('settings.captureUnavailable')}</p>
            </section>
          )}
        </div>

        <section className="section" id="settings-appearance">
          <h2 className="section__h">{t('settings.appearance')}</h2>
          <h3 className="set__subhead">{t('settings.language')}</h3>
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

        <section className="section" aria-labelledby="settings-card-display-heading">
          <h3 className="set__subhead" id="settings-card-display-heading">{t('settings.cardDisplay')}</h3>
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

        <div id="settings-ai">
        <AISettingsPanel />
        </div>

        <div id="settings-research">
        <SampleExportPanel />
        </div>

        {/* 实验室 / Labs — 附加能力,默认全关。开启 = 用户显式接受附加风险。
            从 LAB_REGISTRY 渲染;每个 lab 走确认门(不可撤销风险让步);关闭直接生效。
            分层判据见 docs/specs/2026-06-30-ai-labs-strategy.md。 */}
        <section className="section section--labs" id="settings-labs">
          <h2 className="section__h">{t('settings.labs.title')}</h2>
          <p className="section__lede">{t('settings.labs.lede')}</p>
          {LAB_REGISTRY.length === 0 && <p className="mono mono--xs">{t('settings.labs.none')}</p>}
          {LAB_REGISTRY.map((meta) => (
            <LabToggle
              key={meta.id}
              lab={meta.id}
              enabled={settings.labs?.[meta.id] ?? false}
            />
          ))}
        </section>

        <footer className="footnote">
          <Link href="/" className="footnote__link">← {t('common.home')}</Link>
          {' · '}
          <Link href="/inbox" className="footnote__link">{t('nav.inbox')}</Link>
        </footer>
      </div>

      <Modal
        open={pendingImport !== null}
        onClose={() => !importing && setPendingImport(null)}
        title={t('settings.importConfirmTitle')}
        closeLabel={t('common.close')}
      >
        <p className="set__confirm-body">{t('settings.importPreflight', {
          file: pendingImport?.name ?? '',
          cards: pendingImport?.summary.cards ?? 0,
          media: pendingImport?.summary.mediaAssets ?? 0,
          canvases: pendingImport?.summary.canvases ?? 0,
        })}</p>
        <div className="set__import-modes" role="radiogroup" aria-label={t('settings.importMode')}>
          <button type="button" role="radio" aria-checked={importMode === 'replace'} className={importMode === 'replace' ? 'set__mode set__mode--active' : 'set__mode'} onClick={() => setImportMode('replace')}>
            <strong>{t('settings.importReplace')}</strong><span>{t('settings.importReplaceHint')}</span>
          </button>
          <button type="button" role="radio" aria-checked={importMode === 'merge'} className={importMode === 'merge' ? 'set__mode set__mode--active' : 'set__mode'} onClick={() => setImportMode('merge')}>
            <strong>{t('settings.importMerge')}</strong><span>{t('settings.importMergeHint')}</span>
          </button>
        </div>
        <div className="set__confirm-actions">
          <Button variant="ghost" onClick={() => setPendingImport(null)} disabled={importing}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={() => void confirmImport()} disabled={importing}>
            {importing ? t('settings.importing') : t('settings.importJson')}
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
  width: 100%; max-width: 100%; min-width: 0; min-height: 44px; box-sizing: border-box;
}
.set__index { position: sticky; top: 0; z-index: 3; display: flex; flex-wrap: wrap; gap: var(--space-1); padding: var(--space-2) 0; background: var(--color-white); border-bottom: var(--border-hairline); }
.set__index a { min-height: 44px; display: inline-flex; align-items: center; padding: 0 var(--space-2); color: var(--color-black); font-family: var(--font-mono); font-size: var(--font-size-xs); text-decoration: none; border: 1px solid var(--color-black); }
.set__subhead { font-family: var(--font-display); font-size: var(--font-size-base); margin: var(--space-2) 0 var(--space-1); }
.set__current-code { background: var(--color-gray-soft); padding: 2px var(--space-1); border-radius: var(--radius-sm); }
.set__export-btn { min-height: 44px; }
.set__import { margin-top: var(--space-2); display: flex; flex-direction: column; gap: var(--space-1); }
.set__file { margin-top: var(--space-1); width: 100%; max-width: 100%; box-sizing: border-box; overflow: hidden; font-family: var(--font-body); font-size: var(--font-size-sm); }
.set__import-result--error { color: var(--color-red); }
.set__confirm-body { margin: 0 0 var(--space-3); font-family: var(--font-body); font-size: var(--font-size-sm); color: var(--color-black-soft); line-height: 1.5; }
.set__confirm-actions { display: flex; gap: var(--space-2); justify-content: flex-end; }
.set__import-modes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); margin: var(--space-3) 0; }
.set__mode { min-height: 88px; display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-1); text-align: left; padding: var(--space-2); border: var(--border-thick); background: var(--color-white); cursor: pointer; }
.set__mode span { font-size: var(--font-size-xs); color: var(--color-gray); line-height: 1.4; }
.set__mode--active { border-color: var(--color-blue); box-shadow: 3px 3px 0 var(--color-blue); }
@media (max-width: 560px) { .set__import-modes { grid-template-columns: 1fr; } }
/* 实验室区:红色左边框 + 警告底色,视觉上区别于普通设置区(暗示附加风险)。 */
.section--labs { border-left: 3px solid var(--color-red); padding-left: var(--space-3); background: var(--color-red-soft); padding-top: var(--space-3); padding-bottom: var(--space-3); padding-right: var(--space-3); border-radius: 0 var(--radius-sm) var(--radius-sm) 0; }
.set__lab-item { display: flex; gap: var(--space-2); align-items: flex-start; }
.set__lab-warn { display: block; margin-top: 2px; color: var(--color-red); }
`}</style>
    </main>
  )
}
