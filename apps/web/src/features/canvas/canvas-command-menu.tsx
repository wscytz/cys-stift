'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface CanvasCommandMenuItem {
  id: string
  label: string
  disabled?: boolean
  onSelect: () => void
}

export function canvasMenuTriggerIntent(
  key: string,
): 'first' | 'last' | null {
  if (key === 'ArrowDown') return 'first'
  if (key === 'ArrowUp') return 'last'
  return null
}

export function CanvasCommandMenu({
  id,
  label,
  open,
  initialFocus,
  triggerRef,
  onClose,
  items,
}: {
  id: string
  label: string
  open: boolean
  initialFocus: 'first' | 'last'
  triggerRef: React.RefObject<HTMLButtonElement | null>
  onClose: () => void
  items: CanvasCommandMenuItem[]
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null)
      return
    }
    const measure = () => {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      setPosition({
        left: Math.max(8, rect.left - 176),
        top: rect.top,
      })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [open, triggerRef])

  useLayoutEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      const enabled = enabledItems(menuRef.current)
      const target = initialFocus === 'last' ? enabled.at(-1) : enabled[0]
      target?.focus()
    })
    return () => {
      cancelled = true
    }
  }, [initialFocus, open])

  if (!open || typeof document === 'undefined') return null

  const closeAndRestoreFocus = () => {
    onClose()
    triggerRef.current?.focus()
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const enabled = enabledItems(menuRef.current)
    if (enabled.length === 0) return
    const current = enabled.indexOf(document.activeElement as HTMLButtonElement)
    let target: HTMLButtonElement | undefined
    if (event.key === 'ArrowDown') {
      target = enabled[(current + 1 + enabled.length) % enabled.length]
    } else if (event.key === 'ArrowUp') {
      target = enabled[(current - 1 + enabled.length) % enabled.length]
    } else if (event.key === 'Home') {
      target = enabled[0]
    } else if (event.key === 'End') {
      target = enabled.at(-1)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeAndRestoreFocus()
      return
    } else if (event.key === 'Tab') {
      onClose()
      return
    } else {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    target?.focus()
  }

  return createPortal(
    <>
      <div
        className="cv-rail__menu-backdrop"
        aria-hidden="true"
        onClick={closeAndRestoreFocus}
      />
      <div
        ref={menuRef}
        id={id}
        className="cv-rail__menu"
        role="menu"
        aria-label={label}
        onKeyDown={onKeyDown}
        style={
          position
            ? { left: `${position.left}px`, top: `${position.top}px` }
            : { visibility: 'hidden' }
        }
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className="cv-rail__menu-item"
            disabled={item.disabled}
            onClick={() => {
              onClose()
              item.onSelect()
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>,
    document.body,
  )
}

function enabledItems(root: HTMLElement | null): HTMLButtonElement[] {
  if (!root) return []
  return [
    ...root.querySelectorAll<HTMLButtonElement>(
      '[role="menuitem"]:not(:disabled)',
    ),
  ]
}
