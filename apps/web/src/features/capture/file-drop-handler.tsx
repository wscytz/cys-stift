'use client'

/**
 * M2.2 — global window-level drag/drop + paste handler. Prevents the
 * browser default of "open the file" (which would navigate the static-
 * exported app away), routes each file through the capture registry as
 * its own submit() call (FileCaptureSink creates one card per file).
 *
 * Skips text inputs so users can still paste into form fields. Drops
 * onto the tldraw canvas area fall through to tldraw's own default
 * external-content handlers (which create image/video shapes) — we
 * only act when the drop target is OUTSIDE tldraw's container.
 */
import { useEffect } from 'react'
import { captureSinkRegistry } from './capture-sink'
import { fileCaptureSource } from './file-capture-sink'
import { restoreFromFile } from '@/features/canvas/cystift-payload'
import type { CardService } from '@cys-stift/domain'
import { pushToast } from '@/lib/toast-store'
import { useI18n } from '@/lib/i18n'
import type { MessageKey } from '@/lib/i18n/messages'

function getDeviceId(): string {
  if (typeof window === 'undefined') return 'ssr'
  // Stable per-browser id (UA length + lang) — distinct per machine, no PII.
  // M3 can swap for a proper UUID stored in localStorage.
  return `web:${navigator.userAgent.length}:${navigator.language}`
}

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/** True when the drop target is inside a tldraw canvas container — we
 *  let tldraw's own external-content handler pick that up. */
function isInsideTldraw(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return Boolean(el.closest('.tl-container'))
}

interface DropOrPastePayload {
  files: File[]
  kind: 'drag-drop' | 'paste'
}

/** The CardService exposed on the canvas page (set in canvas-editor onMount).
 *  Present only when the user is on /canvas — re-import needs it to create
 *  cards. Null off-canvas. */
function getCardService(): CardService | null {
  if (typeof window === 'undefined') return null
  return (window as unknown as { __cardService?: CardService }).__cardService ?? null
}

function dispatchFiles(
  { files, kind }: DropOrPastePayload,
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
): void {
  if (files.length === 0) return
  const source = fileCaptureSource(kind, getDeviceId())
  files.forEach((file, i) => {
    const singleSource = i === 0 ? source : { ...source, fileCount: 1 }
    // P5.4 — a dropped `.cystift` PNG/SVG restores the canvas instead of
    // becoming a card. Probe png/svg files first; only fall through to the
    // normal capture path if it isn't a cystift export.
    const lower = file.name.toLowerCase()
    const maybeCystift =
      lower.endsWith('.png') || lower.endsWith('.svg')
    const svc = getCardService()
    if (maybeCystift && svc) {
      void restoreFromFile(file, svc)
        .then((canvasId) => {
          if (canvasId) {
            pushToast({
              kind: 'success',
              message: t('canvas.cystiftRestored', { name: file.name }),
            })
          } else {
            // Not a cystift file — create a card from it as usual.
            captureAndToast(file, singleSource, t)
          }
        })
        .catch(() => captureAndToast(file, singleSource, t))
      return
    }
    captureAndToast(file, singleSource, t)
  })
}

function captureAndToast(
  file: File,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  singleSource: any,
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
): void {
  void captureSinkRegistry
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .submit({ source: singleSource as any, file } as any)
    .then(() => {
      pushToast({
        kind: 'success',
        message: t('capture.success', { name: file.name }),
      })
    })
    .catch((e: Error) => {
      const msg = e.message
      if (msg.includes('too large')) {
        pushToast({
          kind: 'error',
          message: t('capture.quotaExceeded', { name: file.name }),
        })
      } else if (msg.includes('unsupported')) {
        pushToast({
          kind: 'error',
          message: t('capture.unsupported', {
            name: file.name,
            mime: file.type || 'unknown',
          }),
        })
      } else {
        pushToast({
          kind: 'error',
          message: t('capture.error', { name: file.name, error: msg }),
        })
      }
    })
}

export function FileDropHandler() {
  const { t } = useI18n()
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer) return
      if (e.dataTransfer.types.includes('Files')) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }
    }
    const onDrop = (e: DragEvent) => {
      if (isInsideTldraw(e.target)) return // let tldraw handle
      const files = e.dataTransfer?.files
      if (!files || files.length === 0) return
      e.preventDefault()
      dispatchFiles({ files: Array.from(files), kind: 'drag-drop' }, t)
    }
    const onPaste = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target)) return
      if (isInsideTldraw(e.target)) return
      const items = e.clipboardData?.items
      if (!items) return
      const files: File[] = []
      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        if (!it) continue
        if (it.kind === 'file') {
          const f = it.getAsFile()
          if (f) files.push(f)
        }
      }
      if (files.length === 0) return
      e.preventDefault()
      dispatchFiles({ files, kind: 'paste' }, t)
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('paste', onPaste)
    }
  }, [])

  return null
}