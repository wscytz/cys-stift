'use client'

/**
 * P5.4 — the `.cystift` roundtrip payload (drawio P5-7).
 *
 * A `.cystift.svg` / `.cystift.png` carries the full canvas — cards (domain
 * content) + tldraw snapshot (geometry: card shapes, freeform draw, arrows)
 * + canvas meta — embedded IN the image file. Drop the file back onto the
 * app and the canvas is restored onto a fresh canvas. Single-file portable
 * cards, no sidecar.
 *
 * Why both cards AND snapshot: the card shape in tldraw stores geometry +
 * a card-id reference; the card CONTENT (title/body/links/…) lives in the
 * CardService. Restoring fully needs both.
 *
 * Re-import remaps card ids (CardService.create mints fresh ids) and rewrites
 * the snapshot's `shape:<oldId>` references to match, so importing the same
 * `.cystift` twice never collides.
 */
import { getSnapshot, type Editor } from '@tldraw/tldraw'
import type { Card, CardId, CardService, CanvasId } from '@cys-stift/domain'
import { canvasStore } from '@/lib/canvas-store'
import { canvasSnapshotStore, type CanvasSnapshot } from '@/lib/canvas-snapshot-store'
import {
  writePngTextChunk,
  readPngTextChunk,
  encodePayload,
  decodePayload,
} from '@/lib/png-text-chunk'

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
  /** tldraw serialized store (geometry). Opaque — restored verbatim modulo
   *  the card-id remap. */
  snapshot: unknown
}

/** Build the payload from a live editor + service. */
export function buildCystiftPayload(
  editor: Editor,
  service: CardService,
  canvasId: CanvasId,
  canvasName: string,
): CystiftPayload {
  return {
    v: 1,
    app: 'cys-stift',
    canvas: { id: canvasId, name: canvasName },
    cards: service.listOnCanvas(canvasId),
    snapshot: getSnapshot(editor.store),
  }
}

/**
 * Restore a payload onto a FRESH canvas (never clobbers an existing one).
 * Creates the canvas, re-imports the cards (new ids, positions remapped to
 * the new canvas), rewrites the snapshot's card-shape ids to match, saves
 * the snapshot, and switches to the new canvas. Returns the new canvas id
 * (or null if the payload is bad).
 */
export async function restoreCystiftPayload(
  payload: CystiftPayload,
  service: CardService,
): Promise<CanvasId | null> {
  if (!payload || payload.app !== 'cys-stift' || !Array.isArray(payload.cards)) {
    return null
  }
  const name = (payload.canvas?.name || 'restored canvas') + ' · ' + 'restored'
  const newCanvasId = canvasStore.create(name)

  // Rewrite card-shape ids in the snapshot to the freshly-minted ids. We
  // work on the serialized JSON string so every reference (shape id, arrow
  // bindings, etc.) is caught in one pass.
  let snapJson = JSON.stringify(payload.snapshot ?? {})
  for (const card of payload.cards) {
    const oldId = String(card.id)
    // Clone the card onto the new canvas via the service (fresh id).
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
    if (oldId && oldId !== String(created.id)) {
      // Card shape ids are `shape:<cardId>`. Replace the literal token so
      // ids + any binding references follow the card.
      const before = `shape:${oldId}`
      const after = `shape:${String(created.id)}`
      snapJson = snapJson.split(before).join(after)
    }
  }

  let snapshot: CanvasSnapshot
  try {
    snapshot = JSON.parse(snapJson) as CanvasSnapshot
  } catch {
    snapshot = {} as CanvasSnapshot
  }
  await canvasSnapshotStore.save(newCanvasId, snapshot)
  // canvasStore.create already made the new canvas active; ensure it.
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
 *  Returns the new canvas id, or null if the file isn't a cystift file. */
export async function restoreFromFile(
  file: File,
  service: CardService,
): Promise<CanvasId | null> {
  const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')
  const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')
  if (!isPng && !isSvg) return null

  if (isSvg) {
    const text = await file.text()
    const payload = extractCystiftFromSvg(text)
    if (!payload) return null
    return await restoreCystiftPayload(payload, service)
  }

  // PNG — read bytes, look for the cystift tEXt chunk.
  const buf = new Uint8Array(await file.arrayBuffer())
  const payload = await extractCystiftFromPng(buf)
  if (!payload) return null
  return await restoreCystiftPayload(payload, service)
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
