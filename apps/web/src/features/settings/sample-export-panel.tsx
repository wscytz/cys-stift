'use client'

/**
 * /settings 的 AI 交互样本区:条数 + 累积开关 + 导出 JSON + 清空。
 * 样本不出本机;导出 = 浏览器下载到用户机器(opt-in,非外发)。
 */
import { useState } from 'react'
import { settingsStore, useSettings } from '@/lib/settings-store'
import { downloadFile } from '@/lib/download'
import { loadSamples, clearSamples, getSampleCount } from '@/features/ai/sample-store'
import { useI18n } from '@/lib/i18n'
import { pushToast } from '@/lib/toast-store'

export function SampleExportPanel() {
  const { t } = useI18n()
  const { settings, ready } = useSettings()
  const [, force] = useState(0)
  const count = ready ? getSampleCount() : 0
  const enabled = settings.aiSampleCapture === true

  const onExport = async () => {
    const samples = loadSamples()
    const payload = { exportedAt: new Date().toISOString(), version: 1, count: samples.length, samples }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const d = new Date()
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    // 走 downloadFile(分平台:桌面 Blob+a.click / Android Tauri SAF save),
    // 解决 Android WebView 不处理 Blob download 的静默失败。
    await downloadFile(`cys-stift-samples-${stamp}.json`, blob)
    pushToast({ kind: 'success', message: t('samples.exported', { n: String(samples.length) }) })
  }

  const onClear = () => {
    clearSamples()
    force((n) => n + 1)
    pushToast({ kind: 'info', message: t('samples.cleared') })
  }

  const onToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    settingsStore.update({ aiSampleCapture: e.target.checked })
  }

  return (
    <section className="sep" data-testid="sample-export">
      <div className="sep__region" aria-hidden="true" />
      <h2 className="sep__h">{t('samples.title')}</h2>
      <p className="sep__lede">{t('samples.lede')}</p>
      <p className="sep__disclosure" role="note">{t('samples.disclosure')}</p>
      <div className="sep__row">
        <label className="sep__label" htmlFor="ai-sample-capture">{t('samples.enable')}</label>
        <input id="ai-sample-capture" type="checkbox" checked={enabled} onChange={onToggle} />
      </div>
      <p className="sep__count">{t('samples.count', { n: String(count) })}</p>
      <div className="sep__actions">
        <button type="button" className="sep__btn" onClick={onExport} disabled={count === 0}>{t('samples.export')}</button>
        <button type="button" className="sep__btn" onClick={onClear} disabled={count === 0}>{t('samples.clear')}</button>
      </div>
      <style>{`
        .sep { position: relative; padding-top: var(--space-3); margin-top: var(--space-4); }
        .sep__region { position: absolute; top: 0; left: 0; width: 8px; height: 100%; background: var(--color-black); }
        .sep__h { font-family: var(--font-display); margin-left: var(--space-3); }
        .sep__lede { font-family: var(--font-body); color: var(--color-gray); margin: var(--space-1) var(--space-3) var(--space-3); }
        .sep__disclosure { font-family: var(--font-mono); font-size: var(--font-size-xs); line-height: 1.5; margin: 0 var(--space-3) var(--space-3); padding: var(--space-2); border: 1px solid var(--color-gray); }
        .sep__row { display: flex; align-items: center; gap: var(--space-2); margin: 0 var(--space-3) var(--space-2); }
        .sep__label { font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-black-soft); }
        .sep__count { margin: 0 var(--space-3) var(--space-2); font-family: var(--font-mono); font-size: var(--font-size-sm); color: var(--color-black); }
        .sep__actions { display: flex; gap: var(--space-2); margin: 0 var(--space-3); }
        .sep__btn { min-height: 44px; padding: var(--space-2) var(--space-3); border: var(--border-thick); border-radius: var(--radius-sm); background: var(--color-white); color: var(--color-black); font-family: var(--font-display); cursor: pointer; }
        .sep__btn:hover:not(:disabled) { box-shadow: 2px 2px 0 0 var(--color-red); }
        .sep__btn:active:not(:disabled) { transform: translate(2px, 2px); box-shadow: none; }
        .sep__btn:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
        .sep__btn:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </section>
  )
}
