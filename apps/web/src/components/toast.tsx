'use client'

/**
 * M2.2 — ToastHost reads from toast-store, renders a right-bottom queue of
 * ephemeral notifications. Pairs with `<FileDropHandler />` to surface file
 * capture outcomes.
 *
 * v0.32 — per-toast ARIA roles (live region moved off the host):
 *  - error toasts get role="alert" (assertive — screen readers announce now).
 *  - success/info toasts get role="status" (polite — announced when idle).
 * Each toast element carries its own role, so errors interrupt while success
 * waits. The host is a plain container (no blanket polite live region, which
 * would understate errors).
 *
 * Every toast has a × dismiss button (errors persist until dismissed; this
 * gives the user an explicit way to clear any toast early).
 */
import { useEffect, useState } from 'react'
import {
  dismissToast,
  getToasts,
  subscribeToToasts,
  type Toast,
} from '@/lib/toast-store'
import { useI18n } from '@/lib/i18n'
import styles from './toast.module.css'

export function ToastHost() {
  const [items, setItems] = useState<Toast[]>([])
  useEffect(() => {
    setItems([...getToasts()])
    return subscribeToToasts(() => setItems([...getToasts()]))
  }, [])
  const { t } = useI18n()
  return (
    <div className={styles.host}>
      {items.map((tst) => (
        <div
          key={tst.id}
          // error → alert (assertive); success/info → status (polite).
          role={tst.kind === 'error' ? 'alert' : 'status'}
          className={`${styles.toast} ${styles[`toast--${tst.kind}`] ?? ''}`}
        >
          <span className={styles.toast__msg}>{tst.message}</span>
          <button
            type="button"
            className={styles.toast__close}
            onClick={() => dismissToast(tst.id)}
            aria-label={t('common.dismiss')}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
