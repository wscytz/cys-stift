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

/** 10-color fixed palette — chips never accept arbitrary hex. */
export const TAG_COLORS = [
  'var(--color-red)',
  'var(--color-teal)',
  'var(--color-blue)',
  'var(--color-yellow)',
  'var(--color-pink)',
  'var(--color-white)',
  'var(--color-gray)',
  'var(--color-orange)',
  'var(--color-purple)',
  'var(--color-green)',
] as const

export type TagColor = (typeof TAG_COLORS)[number]

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

// ── MediaAsset (spec §4.5) ──────────────────────────────────────────────────

export interface MediaAsset {
  id: MediaAssetId
  cardId: CardId
  kind: 'image' | 'file'
  mimeType: string
  byteSize: number
  width?: number
  height?: number
  storage: {
    backend: 'local-fs'
    relPath: string
    checksum: string
  }
  createdAt: Date
}

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
