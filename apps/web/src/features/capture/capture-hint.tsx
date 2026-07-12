'use client'

/**
 * CaptureHint (spec §4.1 / plan Task 9) — a one-time, dismissible banner
 * surfacing the global ⌘⇧E shortcut to first-time users. Hidden once
 * settings.seenCaptureHint is true. Mounted on the home page.
 */
import { useSettings, settingsStore } from '@/lib/settings-store'
import { useI18n } from '@/lib/i18n'
import { useIsMobile } from '@/lib/use-platform'

export function CaptureHint() {
  const { settings, ready } = useSettings()
  const { t } = useI18n()
  const isMobile = useIsMobile()
  if (!ready || settings.seenCaptureHint) return null
  // 移动端无系统全局热键(安卓/iOS 无 Cmd+Shift+E 概念;桌面壳的 global-shortcut
  // 仅 cfg(desktop) 注册)。文案 capture.hint 写死 ⌘⇧E,在触屏设备上误导 → 移动端整条隐藏。
  if (isMobile) return null
  return (
    <div className="capture-hint" data-testid="capture-hint" role="status">
      <span className="capture-hint__text">{t('capture.hint')}</span>
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
.capture-hint__text { flex: 1 1 auto; }
.capture-hint__dismiss {
  background: var(--color-black); color: var(--color-white); border: 0;
  padding: var(--space-1) var(--space-2); font-family: var(--font-display);
  cursor: pointer; text-transform: lowercase;
}
.capture-hint__dismiss:focus-visible { outline: 2px solid var(--color-blue); outline-offset: 2px; }
`}</style>
    </div>
  )
}
