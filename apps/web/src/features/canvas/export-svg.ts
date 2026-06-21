'use client'

/**
 * P5.2 — canvas → SVG export (drawio P5-3, P5-4, P5-5).
 *
 * Pipeline:
 *   1. `await document.fonts.ready` — the #1 "missing font in export" cause
 *      is timing, not embedding (drawio `export.js:777`).
 *   2. `editor.getSvgString(shapes, { scale, background, padding })` — tldraw
 *      does the shape→SVG walk + the symmetric border (our `border` maps to
 *      its native `padding`).
 *   3. Post-process the SVG string:
 *      - embedFonts: scan `<text font-family=…>`, match against the page's
 *        `@font-face` rules (next/font self-hosts woff2 under
 *        `/_next/static/media/`), fetch each → base64, inject `<style>`. We
 *        NEVER use Google-Fonts `@import` — local-first means the export
 *        must render offline.
 *      - embedImages: inline any non-`data:` `<image href>` / `<img src>`
 *        (tldraw assets are already data URLs; this is a safety net for
 *        URL-referenced images).
 *      - embedCystift: stash the full-canvas payload as `data-cystift` so the
 *        `.cystift.svg` round-trips back into the app.
 */
import type { Editor } from '@tldraw/tldraw'
import {
  resolveExportShapes,
  getSafeFileName,
  type ExportScope,
} from './export-bounds'
import {
  embedCystiftInSvg,
  buildCystiftPayload,
  type CystiftPayload,
} from './cystift-payload'
import type { CardService, CanvasId } from '@cys-stift/domain'

export interface CanvasSvgExportOptions {
  scope?: ExportScope
  scale?: number
  /** Symmetric px border around content (maps to tldraw `padding`). */
  border?: number
  /** Include the background colour? false = transparent. */
  background?: boolean
  embedFonts?: boolean
  embedImages?: boolean
  /** Embed the .cystift payload (default true — it's the headline feature). */
  embedCystift?: boolean
}

export interface CanvasSvgExportResult {
  svg: string
  width: number
  height: number
}

export async function exportCanvasSvg(
  editor: Editor,
  service: CardService,
  canvasId: CanvasId,
  canvasName: string,
  opts: CanvasSvgExportOptions = {},
): Promise<CanvasSvgExportResult | null> {
  const {
    scope = 'diagram',
    scale = 1,
    border = 16,
    background = true,
    embedFonts = true,
    embedImages = true,
    embedCystift = true,
  } = opts

  // 1. Fonts ready (best-effort; non-browser envs skip).
  if (embedFonts && typeof document !== 'undefined') {
    try {
      await (document as unknown as { fonts?: { ready: Promise<unknown> } }).fonts
        ?.ready
    } catch {
      /* ignore — embedding still attempts per-rule below */
    }
  }

  // 2. Resolve shapes + render. tldraw's getSvgString can return undefined
  //    on the FIRST export right after shapes are created (assets / render
  //    not yet settled) — retry a few times so a user's first export doesn't
  //    silently come back empty.
  const shapeIds = resolveExportShapes(editor, scope)
  if (shapeIds.length === 0) return null
  const svgOpts = { scale, background, padding: border }
  let result = await editor.getSvgString(shapeIds as never, svgOpts)
  for (let attempt = 0; attempt < 10 && !result; attempt++) {
    await new Promise((r) => setTimeout(r, 150))
    result = await editor.getSvgString(shapeIds as never, svgOpts)
  }
  if (!result) return null

  // 3. Post-process the SVG string.
  let svg = result.svg
  if (embedFonts) svg = await embedFontsInSvg(svg)
  if (embedImages) svg = await embedImagesInSvg(svg)
  if (embedCystift) {
    const payload = buildCystiftPayload(editor, service, canvasId, canvasName)
    svg = embedCystiftInSvg(svg, payload)
  }

  return { svg, width: result.width, height: result.height }
}

/** Trigger a browser download for an SVG string. */
export function downloadSvg(svg: string, canvasName: string): void {
  if (typeof window === 'undefined') return
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  triggerDownload(blob, getSafeFileName(canvasName), 'svg')
}

function triggerDownload(blob: Blob, name: string, ext: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}.${ext}`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── Font embedding (best-effort, offline-safe) ─────────────────────────────

/** Collect font-family names referenced by text in the SVG. */
function collectFontFamilies(svg: string): Set<string> {
  const out = new Set<string>()
  const re = /font-family(?:\s*=\s*"([^"]*)"|\s*:\s*([^;"]+))/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(svg)) !== null) {
    const raw = (m[1] ?? m[2] ?? '').trim()
    // a CSS family list may be comma-separated; take each, strip quotes.
    for (const part of raw.split(',')) {
      const f = part.trim().replace(/^["']|["']$/g, '')
      if (f) out.add(f)
    }
  }
  return out
}

interface FontFaceRule {
  family: string
  /** First resolved URL from the src descriptor. */
  url: string
}

/** Walk document.styleSheets for @font-face rules. Skips cross-origin
 *  sheets (cssRules throws on those — caught per-sheet). */
function collectFontFaceRules(): FontFaceRule[] {
  if (typeof document === 'undefined') return []
  const out: FontFaceRule[] = []
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      continue // cross-origin
    }
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSFontFaceRule) {
        const style = rule.style
        const family = (style.getPropertyValue('font-family') || '').trim()
        const src = style.getPropertyValue('src') || ''
        const urlMatch = src.match(/url\(([^)]+)\)/)
        if (family && urlMatch?.[1]) {
          out.push({
            family: family.replace(/^["']|["']$/g, ''),
            url: urlMatch[1].replace(/^["']|["']$/g, ''),
          })
        }
      }
    }
  }
  return out
}

async function fetchToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result))
      r.onerror = reject
      r.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

async function embedFontsInSvg(svg: string): Promise<string> {
  const used = collectFontFamilies(svg)
  if (used.size === 0) return svg
  const rules = collectFontFaceRules()
  const toInline = rules.filter((r) => used.has(r.family))
  if (toInline.length === 0) return svg

  const faces: string[] = []
  for (const r of toInline) {
    const dataUrl = await fetchToDataUrl(r.url)
    if (dataUrl) {
      faces.push(`@font-face{font-family:"${r.family}";src:url("${dataUrl}");}`)
    }
  }
  if (faces.length === 0) return svg

  // Inject a <style> right after the opening <svg> tag.
  const styleTag = `<style>${faces.join('')}</style>`
  return svg.replace(/^(<svg\b[^>]*>)/, `$1${styleTag}`)
}

// ── Image embedding (best-effort safety net for URL-referenced images) ──────

async function embedImagesInSvg(svg: string): Promise<string> {
  // Match href="..." or xlink:href="..." on <image>, plus <img src="...">,
  // that are NOT already data: URLs. We dedupe URLs to avoid refetching.
  const urls = new Set<string>()
  const re = /(?:xlink:href|href)\s*=\s*"((?!data:)[^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(svg)) !== null) if (m[1]) urls.add(m[1])
  const imgRe = /<img[^>]*\bsrc\s*=\s*"((?!data:)[^"]+)"/g
  while ((m = imgRe.exec(svg)) !== null) if (m[1]) urls.add(m[1])
  if (urls.size === 0) return svg

  const cache = new Map<string, string | null>()
  for (const u of urls) cache.set(u, await fetchToDataUrl(u))

  let out = svg
  for (const [u, dataUrl] of cache) {
    if (dataUrl) out = out.split(u).join(dataUrl)
  }
  return out
}

/** Re-exported so the dialog can build a standalone payload if needed. */
export { buildCystiftPayload, type CystiftPayload }
