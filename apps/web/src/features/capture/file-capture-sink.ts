'use client'

/**
 * M2.2 — FileCaptureSink: receives a single file per submit (caller loops
 * for N-file drops) and routes by MIME:
 *   - image/*  → mediaStore.attach(file) → image card with media ref
 *   - text/* or .md/.txt/.csv/.html → note card, body = file text
 *   - .docx/.xlsx/.pptx/.pdf/.epub → markitdownllm to md + attach original
 *                                       as file-type media ref
 *   - everything else → toast 'capture.unsupported' + reject
 *
 * Bypasses `service.fromCapture()` because fromCapture silently drops
 * `input.media` (a M1-known gap; not fixed here to keep this plan zero-
 * domain-change). Goes straight to `service.create()` with explicit
 * `media: MediaRef[]` so file-attachment survives end-to-end.
 */
import type { CardService, CardId, CaptureInput, CaptureSource } from '@cys-stift/domain'
import { type CaptureSink } from './capture-sink'
import { mediaStore } from '@/lib/media-store'

// markitdownllm is dynamic-imported (50KB gzipped) so the main bundle stays
// slim; load fires only on first document file drop. Singleton lazy-init.
type MarkItDown = { convert: (f: File) => Promise<{ markdown: string; title?: string }> }
let _markitdownInstance: MarkItDown | null = null
async function getMarkItDown(): Promise<MarkItDown> {
  if (_markitdownInstance) return _markitdownInstance
  const mod = (await import('markitdownllm')) as unknown as {
    MarkItDown: new () => MarkItDown
  }
  _markitdownInstance = new mod.MarkItDown()
  return _markitdownInstance
}

const TEXT_MIMES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/html',
])
const DOC_MIME_FRAGMENTS = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/epub+zip',
]

/** Hard cap on per-file size — single base64 data URL would otherwise
 *  overflow the 5MB localStorage quota with a single attachment. */
const MAX_FILE_BYTES = 5 * 1024 * 1024

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, '')
}

function isImageMime(m: string): boolean {
  return m.startsWith('image/')
}

function isTextMime(m: string): boolean {
  return TEXT_MIMES.has(m)
}

function isDocMime(m: string): boolean {
  return DOC_MIME_FRAGMENTS.includes(m)
}

export class FileCaptureSink implements CaptureSink {
  constructor(private readonly service: CardService) {}

  /** The CaptureSink contract returns one cardId. We accept the input.file
   *  payload (attached by the caller) and create a single card from it. */
  async submit(input: CaptureInput & { file?: File }): Promise<{ cardId: CardId }> {
    const file = (input as { file?: File }).file
    if (!file) {
      throw new Error('FileCaptureSink.submit: missing input.file')
    }
    if (file.size > MAX_FILE_BYTES) {
      // Surface as an error (caller logs / toasts); we don't create a card.
      throw new Error(`file too large: ${file.name} (${file.size} bytes)`)
    }

    // IMAGE ────────────────────────────────────────────────────────────
    if (isImageMime(file.type)) {
      const ref = await mediaStore.attach(file)
      const card = this.service.create({
        title: stripExt(file.name),
        body: '',
        type: 'image',
        source: input.source,
        media: [ref],
      })
      return { cardId: card.id }
    }

    // TEXT (markdown, csv, html, plain) ────────────────────────────────
    if (isTextMime(file.type)) {
      const text = await file.text()
      const card = this.service.create({
        title: stripExt(file.name),
        body: text,
        type: 'note',
        source: input.source,
      })
      return { cardId: card.id }
    }

    // DOC (pdf, docx, xlsx, pptx, epub) — markdown conversion + raw file ref
    if (isDocMime(file.type)) {
      const converter = await getMarkItDown()
      const { markdown } = await converter.convert(file)
      const ref = await mediaStore.attach(file)
      const card = this.service.create({
        title: stripExt(file.name),
        body: markdown,
        type: 'note',
        source: input.source,
        media: [ref],
      })
      return { cardId: card.id }
    }

    // FALLBACK — unsupported MIME ──────────────────────────────────────
    throw new Error(
      `unsupported file type: ${file.name} (${file.type || 'unknown mime'})`,
    )
  }
}

/** Helper: build a CaptureSource of the right kind for FileCaptureSink. */
export function fileCaptureSource(
  kind: 'drag-drop' | 'paste',
  deviceId: string,
): CaptureSource {
  return kind === 'drag-drop'
    ? { kind: 'drag-drop', deviceId, fileCount: 1 }
    : { kind: 'paste', deviceId }
}