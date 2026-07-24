'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Toolbar, Modal, Button } from '@cys-stift/ui'
import { settingsStore, useSettings } from '@/lib/settings-store'
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
  clearWorkspace,
  downloadExport,
  getImportCheckpointMeta,
  IMPORT_CHECKPOINT_STORAGE_KEY,
  importFromJson,
  restoreImportCheckpoint,
  type ImportMode,
  type ImportCheckpointMeta,
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
  const [resultAction, setResultAction] = useState<'import' | 'restore' | 'clear'>('import')
  const [checkpointMeta, setCheckpointMeta] = useState<ImportCheckpointMeta | null>(null)
  const [restorePending, setRestorePending] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [clearPending, setClearPending] = useState(false)
  const [clearing, setClearing] = useState(false)

  const refreshCheckpointMeta = () => {
    setCheckpointMeta(getImportCheckpointMeta())
  }

  useEffect(() => {
    // localStorage is client-only; defer the read until after hydration so a
    // persisted recovery slot cannot change the server-rendered tree.
    refreshCheckpointMeta()
    const onStorage = (event: StorageEvent) => {
      if (event.key === IMPORT_CHECKPOINT_STORAGE_KEY) refreshCheckpointMeta()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const checkpointTime = (value: string): string => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date)
  }

  // 选文件后先弹确认门(覆盖不可撤销),确认后才真正导入。
  const handleImportFile = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]
    if (!file) return
    try {
      const text = await file.text()
      setResultAction('import')
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

  const confirmImport = async (opts?: { skipCheckpoint?: boolean }) => {
    const pending = pendingImport
    if (!pending || importing) return
    setImporting(true)
    setResultAction('import')
    try {
      const result = await importFromJson(
        pending.text,
        opts?.skipCheckpoint ? { mode: importMode, checkpoint: false } : { mode: importMode },
      )
      setImportResult(result)
      refreshCheckpointMeta()
      // 近配额时 saveImportCheckpoint(写完整副本)会失败 → result.error 以 'checkpoint failed' 开头。
      // 保留 pending 让用户能"跳过恢复点重试"(牺牲不可撤销换能导入);其余情况照常清 pending。
      const checkpointBlocked = !result.ok && !!result.error && result.error.startsWith('checkpoint failed')
      if (!checkpointBlocked) setPendingImport(null)
    } finally {
      setImporting(false)
    }
  }

  const confirmRestore = async () => {
    if (restoring) return
    setRestoring(true)
    setResultAction('restore')
    try {
      const result = await restoreImportCheckpoint()
      setImportResult(result)
      refreshCheckpointMeta()
      if (result.ok && result.checkpointCleared !== false) {
        setRestorePending(false)
      }
    } finally {
      setRestoring(false)
    }
  }

  const confirmClearWorkspace = async () => {
    if (clearing) return
    setClearing(true)
    setResultAction('clear')
    try {
      const result = await clearWorkspace()
      setImportResult(result)
      refreshCheckpointMeta()
      if (result.ok) setClearPending(false)
    } finally {
      setClearing(false)
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
              <>
              <p
                className={`mono mono--xs ${importResult.ok ? '' : 'set__import-result--error'}`}
                role={importResult.ok === false ? 'alert' : 'status'}
              >
                {importResult.ok
                  ? resultAction === 'restore'
                    ? importResult.checkpointCleared === false
                      ? t('settings.importCheckpointClearFailed')
                      : t('settings.importCheckpointRestored')
                    : resultAction === 'clear'
                      ? t('settings.clearWorkspaceOk')
                    : t('settings.importOk', {
                        cards: importResult.cards,
                        mediaAssets: importResult.mediaAssets,
                        canvases: importResult.canvases ?? 0,
                        freeform: importResult.freeformCanvases ?? 0,
                      })
                  : resultAction === 'clear'
                    ? t('settings.clearWorkspaceFail', { error: importResult.error ?? '' })
                    : t('settings.importFail', { error: importResult.error ?? '' })}
              </p>
              {!importResult.ok && importResult.error?.startsWith('checkpoint failed') && pendingImport && (
                <div className="set__import-retry">
                  <p className="mono mono--xs">{t('settings.importCheckpointBlockedHint')}</p>
                  <Button
                    variant="ghost"
                    onClick={() => confirmImport({ skipCheckpoint: true })}
                    disabled={importing}
                  >
                    {t('settings.importSkipCheckpoint')}
                  </Button>
                </div>
              )}
              </>
            )}
            {checkpointMeta && (
              <div className="set__import-recovery" data-testid="import-recovery">
                <p className="mono mono--xs">
                  {t('settings.importCheckpointAvailable', {
                    createdAt: checkpointTime(checkpointMeta.createdAt),
                    cards: checkpointMeta.cards,
                    media: checkpointMeta.mediaAssets,
                  })}
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  className="set__recovery-btn"
                  onClick={() => setRestorePending(true)}
                  disabled={restoring || importing}
                >
                  {t('settings.importCheckpointRestore')}
                </Button>
              </div>
            )}
          </div>
          <div className="set__clear-workspace">
            <p className="mono mono--xs">{t('settings.clearWorkspaceLede')}</p>
            <Button
              type="button"
              variant="danger"
              onClick={() => setClearPending(true)}
              disabled={clearing || importing || restoring}
            >
              {t('settings.clearWorkspace')}
            </Button>
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
        <section className="section" aria-labelledby="settings-ai-context-heading">
          <h3 className="set__subhead" id="settings-ai-context-heading">{t('settings.aiContext')}</h3>
          <p className="section__lede">{t('settings.aiContextLede')}</p>
          <div className="field-row">
            <label className="mono-label" htmlFor="set-ai-include-content">
              <input
                id="set-ai-include-content"
                type="checkbox"
                className="set__checkbox"
                checked={settings.aiIncludeCardContent !== false}
                onChange={(e) => settingsStore.update({ aiIncludeCardContent: e.target.checked })}
              />
              <span>{t('settings.aiIncludeCardContent')}</span>
            </label>
          </div>
        </section>
        <AISettingsPanel />
        </div>

        <div id="settings-research">
        <SampleExportPanel />
        </div>

        {/* 实验室 / Labs — 附加能力,默认全关。开启 = 用户显式接受附加风险。
            从 LAB_REGISTRY 渲染;每个 lab 走确认门(不可撤销风险让步);关闭直接生效。
            分层判据见 docs/specs/2026-06-30-ai-labs-strategy.md。 */}
        <section className={`section section--labs${LAB_REGISTRY.length === 0 ? ' section--labs-empty' : ''}`} id="settings-labs">
          <h2 className="section__h">{t('settings.labs.title')}</h2>
          <p className="section__lede">{t('settings.labs.lede')}</p>
          {LAB_REGISTRY.length === 0 && (
            <div className="set__labs-status" role="status">
              <strong>{t('settings.labs.none')}</strong>
              <dl>
                <div>
                  <dt>{t('settings.labs.visionLabel')}</dt>
                  <dd>{t('settings.labs.visionUnavailable')}</dd>
                </div>
                <div>
                  <dt>{t('settings.labs.automationLabel')}</dt>
                  <dd>{t('settings.labs.automationUnavailable')}</dd>
                </div>
              </dl>
            </div>
          )}
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
        <p className="set__confirm-body">{t('settings.importConfirmBody')}</p>
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

      <Modal
        open={restorePending}
        onClose={() => !restoring && setRestorePending(false)}
        title={t('settings.importCheckpointConfirmTitle')}
        closeLabel={t('common.close')}
      >
        <p className="set__confirm-body">
          {t('settings.importCheckpointConfirmBody')}
        </p>
        <div className="set__confirm-actions">
          <Button variant="ghost" onClick={() => setRestorePending(false)} disabled={restoring}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={() => void confirmRestore()} disabled={restoring}>
            {restoring
              ? t('settings.importCheckpointRestoring')
              : t('settings.importCheckpointRestore')}
          </Button>
        </div>
      </Modal>

      <Modal
        open={clearPending}
        onClose={() => !clearing && setClearPending(false)}
        title={t('settings.clearWorkspaceConfirmTitle')}
        closeLabel={t('common.close')}
      >
        <p className="set__confirm-body">{t('settings.clearWorkspaceConfirmBody')}</p>
        <div className="set__confirm-actions">
          <Button variant="ghost" onClick={() => setClearPending(false)} disabled={clearing}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={() => void confirmClearWorkspace()} disabled={clearing}>
            {clearing ? t('settings.clearWorkspaceClearing') : t('settings.clearWorkspace')}
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
.set__import-recovery { display: flex; flex-direction: column; gap: var(--space-1); border: var(--border-hairline); border-left-width: var(--space-quarter); border-left-color: var(--color-blue); background: var(--color-gray-soft); padding: var(--space-2); }
.set__import-recovery p { margin: 0; line-height: 1.45; }
.set__recovery-btn { align-self: flex-start; min-height: 40px; }
.set__clear-workspace { margin-top: var(--space-3); padding-top: var(--space-3); border-top: var(--border-hairline); display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
.set__clear-workspace p { flex: 1 1 28ch; margin: 0; line-height: 1.45; }
.set__confirm-body { margin: 0 0 var(--space-3); font-family: var(--font-body); font-size: var(--font-size-sm); color: var(--color-black-soft); line-height: 1.5; }
.set__confirm-actions { display: flex; gap: var(--space-2); justify-content: flex-end; }
.set__import-modes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); margin: var(--space-3) 0; }
.set__mode { min-height: 88px; display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-1); text-align: left; padding: var(--space-2); border: var(--border-thick); background: var(--color-white); cursor: pointer; }
.set__mode span { font-size: var(--font-size-xs); color: var(--color-gray); line-height: 1.4; }
.set__mode--active { border-color: var(--color-blue); box-shadow: var(--space-quarter) var(--space-quarter) 0 var(--color-blue); }
@media (max-width: 560px) { .set__import-modes { grid-template-columns: 1fr; } }
/* 实验室区:红色左边框 + 警告底色,视觉上区别于普通设置区(暗示附加风险)。 */
.section--labs { border-left: var(--space-quarter) solid var(--color-red); padding-left: var(--space-3); background: var(--color-red-soft); padding-top: var(--space-3); padding-bottom: var(--space-3); padding-right: var(--space-3); border-radius: 0 var(--radius-sm) var(--radius-sm) 0; }
.section--labs-empty { border-left-color: var(--color-black); background: var(--color-gray-soft); }
.set__labs-status { border: var(--border-hairline); background: var(--color-white); padding: var(--space-2); }
.set__labs-status > strong { font-family: var(--font-display); font-size: var(--font-size-sm); }
.set__labs-status dl { margin: var(--space-2) 0 0; display: grid; gap: var(--space-1); }
.set__labs-status dl > div { display: grid; grid-template-columns: minmax(110px, 0.35fr) minmax(0, 1fr); gap: var(--space-2); padding-top: var(--space-1); border-top: var(--border-hairline); }
.set__labs-status dt { font-family: var(--font-mono); font-size: var(--font-size-xs); }
.set__labs-status dd { margin: 0; color: var(--color-gray); font-size: var(--font-size-sm); line-height: 1.5; }
.set__lab-item { display: flex; gap: var(--space-2); align-items: flex-start; }
.set__lab-warn { display: block; margin-top: 2px; color: var(--color-red); }
@media (max-width: 560px) {
  .set__labs-status dl > div { grid-template-columns: 1fr; gap: var(--space-quarter); }
}
`}</style>
    </main>
  )
}
