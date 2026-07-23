/**
 * Domain types — pure TS, zero framework dependency (spec §4).
 * Designed to be the single source of truth for what a Card, Canvas, etc.
 * *look like* in memory. The persistence layer translates rows ↔ these shapes
 * via the codec in `./codec.ts`.
 */

import type { ColorToken, Region, RegionToken } from './tokens-local'

export type { ColorToken, Region, RegionToken } from './tokens-local'

// ── Branded ID types (spec §4.2) ────────────────────────────────────────────
// At runtime these are plain strings; at compile time they're distinguishable
// so `function getCard(id: CardId)` can't accidentally accept a `CanvasId`.

export type CardId = string & { readonly __brand: 'CardId' }
export type CanvasId = string & { readonly __brand: 'CanvasId' }
export type WorkspaceId = string & { readonly __brand: 'WorkspaceId' }
export type MediaAssetId = string & { readonly __brand: 'MediaAssetId' }

// ── Card subtypes (spec §4.8) ───────────────────────────────────────────────

export type CardType = 'note' | 'image' | 'link' | 'code' | 'quote'

// ── Tags (P4 v0.32.0) ───────────────────────────────────────────────────────

/** Canonical palette — chips never accept arbitrary hex or unavailable CSS vars. */
export const TAG_COLORS = [
  'var(--color-red)',
  'var(--color-blue)',
  'var(--color-yellow)',
  'var(--color-black)',
  'var(--color-white)',
  'var(--color-gray)',
] as const

/** Values written by older previews. They remain in the input type so old
 * exports/tests can be read, but all persistence boundaries normalize them. */
export const LEGACY_TAG_COLORS = [
  'var(--color-teal)',
  'var(--color-pink)',
  'var(--color-orange)',
  'var(--color-purple)',
  'var(--color-green)',
] as const

export type CanonicalTagColor = (typeof TAG_COLORS)[number]
export type TagColor = CanonicalTagColor | (typeof LEGACY_TAG_COLORS)[number]

/** Map historical tag vars (and bare color names from hand-edited exports) to
 * tokens that are actually present in the UI. */
export function normalizeTagColor(value: unknown): CanonicalTagColor {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : ''
  const name = raw.match(/^var\(--color-([a-z]+)\)$/)?.[1] ?? raw
  switch (name) {
    case 'red':
    case 'pink':
      return 'var(--color-red)'
    case 'blue':
    case 'teal':
    case 'purple':
      return 'var(--color-blue)'
    case 'yellow':
    case 'orange':
      return 'var(--color-yellow)'
    case 'black':
      return 'var(--color-black)'
    case 'white':
      return 'var(--color-white)'
    case 'gray':
    case 'grey':
    case 'green':
      return 'var(--color-gray)'
    default:
      return 'var(--color-gray)'
  }
}

export interface TagRef {
  value: string
  color: TagColor
}

// ── Card subtypes (spec §4.8) ───────────────────────────────────────────────

export interface MediaRef {
  assetId: MediaAssetId
  caption?: string
  order: number
}

export interface LinkPreview {
  url: string
  title?: string
  description?: string
  ogImageUrl?: string
  fetchedAt: Date
}

export interface CodeBlock {
  language: string
  code: string
  caption?: string
}

export interface Quote {
  text: string
  attribution?: string
  sourceUrl?: string
}

// ── Card (spec §4.2) ───────────────────────────────────────────────────────

export interface CanvasPosition {
  canvasId: CanvasId
  x: number
  y: number
  w: number
  h: number
  z: number
  rotation?: number
}

export interface Card {
  id: CardId
  title: string
  body: string
  type: CardType

  media: MediaRef[]
  links: LinkPreview[]
  codeSnippets: CodeBlock[]
  quotes: Quote[]

  source: CaptureSource
  capturedAt: Date
  createdAt: Date
  updatedAt: Date

  canvasPosition?: CanvasPosition

  color?: ColorToken
  tags: TagRef[]
  pinned: boolean
  archived: boolean

  deletedAt?: Date
}

// ── CaptureSource (spec §4.4) ───────────────────────────────────────────────

export type CaptureSource =
  | { kind: 'shortcut'; shortcutId: string; deviceId: string }
  | { kind: 'menubar'; deviceId: string }
  | { kind: 'paste'; deviceId: string; originalApp?: string }
  | { kind: 'drag-drop'; deviceId: string; fileCount: number }
  | { kind: 'webhook'; endpoint: string; externalId?: string }
  /** A user-accepted proposal candidate. Carries local provenance only; never
   * provider credentials, raw prompt text, or a remote account identifier. */
  | { kind: 'ai-proposal'; proposalId: string; itemId: string }
  | { kind: 'manual'; deviceId: string }
  | { kind: 'unknown' }

// ── Canvas (spec §4.3) ──────────────────────────────────────────────────────

export interface CanvasView {
  zoom: number
  pan: { x: number; y: number }
  gridMode: 'snap' | 'free'
  gridSize: 8
}

export interface Canvas {
  id: CanvasId
  workspaceId: WorkspaceId
  name: string
  view: CanvasView
  createdAt: Date
  updatedAt: Date
}

// ── Workspace (spec §4.6) ───────────────────────────────────────────────────

export type RegionColorMap = Partial<Record<Region, RegionToken>>

export interface Workspace {
  id: WorkspaceId
  name: string
  defaultCanvasId: CanvasId
  regionColorMap?: RegionColorMap
  createdAt: Date
}

// ── MediaAsset ───────────────────────────────────────────────────────────
// The full MediaAsset entity (spec §4.5) is deferred — web stores media as
// inline data URLs in MediaRef, and no SQLite repository/codec consumes a
// MediaAsset row yet. The `MediaAssetId` brand above stays (MediaRef.assetId
// uses it). Removed in v0.37.0 (YAGNI — the table + type existed with no
// repository/service wiring).

// ── CaptureInput (spec §4.8) — for CaptureSink.submit() ─────────────────────

export interface CaptureMediaInput {
  kind: 'image' | 'file'
  fileName: string
  mimeType: string
  bytes?: ArrayBuffer
  localPath?: string
}

export interface CaptureInput {
  title?: string
  body?: string
  type?: CardType
  media?: CaptureMediaInput[]
  links?: string[]
  codeSnippets?: CodeBlock[]
  quotes?: Quote[]
  tags?: TagRef[]
  source: CaptureSource
  canvasPosition?: {
    canvasId: CanvasId
    x: number
    y: number
    w: number
    h: number
    z: number
    rotation?: number
  }
}
