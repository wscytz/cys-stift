'use client'

/**
 * CaptureHost — Phase 6 + 6.5g. Mounts the global Cmd/Ctrl+Shift+Space
 * shortcut listener, the menu "open capture" CustomEvent, and renders
 * a single MiniInput instance. One host per app; no event bus, no
 * multi-instance.
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
 *
 * Menu entry: AppMenu dispatches `cys-stift:open-capture` to ask the
 * CaptureHost to open the Mini Input. Same instance, same onSubmit.
 */
import { useCallback, useEffect, useState } from 'react'
import { useDb } from '@/lib/db-client'
import { useSettings } from '@/lib/settings-store'
import { MiniInput } from './mini-input'
import { captureSinkRegistry } from './capture-sink'

export const CAPTURE_OPEN_EVENT = 'cys-stift:open-capture'

export function CaptureHost() {
  const { service } = useDb()
  const { settings } = useSettings()
  const sc = settings.captureShortcut
  const [open, setOpen] = useState(false)
  // Tracks which entry-point opened the Mini Input so the saved card's
  // source.kind reflects it (shortcut vs menubar). Reset on submit/close.
  const [openKind, setOpenKind] = useState<'shortcut' | 'menubar'>('shortcut')

  const onSubmit = useCallback(
    ({ title, body }: { title: string; body?: string }) => {
      const source =
        openKind === 'menubar'
          ? { kind: 'menubar' as const, deviceId: 'web' }
          : {
              kind: 'shortcut' as const,
              shortcutId: 'cmd-shift-space',
              deviceId: 'web',
            }
      void captureSinkRegistry.submit({ title, body, source })
      setOpen(false)
    },
    [openKind],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (open) return
      // Match against the user-configured shortcut (spec §5.5). We accept
      // either meta or ctrl as the mod key for cross-platform forgiveness
      // — the stored modKey is just the user's preferred label.
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      if (sc.shift && !e.shiftKey) return
      if (e.code !== sc.code) return
      const t = e.target as HTMLElement | null
      if (t) {
        const tag = t.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable) return
      }
      e.preventDefault()
      setOpenKind('shortcut')
      setOpen(true)
    }
    const onMenuOpen = () => {
      setOpenKind('menubar')
      setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener(CAPTURE_OPEN_EVENT, onMenuOpen as EventListener)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(CAPTURE_OPEN_EVENT, onMenuOpen as EventListener)
    }
  }, [open, sc.shift, sc.code])

  // Register the web sink on mount. Other sinks (Phase 6.5g MenuCaptureSink,
  // Phase 8 TauriCaptureSink) can also register against the same registry.
  // The `cancelled` flag guards both dynamic imports: if the host unmounts
  // before an import resolves, we skip registering instead of leaking a
  // phantom sink that the cleanup (already run) can't remove.
  useEffect(() => {
    let cancelled = false
    // Fallback first: if a submit arrives before the dynamic-import
    // registration resolves, we still persist via service.fromCapture.
    captureSinkRegistry.setFallbackService(service)
    void import('./capture-sink').then(({ WebCaptureSink }) => {
      if (cancelled) return
      captureSinkRegistry.register('shortcut', new WebCaptureSink(service))
    })
    void import('./menu-capture-sink').then(({ MenuCaptureSink }) => {
      if (cancelled) return
      captureSinkRegistry.register('menubar', new MenuCaptureSink(service))
    })
    return () => {
      cancelled = true
      captureSinkRegistry.unregister('shortcut')
      captureSinkRegistry.unregister('menubar')
    }
  }, [service])

  return <MiniInput open={open} onClose={() => setOpen(false)} onSubmit={onSubmit} />
}