'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import styles from './modal.module.css'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Bauhaus modal: full-screen 50% black overlay, white frame with hairline
 * border. Esc closes (handled by parent via useEffect).
 *
 * Phase B (v0.24.1) focus trap: when the modal opens we (1) remember the
 * element that held focus so it can be restored on close, (2) move focus
 * into the frame (first focusable descendant, else the frame itself).
 * While open, Tab / Shift+Tab cycles inside the frame instead of escaping
 * to the page behind. Each trap only acts while focus lives inside its
 * own frame, so a modal stack (card-detail → confirm-delete) lets only the
 * top trap handle the key. Escape stays the caller's responsibility.
 */
export function Modal({ open, onClose, title, children }: ModalProps) {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  // On open: stash the active element and move focus inside. On close:
  // restore it so the user resumes where they left off.
  useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement as HTMLElement | null
    const frame = frameRef.current
    if (frame) {
      const first = frame.querySelector<HTMLElement>(FOCUSABLE)
      ;(first ?? frame).focus()
    }
    return () => {
      const prev = previouslyFocused.current
      if (prev && typeof prev.focus === 'function') {
        try {
          prev.focus()
        } catch {
          // the element may have unmounted in the meantime
        }
      }
    }
  }, [open])

  // Tab trap: cycle within the frame. Only intervene when focus is inside
  // this frame, so stacked modals don't fight over the key.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const frame = frameRef.current
      if (!frame) return
      if (!frame.contains(document.activeElement)) return
      const items = Array.from(
        frame.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      )
      if (items.length === 0) {
        e.preventDefault()
        frame.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) return
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null
  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className={styles.frame}
        ref={frameRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.titleRow}>
          {title && <h2 className={styles.title}>{title}</h2>}
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  )
}
