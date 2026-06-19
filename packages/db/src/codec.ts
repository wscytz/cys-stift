/**
 * Row ↔ Domain codec.
 *
 * The DB stores plain text IDs and JSON strings. The domain wants branded IDs
 * and parsed objects. This is the only place that should know about both
 * shapes (spec §4.11).
 */

import type {
  Card,
  CardId,
  CanvasId,
  CanvasPosition,
  CaptureSource,
  Canvas as DomainCanvas,
  Workspace as DomainWorkspace,
  WorkspaceId,
  LinkPreview,
  CodeBlock,
  Quote,
  MediaRef,
  CanvasView,
  RegionColorMap,
} from '@cys-stift/domain'
import {
  toCardId,
  toCanvasId,
  toWorkspaceId,
} from '@cys-stift/domain'
import type { CardRow, CanvasRow, WorkspaceRow } from './schema'

// ── JSON helpers (spec §4.11.2) ────────────────────────────────────────────
// Centralised so we never double-stringify.

export function parseJson<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

export function stringifyJson<T>(value: T): string {
  return JSON.stringify(value)
}

// ── Card ───────────────────────────────────────────────────────────────────

export function cardFromRow(row: CardRow): Card {
  const source = parseJson<CaptureSource>(row.sourceJson, { kind: 'unknown' })
  const links = parseJson<LinkPreview[]>(row.linksJson, [])
  // Re-hydrate Date fields that JSON round-trip destroyed.
  for (const l of links) {
    if (typeof l.fetchedAt === 'string') l.fetchedAt = new Date(l.fetchedAt)
  }
  const codeSnippets = parseJson<CodeBlock[]>(row.codeSnippetsJson, [])
  const quotes = parseJson<Quote[]>(row.quotesJson, [])
  const media = parseJson<MediaRef[]>(row.mediaJson, [])

  let canvasPosition: CanvasPosition | undefined
  if (row.canvasId) {
    canvasPosition = {
      canvasId: toCanvasId(row.canvasId),
      x: row.canvasX ?? 0,
      y: row.canvasY ?? 0,
      w: row.canvasW ?? 240,
      h: row.canvasH ?? 120,
      z: row.canvasZ ?? 0,
      rotation: row.canvasRotation ?? undefined,
    }
  }

  return {
    id: toCardId(row.id),
    title: row.title,
    body: row.body,
    type: row.type as Card['type'],
    media,
    links,
    codeSnippets,
    quotes,
    source,
    capturedAt: row.capturedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    canvasPosition,
    color: (row.color as Card['color']) ?? undefined,
    pinned: row.pinned,
    archived: row.archived,
    deletedAt: row.deletedAt ?? undefined,
  }
}

export function cardToRow(card: Card): CardRow {
  return {
    id: card.id,
    workspaceId: 'default', // MVP single workspace; Phase 4+ multi-tenant
    title: card.title,
    body: card.body,
    type: card.type,
    mediaJson: stringifyJson(card.media),
    linksJson: stringifyJson(card.links),
    codeSnippetsJson: stringifyJson(card.codeSnippets),
    quotesJson: stringifyJson(card.quotes),
    sourceJson: stringifyJson(card.source),
    capturedAt: card.capturedAt,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
    canvasId: card.canvasPosition?.canvasId ?? null,
    canvasX: card.canvasPosition?.x ?? null,
    canvasY: card.canvasPosition?.y ?? null,
    canvasW: card.canvasPosition?.w ?? null,
    canvasH: card.canvasPosition?.h ?? null,
    canvasZ: card.canvasPosition?.z ?? null,
    canvasRotation: card.canvasPosition?.rotation ?? null,
    color: card.color ?? null,
    pinned: card.pinned,
    archived: card.archived,
    deletedAt: card.deletedAt ?? null,
  }
}

// ── Canvas ─────────────────────────────────────────────────────────────────

export function canvasFromRow(row: CanvasRow): DomainCanvas {
  return {
    id: toCanvasId(row.id),
    workspaceId: toWorkspaceId(row.workspaceId),
    name: row.name,
    view: parseJson<CanvasView>(row.viewJson, {
      zoom: 1,
      pan: { x: 0, y: 0 },
      gridMode: 'snap',
      gridSize: 8,
    }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function canvasToRow(canvas: DomainCanvas): CanvasRow {
  return {
    id: canvas.id,
    workspaceId: canvas.workspaceId,
    name: canvas.name,
    viewJson: stringifyJson(canvas.view),
    createdAt: canvas.createdAt,
    updatedAt: canvas.updatedAt,
  }
}

// ── Workspace ──────────────────────────────────────────────────────────────

export function workspaceFromRow(row: WorkspaceRow): DomainWorkspace {
  return {
    id: toWorkspaceId(row.id),
    name: row.name,
    defaultCanvasId: toCanvasId(row.defaultCanvasId),
    regionColorMap: row.regionColorMapJson
      ? parseJson<RegionColorMap>(row.regionColorMapJson, {})
      : undefined,
    createdAt: row.createdAt,
  }
}

export function workspaceToRow(ws: DomainWorkspace): WorkspaceRow {
  return {
    id: ws.id,
    name: ws.name,
    defaultCanvasId: ws.defaultCanvasId,
    regionColorMapJson: ws.regionColorMap ? stringifyJson(ws.regionColorMap) : null,
    createdAt: ws.createdAt,
  }
}
