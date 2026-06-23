'use client'

/**
 * P5.4 — the `.cystift` roundtrip payload (drawio P5-7).
 *
 * A `.cystift.svg` / `.cystift.png` carries the full canvas — cards (domain
 * content) + CanvasElement[] (geometry: card shapes, freeform draw, arrows,
 * rects, text) + canvas meta — embedded IN the image file. Drop the file back
 * onto the app and the canvas is restored onto a fresh canvas. Single-file
 * portable cards, no sidecar.
 *
 * Why both cards AND elements: the card element stores geometry + a card-id
 * reference; the card CONTENT (title/body/links/…) lives in the CardService.
 * Restoring fully needs both. The geometry is now a transparent
 * `CanvasElement[]` (was an opaque tldraw `getSnapshot` before Phase 2 子3).
 *
 * Re-import remaps card ids (CardService.create mints fresh ids) and rewrites
 * the elements' card id + arrow from/to references to match, so importing the
 * same `.cystift` twice never collides. Elements are restored via `host.upsert`
 * when a host is supplied (drop-in restore path); without a host only the
 * cards are restored (legacy/drag-drop fallback).
 */
import type { Card, CardId, CardService, CanvasId } from '@cys-stift/domain'
import { canvasStore } from '@/lib/canvas-store'
import {
  writePngTextChunk,
  readPngTextChunk,
  encodePayload,
  decodePayload,
} from '@/lib/png-text-chunk'
import type { CanvasElement, CanvasHost } from './host/canvas-host'

const CYSTIFT_KEY = 'cystift'
const CYSTIFT_ATTR = 'data-cystift'

export interface CystiftPayload {
  /** Payload version — bump + migrate on breaking changes. */
  v: 1
  /** Producer app + format marker (lets re-import sanity-check). */
  app: 'cys-stift'
  canvas: { id: string; name: string }
  /** Cards on this canvas at export time (content source of truth). */
  cards: Card[]
  /** Geometry as a transparent CanvasElement[] (was opaque tldraw snapshot).
   *  Old `.cystift` files (pre-子3) carry a `snapshot` field instead — restore
   *  degrades to `payload.elements ?? []` (cards-only) for those. */
  elements: CanvasElement[]
}

/** Build the payload from a live host + service. */
export function buildCystiftPayload(
  host: CanvasHost,
  service: CardService,
  canvasId: CanvasId,
  canvasName: string,
): CystiftPayload {
  return {
    v: 1,
    app: 'cys-stift',
    canvas: { id: canvasId, name: canvasName },
    cards: service.listOnCanvas(canvasId),
    elements: host.getElements(),
  }
}

/**
 * Restore a payload onto a FRESH canvas (never clobbers an existing one).
 * Creates the canvas, re-imports the cards (new ids, positions remapped to
 * the new canvas), then — when a host is supplied — re-inserts the geometry
 * elements via host.upsert (card ids + arrow from/to remapped to the new
 * card ids). Returns the new canvas id (or null if the payload is bad).
 *
 * `host` is optional: the legacy drag-drop path has no live host for the new
 * canvas, so it degrades to restoring cards only (geometry lost). Callers
 * with a host (e.g. the export-restore flow) pass it to restore full geometry.
 */
