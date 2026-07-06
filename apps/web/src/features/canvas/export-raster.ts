'use client'

/**
 * P5.3 — canvas → PNG/JPEG export (drawio P5-3).
 *
 * Pipeline (Phase 2 子3: host-based, zero tldraw):
 *   prepare the SVG (fonts/images embedded, no cystift — that goes in the
 *   PNG chunk) → self-built rasterize (SVG string → <img> → <canvas> →
 *   blob, replacing tldraw's getSvgAsImage) → for PNG, splice the `.cystift`
 *   payload into a `tEXt` chunk before download. Background/transparent is
 *   honoured by elementsToSvg's `background` flag (false ⇒ transparent PNG;
 *   jpeg ignores it — rasterize fills white for jpeg).
 *
 * `scale` is applied as the bitmap `pixelRatio` (canvas dimensions multiply
 * the SVG's logical width/height by it); the SVG itself stays at logical
 * scale 1 so the multiplier isn't applied twice.
 */
import type { CardService, CanvasId } from '@cys-stift/domain'
import { exportCanvasSvg } from './export-svg'
import {
  embedCystiftInPng,
  buildCystiftPayload,
} from './cystift-payload'
import { getSafeFileName } from './export-bounds'
import type { ExportScope } from './export-bounds'
import type { CanvasHost } from '@cys-stift/canvas-engine'
import { readToken } from '@cys-stift/canvas-engine'
import { downloadFile } from '@/lib/download'

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
  host: CanvasHost,
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
  const prepared = await exportCanvasSvg(host, service, canvasId, canvasName, {
    scope,
    scale: 1,
    border,
    background,
    embedFonts: true,
    embedImages: true,
    embedCystift: false,
  })
  if (!prepared) return null

  // 自研光栅化:SVG string → Image → canvas → blob(替代 tldraw getSvgAsImage)。
  const blob = await rasterizeSvg(
    prepared.svg,
    prepared.width,
    prepared.height,
    scale,
    format,
    quality,
    background,
  )
  if (!blob) return null

  if (format === 'png' && embedCystift) {
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const payload = buildCystiftPayload(host, service, canvasId, canvasName)
    const withPayload = await embedCystiftInPng(bytes, payload)
    return new Blob([withPayload], { type: 'image/png' })
  }
  return blob
}

/** Self-built SVG → raster: SVG string → <img> → <canvas> → blob. Returns
 *  null in non-browser envs (SSR) or when the canvas 2D context is missing. */
async function rasterizeSvg(
  svg: string,
  w: number,
  h: number,
  scale: number,
  format: RasterFormat,
  quality: number,
  background: boolean,
): Promise<Blob | null> {
  if (typeof window === 'undefined') return null
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.width = w * scale
    img.height = h * scale
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('svg load failed'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = w * scale
    canvas.height = h * scale
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    // jpeg has no alpha — fill white so transparent regions don't go black.
    // Color tracked via token so dark mode (where --color-white inverts)
    // would still produce a legible background; fallback '#ffffff'.
    if (background && format === 'jpeg') {
      ctx.fillStyle = readToken('--color-white', '#ffffff')
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(
        (b) => resolve(b),
        format === 'png' ? 'image/png' : 'image/jpeg',
        quality,
      ),
    )
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function downloadImage(
  blob: Blob,
  canvasName: string,
  format: RasterFormat,
): Promise<void> {
  if (typeof window === 'undefined') return
  const ext = format === 'png' ? 'cystift.png' : 'jpg'
  // 走 downloadFile(分平台:桌面 Blob+a.click / Android Tauri SAF save),
  // 解决 Android WebView 不处理 Blob download 的静默失败。
  await downloadFile(`${getSafeFileName(canvasName)}.${ext}`, blob)
}

export { buildCystiftPayload }
