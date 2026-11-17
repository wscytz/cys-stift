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

  // 浏览器 canvas 尺寸守卫:超限后 drawImage 静默不画 / toBlob 返回 null → 导出空白
  // (2026-11-16 用户报"导出画面不全"的放大失败面:bounds 虚大 × 高 scale 极易超限)。
  // 单边上限 16384(Chrome/Safari),面积兜底 16384²;超限自动降 scale(逻辑尺寸不变,
  // 位图分辨率降档)。降档后仍超限(超大画布 × 1 倍)→ rasterizeSvg 内部拦截返回 null。
  const MAX_EDGE = 16384
  const MAX_AREA = MAX_EDGE * MAX_EDGE
  let effectiveScale = scale
  if (
    prepared.width * effectiveScale > MAX_EDGE ||
    prepared.height * effectiveScale > MAX_EDGE ||
    prepared.width * prepared.height * effectiveScale * effectiveScale > MAX_AREA
  ) {
    const byEdge = Math.min(MAX_EDGE / prepared.width, MAX_EDGE / prepared.height)
    const byArea = Math.sqrt(MAX_AREA / (prepared.width * prepared.height))
    effectiveScale = Math.max(1, Math.floor(Math.min(scale, byEdge, byArea)))
    console.warn(
      `[export-raster] raster ${Math.round(prepared.width * scale)}×${Math.round(prepared.height * scale)} over browser canvas limit — scale ${scale} → ${effectiveScale}`,
    )
  }

  // 自研光栅化:SVG string → Image → canvas → blob(替代 tldraw getSvgAsImage)。
  const blob = await rasterizeSvg(
    prepared.svg,
    prepared.width,
    prepared.height,
    effectiveScale,
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
    // 兜底守卫(调用方已 clamp scale;此处拦 1 倍仍超限的极端画布):
    // 超浏览器 canvas 上限的赋值会让 drawImage 静默不画,宁失败不空白。
    const MAX_EDGE = 16384
    const MAX_AREA = MAX_EDGE * MAX_EDGE
    const pw = Math.round(w * scale)
    const ph = Math.round(h * scale)
    if (pw > MAX_EDGE || ph > MAX_EDGE || pw * ph > MAX_AREA) {
      console.warn(`[export-raster] raster ${pw}×${ph} over browser canvas limit — aborting instead of silently blank`)
      return null
    }
    const img = new Image()
    img.width = pw
    img.height = ph
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('svg load failed'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = pw
    canvas.height = ph
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    // jpeg has no alpha — fill white so transparent regions don't go black.
    // Color tracked via token so dark mode (where --color-white inverts)
    // would still produce a legible background; fallback 与 token 值对齐(v0.2
    // 起 --color-white = surface 暖纸白 #fbf9f6,非纯白)。
    if (background && format === 'jpeg') {
      ctx.fillStyle = readToken('--color-white', '#fbf9f6')
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
