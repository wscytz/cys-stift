'use client'

/**
 * M2.2 — ToastHost reads from toast-store, renders a right-bottom queue of
 * ephemeral notifications. Pairs with `<FileDropHandler />` to surface file
 * capture outcomes. ARIA: role="status" with aria-live="polite" so screen
 * readers announce without interrupting.
 */
import { useEffect, useState } from 'react'
import { getToasts, subscribeToToasts, type Toast } from '@/lib/toast-store'
import styles from './toast.module.css'

export function ToastHost() {
  const [items, setItems] = useState<Toast[]>([])
  useEffect(() => {
    setItems([...getToasts()])
    return subscribeToToasts(() => setItems([...getToasts()]))
  }, [])
  return (
    <div className={styles.host} role="status" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          className={`${styles.toast} ${styles[`toast--${t.kind}`] ?? ''}`}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}