'use client'

/**
 * P5.3 — canvas → PNG/JPEG export (drawio P5-3).
 *
 * Pipeline: prepare the SVG (fonts/images embedded, no cystift — that goes in
 * the PNG chunk) → tldraw's `getSvgAsImage` rasterizes via SVG→<img>→<canvas>
 * → for PNG, splice the `.cystift` payload into a `tEXt` chunk before
 * download. Background/transparent is honoured by `getSvgString`'s
 * `background` flag (false ⇒ transparent PNG; jpeg ignores it).
 *
 * `scale` is applied as the bitmap `pixelRatio` (tldraw's getSvgAsImage
 * multiplies the SVG's logical width/height by it) — we keep the SVG itself
 * at logical scale 1 so the multiplier isn't applied twice.
 */
import { getSvgAsImage } from '@tldraw/tldraw'
import type { Editor } from '@tldraw/tldraw'
import type { CardService, CanvasId } from '@cys-stift/domain'
import { exportCanvasSvg } from './export-svg'
import {
  embedCystiftInPng,
  buildCystiftPayload,
} from './cystift-payload'
import { getSafeFileName } from './export-bounds'
import type { ExportScope } from './export-bounds'

export type RasterFormat = 'png' | 'jpeg'

export interface CanvasImageExportOptions {
  scope?: ExportScope
  /** Bitmap resolution multiplier (1 = logical, 2 = retina, …). */
  scale?: number
  border?: number
  /** Include background? false ⇒ transparent (PNG only). */
  background?: boolean
  format?: RasterFormat
  /** JPEG quality 0–1 (ignored for PNG). */
  quality?: number
  /** Embed the .cystift payload in the PNG tEXt chunk (PNG only; default true). */
  embedCystift?: boolean
}

export async function exportCanvasImage(
  editor: Editor,
  service: CardService,
  canvasId: CanvasId,
  canvasName: string,
  opts: CanvasImageExportOptions = {},
): Promise<Blob | null> {
  const {
    scope = 'diagram',
    scale = 2,
    border = 16,
    background = true,
    format = 'png',
    quality = 0.92,
    embedCystift = true,
  } = opts

  // Prepare SVG at logical scale 1 (cystift disabled — it goes in the PNG).
  const prepared = await exportCanvasSvg(editor, service, canvasId, canvasName, {
    scope,
    scale: 1,
    border,
    background,
    embedFonts: true,
    embedImages: true,
    embedCystift: false,
  })
  if (!prepared) return null

  const blob = await getSvgAsImage(prepared.svg, {
    width: prepared.width,
    height: prepared.height,
    pixelRatio: scale,
    type: format,
    quality,
  })
  if (!blob) return null

  if (format === 'png' && embedCystift) {
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const payload = buildCystiftPayload(editor, service, canvasId, canvasName)
    const withPayload = await embedCystiftInPng(bytes, payload)
    return new Blob([withPayload], { type: 'image/png' })
  }
  return blob
}

export function downloadImage(blob: Blob, canvasName: string, format: RasterFormat): void {
  if (typeof window === 'undefined') return
  const ext = format === 'png' ? 'cystift.png' : 'jpg'
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${getSafeFileName(canvasName)}.${ext}`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export { buildCystiftPayload }
