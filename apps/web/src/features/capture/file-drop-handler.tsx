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
import type { CardService, CaptureInput, CaptureSource } from '@cys-stift/domain'
import { pushToast } from '@/lib/toast-store'
import { useI18n } from '@/lib/i18n'
import { useDb } from '@/lib/db-client'
import { getDeviceId } from '@/lib/device-id'
import type { MessageKey } from '@/lib/i18n/messages'

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

/** The CardService is passed in from the component (via useDb()) so the
 *  handler never depends on the flaky `window.__cardService` global that
 *  is set/deleted across the async onMount gap — that race previously made
 *  `.cystift` restore silently fall through to card creation. */
function dispatchFiles(
  { files, kind }: DropOrPastePayload,
  service: CardService,
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
): void {
  if (files.length === 0) return
  const source = fileCaptureSource(kind, getDeviceId())
  files.forEach((file) => {
    // P5.4 — a dropped `.cystift` PNG/SVG restores the canvas instead of
    // becoming a card. Probe png/svg files first; only fall through to the
    // normal capture path if it isn't a cystift export.
    const lower = file.name.toLowerCase()
    const maybeCystift =
      lower.endsWith('.png') || lower.endsWith('.svg')
    if (maybeCystift) {
      void restoreFromFile(file, service)
        .then((canvasId) => {
          if (canvasId) {
            pushToast({
              kind: 'success',
              message: t('canvas.cystiftRestored', { name: file.name }),
            })
          } else {
            // Not a cystift file — create a card from it as usual.
            captureAndToast(file, source, t)
          }
        })
        .catch(() => captureAndToast(file, source, t))
      return
    }
    captureAndToast(file, source, t)
  })
}

function captureAndToast(
  file: File,
  source: CaptureSource,
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
): void {
  // file 作 CaptureInput 的额外属性,经结构子类型传到 FileCaptureSink(它从 input.file 取)。
  // registry.submit 签名是 CaptureInput;构造带类型的 input 变量,不再用 as any。
  const input: CaptureInput & { file: File } = { source, file }
  void captureSinkRegistry.submit(input)
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
  const { service } = useDb()
  useEffect(() => {
    // H1 fix: 注册 FileCaptureSink 处理 'drag-drop' 和 'paste' 两种 source.kind。
    // 否则 captureSinkRegistry.submit 落到 fallback(service.fromCapture),
    // 它读 input.title(undefined)而忽略 input.file → 每个拖入/粘贴的文件变成
    // 空白卡,文件内容静默丢失。FileCaptureSink 正确地为每个文件创建带 media/body
    // 的卡。FileDropHandler 全局挂在 layout.tsx,在这里注册覆盖整个 app 生命周期。
    // cancelled-flag 模式跟 inbox/page.tsx + capture-host.tsx 一致:动态 import
    // 解析前若已 unmount,跳过注册,避免泄漏无人清理的 sink。
    let cancelled = false
    void import('./file-capture-sink').then(({ FileCaptureSink }) => {
      if (cancelled) return
      const sink = new FileCaptureSink(service)
      captureSinkRegistry.register('drag-drop', sink)
      captureSinkRegistry.register('paste', sink)
    })
    return () => {
      cancelled = true
      captureSinkRegistry.unregister('drag-drop')
      captureSinkRegistry.unregister('paste')
    }
  }, [service])

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
      dispatchFiles({ files: Array.from(files), kind: 'drag-drop' }, service, t)
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
      dispatchFiles({ files, kind: 'paste' }, service, t)
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('paste', onPaste)
    }
  }, [service, t])

  return null
}