export async function restoreCystiftPayload(
  payload: CystiftPayload,
  service: CardService,
  host?: CanvasHost,
): Promise<CanvasId | null> {
  if (!payload || payload.app !== 'cys-stift' || !Array.isArray(payload.cards)) {
    return null
  }
  const name = (payload.canvas?.name || 'restored canvas') + ' · ' + 'restored'
  const newCanvasId = canvasStore.create(name)

  // card id 重映射:旧 cardId → 新 cardId(service.create 生成)。
  const idMap = new Map<string, string>()
  for (const card of payload.cards) {
    const oldId = String(card.id)
    const created = service.create({
      title: card.title,
      body: card.body,
      type: card.type,
      media: card.media,
      links: card.links,
      codeSnippets: card.codeSnippets,
      quotes: card.quotes,
      source: card.source,
      color: card.color,
      canvasPosition: card.canvasPosition
        ? { ...card.canvasPosition, canvasId: newCanvasId }
        : undefined,
    })
    idMap.set(oldId, String(created.id))
  }

  // 恢复几何元素:card 用新 id;arrow 的 from/to 重映射。旧 .cystift 文件
  // (含 snapshot,无 elements)降级为空元素(只恢复 cards)。
  const elements = (payload.elements ?? []) as CanvasElement[]
  if (host && elements.length > 0) {
    host.applyWithoutEcho(() => {
      for (const el of elements) {
        const newEl: CanvasElement = { ...el }
        if (el.kind === 'card' && idMap.has(el.id)) {
          newEl.id = idMap.get(el.id)!
        }
        if (el.from && idMap.has(el.from)) newEl.from = idMap.get(el.from)!
        if (el.to && idMap.has(el.to)) newEl.to = idMap.get(el.to)!
        host.upsert(newEl)
      }
    })
  }

  canvasStore.setActive(newCanvasId)
  return newCanvasId
}

// ── SVG embedding (`data-cystift` on the root <svg>) ────────────────────────

/** Embed a payload as a `data-cystift` attribute on the SVG root. The
 *  encoded form is URL-safe (no quotes), so it sits cleanly in an attr. */
export function embedCystiftInSvg(svg: string, payload: CystiftPayload): string {
  const encoded = encodePayload(payload)
  if (svg.includes(CYSTIFT_ATTR)) return svg // don't double-embed
  // Inject right after the opening <svg ...> tag.
  return svg.replace(/^(<svg\b[^>]*>)/, `$1 ${CYSTIFT_ATTR}="${encoded}"`)
}

export function extractCystiftFromSvg(svg: string): CystiftPayload | null {
  const m = svg.match(new RegExp(`${CYSTIFT_ATTR}="([^"]*)"`))
  if (!m || !m[1]) return null
  return decodePayload<CystiftPayload>(m[1])
}

// ── PNG embedding (`tEXt` chunk, keyword `cystift`) ──────────────────────────

export async function embedCystiftInPng(
  pngBytes: Uint8Array,
  payload: CystiftPayload,
): Promise<Uint8Array> {
  return writePngTextChunk(pngBytes, CYSTIFT_KEY, encodePayload(payload))
}

export async function extractCystiftFromPng(
  pngBytes: Uint8Array,
): Promise<CystiftPayload | null> {
  const text = readPngTextChunk(pngBytes, CYSTIFT_KEY)
  if (!text) return null
  return decodePayload<CystiftPayload>(text)
}

/** Detect + restore a `.cystift` payload from a dropped File (PNG or SVG).
 *  Returns the new canvas id, or null if the file isn't a cystift file.
 *  `host` optional — when supplied, geometry elements are restored via
 *  host.upsert; without it only cards are restored (drag-drop fallback). */
export async function restoreFromFile(
  file: File,
  service: CardService,
  host?: CanvasHost,
): Promise<CanvasId | null> {
  const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')
  const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')
  if (!isPng && !isSvg) return null

  if (isSvg) {
    const text = await file.text()
    const payload = extractCystiftFromSvg(text)
    if (!payload) return null
    return await restoreCystiftPayload(payload, service, host)
  }

  // PNG — read bytes, look for the cystift tEXt chunk.
  const buf = new Uint8Array(await file.arrayBuffer())
  const payload = await extractCystiftFromPng(buf)
  if (!payload) return null
  return await restoreCystiftPayload(payload, service, host)
}

/** Quick check whether a File MIGHT be a cystift file (cheap — name/mime
 *  only; full detection reads the bytes in restoreFromFile). Exported so
 *  the drop handler can short-circuit the normal capture path. */
export function looksLikeCystiftFile(file: File): boolean {
  const n = file.name.toLowerCase()
  return (
    (n.endsWith('.png') || n.endsWith('.svg')) &&
    // `.cystift.png` / `.cystift.svg` is our naming convention; we ALSO
    // probe any png/svg (a plain export may have been renamed) in the
    // handler, so be permissive here.
    true
  )
}

// Re-export the card-id type for callers that build payloads by hand.
export type { Card, CardId }
