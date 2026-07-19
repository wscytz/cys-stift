'use client'

/**
 * CaptureHint (spec §4.1 / plan Task 9) — a one-time, dismissible banner
 * teaching the capture-now, organize-later workflow to first-time users.
 * Desktop also surfaces the global shortcut. Hidden once dismissed.
 */
import { useSettings, settingsStore } from '@/lib/settings-store'
import { useI18n } from '@/lib/i18n'
import { useIsMobile } from '@/lib/use-platform'

export function CaptureHint() {
  const { settings, ready } = useSettings()
  const { t } = useI18n()
  const isMobile = useIsMobile()
  if (!ready || settings.seenCaptureHint) return null
  return (
    <div className="capture-hint" data-testid="capture-hint" role="status">
      <span className="capture-hint__text">
        <strong>{t('capture.hintFlow')}</strong>
        {!isMobile && <span>{t('capture.hint')}</span>}
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
