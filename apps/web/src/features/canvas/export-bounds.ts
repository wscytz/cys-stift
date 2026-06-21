'use client'

/**
 * P5.1 — export bounds + shape resolution (drawio P5-1/P5-2).
 *
 * The pure core (`unionBounds`, `expandBounds`, `getSafeFileName`) has zero
 * tldraw dependency and is unit-tested. The `resolveExportShapes` adapter
 * bridges to a live tldraw Editor.
 *
 * drawio picks export bounds from one of three sources based on `exportType`
 * (page / diagram / selection). On tldraw we don't recompute geometry by hand
 * — `editor.getSvgString(shapes, { bounds, padding, ... })` does the
 * raster math — but we still need to decide WHICH shapes to export and, for
 * the `page` scope, supply an explicit bounds Box. The symmetric border maps
 * directly onto tldraw's native `padding` option (drawio's `border`).
 */

/** Axis-aligned box in page coordinates. Compatible with tldraw's `Box`
 *  shape (x/y/w/h), kept as a plain interface so the pure helpers below
 *  don't import tldraw. */
export interface Bounds {
  x: number
  y: number
  w: number
  h: number
}

export type ExportScope = 'diagram' | 'selection' | 'page'

/**
 * PURE — union of axis-aligned boxes. Returns null for an empty list.
 * Used to compute the content bounds of a shape set and to derive export
 * dimensions. Tested without tldraw.
 */
export function unionBounds(boxes: Bounds[]): Bounds | null {
  if (boxes.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const b of boxes) {
    if (b.x < minX) minX = b.x
    if (b.y < minY) minY = b.y
    if (b.x + b.w > maxX) maxX = b.x + b.w
    if (b.y + b.h > maxY) maxY = b.y + b.h
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/**
 * PURE — expand a box by `border` on all sides. When `shadow` is on and
 * border is zero, add a small slack (drawio: `+5`) so a drop-shadow filter
 * isn't clipped at the canvas edge. Tested without tldraw.
 */
export function expandBounds(b: Bounds, border: number, shadow = false): Bounds {
  const slack = shadow && border === 0 ? 5 : 0
  const t = border + slack
  return { x: b.x - t, y: b.y - t, w: b.w + 2 * t, h: b.h + 2 * t }
}

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
