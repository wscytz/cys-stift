'use client'

/**
 * CaptureHost — Phase 6 Lean. Mounts the global Cmd/Ctrl+Shift+Space
 * shortcut listener and renders a single MiniInput instance. One host per
 * app (mounted from the root layout); no event bus, no multi-instance.
 *
 * Shortcut matching rules (plan §3 T3):
 * - metaKey OR ctrlKey must be true (cross-platform)
 * - shiftKey must be true
 * - code === 'Space' (more reliable than key which can be a CJK char)
 * - active element must NOT be INPUT / TEXTAREA / contenteditable
 * - MiniInput must NOT already be open (avoids repeat-fires)
 *
 * On match: event.preventDefault() (blocks browser default, e.g. macOS
 * Spotlight is OS-level so it can't be blocked here — that's fine, the
 * shortcut works inside the browser context which is where MiniInput lives).
 */
import { useCallback, useEffect, useState } from 'react'
import { useDb } from '@/lib/db-client'
import { MiniInput } from './mini-input'
import { WebCaptureSink } from './capture-sink'

export function CaptureHost() {
  const { service } = useDb()
  const [open, setOpen] = useState(false)

  const onSubmit = useCallback(
    ({ title, body }: { title: string; body?: string }) => {
      const sink = new WebCaptureSink(service)
      void sink.submit({
        title,
        body,
        source: { kind: 'shortcut', shortcutId: 'cmd-shift-space', deviceId: 'web' },
      })
      setOpen(false)
    },
    [service],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (open) return
      const mod = e.metaKey || e.ctrlKey
      if (!mod || !e.shiftKey) return
      if (e.code !== 'Space') return
      const t = e.target as HTMLElement | null
      if (t) {
        const tag = t.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable) return
      }
      e.preventDefault()
      setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return <MiniInput open={open} onClose={() => setOpen(false)} onSubmit={onSubmit} />
}