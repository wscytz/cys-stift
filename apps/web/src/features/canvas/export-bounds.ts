'use client'

/**
 * P5.1 — export bounds + shape resolution (drawio P5-1/P5-2).
 *
 * The pure AABB geometry (`unionBounds`, `expandBounds`, `Bounds`) now lives in
 * `@cys-stift/canvas-engine`(通用几何,引擎自包含);这里 re-export 以保持现有
 * public API(`./export-bounds` 的消费者名不变)。`getSafeFileName` /
 * `resolveExportShapes` / `resolveExportElements` / `ExportScope` 仍是本文件
 * 的导出(它们是 export 业务,不是引擎几何)。
 *
 * drawio picks export bounds from one of three sources based on `exportType`
 * (page / diagram / selection). On tldraw we don't recompute geometry by hand
 * — `editor.getSvgString(shapes, { bounds, padding, ... })` does the
 * raster math — but we still need to decide WHICH shapes to export and, for
 * the `page` scope, supply an explicit bounds Box. The symmetric border maps
 * directly onto tldraw's native `padding` option (drawio's `border`).
 */

// 引擎层通用 AABB 几何(原在本文件,抽出后引擎自包含;这里 re-export 保 API)。
export { unionBounds, expandBounds, type Bounds } from '@cys-stift/canvas-engine'

export type ExportScope = 'diagram' | 'selection' | 'page'

/**
 * PURE — sanitize a user-facing string into a safe cross-platform filename.
 * Ported from AFFiNE's `getSafeFileName`: strip reserved chars + control
 * chars, dodge Windows reserved names (CON, PRN, AUX, NUL, COM1-9, LPT1-9), drop
 * trailing dots/spaces, cap at 50 chars preserving any extension.
 * Tested without tldraw.
 */
export function getSafeFileName(name: string, fallback = 'canvas'): string {
  if (!name) return fallback
  // 1. Sanitize the whole string first: reserved FS chars + control chars
  //    → dash (the `/` is escaped so the regex literal doesn't close on it),
  //    then strip trailing dots/spaces (Windows quirk).
  const cleaned = name
    .replace(/[<>:"\/\\|?*\x00-\x1F\x7F]/g, '-')
    .replace(/[\s.]+$/g, '')
    .trim()
  if (!cleaned) return fallback

  // 2. Split a trailing extension off the CLEANED string so a name like
  //    "name.." doesn't get mis-split (the pre-clean trailing dots are gone).
  const dot = cleaned.lastIndexOf('.')
  const hasExt = dot > 0 && dot < cleaned.length - 1
  const base = hasExt ? cleaned.slice(0, dot) : cleaned
  const ext = hasExt ? cleaned.slice(dot) : ''

  // 3. Defuse Windows reserved base names (CON/PRN/AUX/NUL/COM1-9/LPT1-9).
  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
  const safeBase = reserved.test(base) ? `${base}-` : base

  // 4. Cap base length (preserve extension).
  const maxBase = 50 - ext.length
  const trimmed = safeBase.length > maxBase ? safeBase.slice(0, maxBase) : safeBase
  return `${trimmed}${ext}`
}

// ── tldraw adapter ──────────────────────────────────────────────────────────

/**
 * Resolve the shape ids to export for a given scope.
 *  - `selection` → the currently selected shapes; if nothing is selected we
 *    fall back to the whole diagram (matches drawio's `ignoreSelection`
 *    branch — an empty selection exporting nothing would be a footgun).
 *  - `diagram` / `page` → every shape on the current page.
 */
export function resolveExportShapes(
  editor: {
    getSelectedShapes: () => { id: unknown }[]
    getCurrentPageShapes: () => { id: unknown }[]
  },
  scope: ExportScope,
): unknown[] {
  if (scope === 'selection') {
    const sel = editor.getSelectedShapes()
    if (sel.length > 0) return sel.map((s) => s.id)
  }
  return editor.getCurrentPageShapes().map((s) => s.id)
}

// ── host adapter (CanvasElement[]; 零 tldraw) ──────────────────────────────────

import type { CanvasElement, CanvasHost } from '@cys-stift/canvas-engine'

/**
 * 解析要导出的元素(scope=selection 用 host.getSelectedIds;diagram/page 用全部)。
 * 替代旧的 resolveExportShapes(editor)(tldraw)。新导出层用本函数。
 */
export function resolveExportElements(
  host: CanvasHost,
  scope: ExportScope,
): CanvasElement[] {
  const all = host.getElements()
  if (scope === 'selection') {
    const sel = new Set(host.getSelectedIds())
    if (sel.size > 0) return all.filter((e) => sel.has(e.id))
  }
  return all
}
