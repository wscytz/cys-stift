'use client'

/**
 * 首提告知:首次累积到 ≥1 AI 交互样本 + 开关未显式设过(undefined)→ 弹一次性提示。
 * 「知道了」→ 设 aiSampleCapture=true(消隐,不再弹);「关闭记录」→ 设 false。
 * 镜像 capture-hint 首次提示范式。挂首页(与 CaptureHint 同处)。
 *
 * 反应性:sample-store 是独立 localStorage,不经 settingsStore notify。本组件在
 * settings 变化 + mount 时读 count;用户首次产生样本(在 /ask/companion/canvas)
 * 后回到首页即触发。一次性(设 true/false 后 aiSampleCapture !== undefined 不再弹)。
 */
import { useState } from 'react'
import { settingsStore, useSettings } from '@/lib/settings-store'
import { getSampleCount } from '@/features/ai/sample-store'
import { useI18n } from '@/lib/i18n'

export function CaptureSampleHint() {
  const { t } = useI18n()
  const { settings, ready } = useSettings()
  const [dismissed, setDismissed] = useState(false)

  const count = ready ? getSampleCount() : 0
  const show = ready && !dismissed && settings.aiSampleCapture === undefined && count >= 1

  if (!show) return null

  const acknowledge = () => {
    settingsStore.update({ aiSampleCapture: true })
    setDismissed(true)
  }
  const turnOff = () => {
    settingsStore.update({ aiSampleCapture: false })
    setDismissed(true)
  }

  return (
    <div className="capture-sample-hint" role="dialog" aria-label={t('samples.hint.title')}>
      <p className="capture-sample-hint__text">{t('samples.hint.body')}</p>
      <div className="capture-sample-hint__actions">
        <button type="button" className="capture-sample-hint__btn" onClick={turnOff}>{t('samples.hint.turnOff')}</button>
        <button type="button" className="capture-sample-hint__btn capture-sample-hint__btn--primary" onClick={acknowledge}>{t('samples.hint.ack')}</button>
      </div>
      <style>{`
        .capture-sample-hint { position: fixed; left: 50%; bottom: var(--space-4); transform: translateX(-50%); z-index: 40; max-width: 480px; padding: var(--space-3); background: var(--color-white); border: 2px solid var(--color-black); border-radius: var(--radius-sm); box-shadow: 4px 4px 0 var(--color-black); }
        .capture-sample-hint__text { margin: 0 0 var(--space-2); font-family: var(--font-body); font-size: var(--font-size-sm); line-height: 1.5; color: var(--color-black); }
        .capture-sample-hint__actions { display: flex; gap: var(--space-2); justify-content: flex-end; }
        .capture-sample-hint__btn { padding: var(--space-1) var(--space-2); border: var(--border-hairline); background: transparent; font-family: var(--font-mono); font-size: var(--font-size-xs); cursor: pointer; }
        .capture-sample-hint__btn--primary { background: var(--color-black); color: var(--color-white); border-color: var(--color-black); }
      `}</style>
    </div>
  )
}
