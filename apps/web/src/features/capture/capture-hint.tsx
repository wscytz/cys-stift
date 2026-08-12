'use client'

/**
 * CaptureHint (spec §4.1 / plan Task 9) — a one-time, dismissible banner
 * teaching the capture-now, organize-later workflow to first-time users.
 * Desktop also surfaces the global shortcut. Hidden once dismissed.
 */
import { useSettings, settingsStore } from '@/lib/settings-store'
import { useI18n } from '@/lib/i18n'
import { useIsMac, useIsMobile } from '@/lib/use-platform'

export function CaptureHint() {
  const { settings, ready } = useSettings()
  const { t } = useI18n()
  const isMobile = useIsMobile()
  const isMac = useIsMac()
  if (!ready || settings.seenCaptureHint) return null
  // R11:快捷键按平台显示(⌘⇧E vs Ctrl+⇧E),并跟随用户自定义的快捷键。
  // 此前写死 ⌘⇧E —— Windows 键盘没有 ⌘,新用户可能因此从不尝试捕获。
  const sc = settingsStore.get().captureShortcut
  const mod = isMac ? '⌘' : 'Ctrl'
  const keyLabel =
    sc?.code === 'Space' ? 'Space'
    : sc?.code === 'Comma' ? ','
    : sc?.code === 'Period' ? '.'
    : sc?.code?.startsWith('Key') ? sc.code.slice(3)
    : sc?.code ?? 'E'
  const combo = `${mod}${sc?.shift ? '+⇧' : ''}+${keyLabel}`
  return (
    <div className="capture-hint" data-testid="capture-hint" role="status">
      <span className="capture-hint__text">
        <strong>{t('capture.hintFlow')}</strong>
        {!isMobile && <span>{t('capture.hintCombo', { combo })}</span>}
      </span>
      <button
        type="button"
        className="capture-hint__dismiss"
        data-testid="capture-hint-dismiss"
        onClick={() => settingsStore.markCaptureHintSeen()}
      >
        {t('capture.hintDismiss')}
      </button>
      <style>{`
.capture-hint {
  display: flex; align-items: center; gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-yellow); color: var(--color-black);
  border: var(--border-thick); border-color: var(--color-black);
  font-family: var(--font-mono); font-size: var(--font-size-sm);
}
.capture-hint__text { display: flex; flex: 1 1 auto; flex-direction: column; gap: 2px; line-height: 1.4; }
.capture-hint__text strong { font-family: var(--font-display); letter-spacing: 0; }
.capture-hint__dismiss {
  background: var(--color-black); color: var(--color-white); border: 0;
  min-height: 44px; padding: var(--space-1) var(--space-2); font-family: var(--font-display);
  cursor: pointer; text-transform: lowercase;
}
.capture-hint__dismiss:focus-visible { outline: 2px solid var(--color-blue); outline-offset: 2px; }
`}</style>
    </div>
  )
}
