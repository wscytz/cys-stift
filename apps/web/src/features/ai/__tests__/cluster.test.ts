import { describe, it, expect } from 'vitest'
import {
  buildClusterUserPrompt,
  parseClusters,
  applyClusters,
  CLUSTER_SYSTEM_PROMPT,
  type CardCluster,
} from '../cluster'
import { InMemoryCanvasHost } from '@cys-stift/canvas-engine'
import type { Card, CardId, CardService } from '@cys-stift/domain'

// ── fakes ────────────────────────────────────────────────────────────────────

function fakeCard(id: string, title: string, body = ''): Card {
  return {
    id: id as unknown as CardId,
    title,
    body,
    type: 'note',
    capturedAt: new Date('2026-06-21'),
    createdAt: new Date(),
    updatedAt: new Date(),
    pinned: false,
    archived: false,
    tags: [],
    media: [],
    links: [],
    codeSnippets: [],
    quotes: [],
    source: { kind: 'manual', deviceId: 'secret-device-id' },
    deletedAt: undefined,
    canvasPosition: { canvasId: 'canvas-1', x: 0, y: 0, w: 10, h: 10, z: 0, rotation: 0 },
    color: undefined,
  } as unknown as Card
}

function fakeService(cards: Card[]): CardService {
  const map = new Map(cards.map((c) => [String(c.id), c]))
  return {
    get: (id: CardId) => map.get(String(id)),
  } as unknown as CardService
}

const KNOWN = new Set(['1', '2', '3', '7', '12'])

// ── buildClusterUserPrompt ────────────────────────────────────────────────────

describe('buildClusterUserPrompt', () => {
  it('includes each card under a [card #id] header', () => {
    const prompt = buildClusterUserPrompt([fakeCard('1', 'React hooks'), fakeCard('2', 'Vue refs')])
    expect(prompt).toContain('[card #1]')
    expect(prompt).toContain('React hooks')
    expect(prompt).toContain('[card #2]')
  })

  it('never includes deviceId (allowlist enforced)', () => {
    const prompt = buildClusterUserPrompt([fakeCard('1', 'X')])
    expect(prompt).not.toContain('secret-device-id')
  })

  it('never includes media.dataUrl', () => {
    const card = fakeCard('1', 'X')
    ;(card as any).media = [{ assetId: 'a1', order: 0, kind: 'image', dataUrl: 'data:image/png;base64,BIGSECRET' }]
    const prompt = buildClusterUserPrompt([card])
    expect(prompt).not.toContain('BIGSECRET')
    expect(prompt).not.toContain('dataUrl')
  })

  it('returns empty string when all cards are soft-deleted (no request sent)', () => {
    const c = fakeCard('1', 'X')
    c.deletedAt = new Date()
    expect(buildClusterUserPrompt([c])).toBe('')
  })

  it('returns empty string for an empty card list', () => {
    expect(buildClusterUserPrompt([])).toBe('')
  })

  it('has a non-empty system prompt', () => {
    expect(CLUSTER_SYSTEM_PROMPT.length).toBeGreaterThan(0)
    expect(CLUSTER_SYSTEM_PROMPT.toLowerCase()).toContain('json')
  })

  // A 方向闭环:cluster prompt 接画布快照(含 freedraw shape 行)
  it('includes the canvas snapshot (with freedraw shape) when provided', () => {
    const cards = [fakeCard('1', '苹果'), fakeCard('2', '橘子')]
    const snapshot = '[card #1] @pos(0,0)\n[freedraw #f1] @pos(50,50)\n  shape: circle (85%)'
    const prompt = buildClusterUserPrompt(cards, snapshot)
    expect(prompt).toContain('苹果')
    expect(prompt).toContain('shape: circle')
    expect(prompt).toContain('freedraw')
  })

  it('works without a snapshot (backward compat — single arg)', () => {
    const prompt = buildClusterUserPrompt([fakeCard('1', 'x')])
    expect(prompt).toContain('x')
    expect(prompt).not.toContain('shape:')
  })

  it('still returns empty when cards are soft-deleted even with a snapshot', () => {
    const c = fakeCard('1', 'X')
    c.deletedAt = new Date()
    expect(buildClusterUserPrompt([c], '[freedraw #f1] shape: circle (90%)')).toBe('')
  })
})

// ── parseClusters ─────────────────────────────────────────────────────────────

describe('parseClusters (defensive — never throws)', () => {
  it('parses a well-formed array', () => {
    const raw = JSON.stringify([
      { ids: ['1', '2'], kind: 'duplicate', reason: 'both about hooks' },
      { ids: ['7', '12', '3'], kind: 'related', reason: 'state mgmt' },
    ])
    const out = parseClusters(raw, KNOWN)
    expect(out).toHaveLength(2)
    expect(out[0]?.ids).toEqual(['1', '2'])
    expect(out[0]?.kind).toBe('duplicate')
    expect(out[1]?.kind).toBe('related')
  })

  it('strips a ```json fenced block', () => {
    const raw = '```json\n[{"ids":["1","2"],"kind":"related","reason":"x"}]\n```'
    expect(parseClusters(raw, KNOWN)).toHaveLength(1)
  })

  it('returns [] on non-JSON garbage', () => {
    expect(parseClusters('the cards are similar', KNOWN)).toEqual([])
  })

  it('returns [] on non-array JSON', () => {
    expect(parseClusters('{"ids":["1","2"]}', KNOWN)).toEqual([])
  })

  it('drops clusters with ids NOT in the known set (model hallucinated ids)', () => {
    const raw = JSON.stringify([
      { ids: ['1', '2'], kind: 'related', reason: 'ok' },
      { ids: ['1', '999'], kind: 'related', reason: '999 is fake' },
    ])
    const out = parseClusters(raw, KNOWN)
    expect(out).toHaveLength(1)
    expect(out[0]?.ids).toEqual(['1', '2'])
  })

  it('drops single-card clusters (< 2 valid ids)', () => {
    const raw = JSON.stringify([{ ids: ['1'], kind: 'related', reason: 'alone' }])
    expect(parseClusters(raw, KNOWN)).toEqual([])
  })

  it('coerces numeric ids to strings', () => {
    const raw = JSON.stringify([{ ids: [1, 2], kind: 'related', reason: 'n' }])
    const out = parseClusters(raw, KNOWN)
    expect(out[0]?.ids).toEqual(['1', '2'])
  })

  it('defaults unknown kind to "related"', () => {
    const raw = JSON.stringify([{ ids: ['1', '2'], kind: 'whatever', reason: 'x' }])
    expect(parseClusters(raw, KNOWN)[0]?.kind).toBe('related')
  })

  it('caps reason length (defensive against huge model output)', () => {
    const raw = JSON.stringify([{ ids: ['1', '2'], kind: 'related', reason: 'x'.repeat(2000) }])
    expect(parseClusters(raw, KNOWN)[0]?.reason.length).toBeLessThanOrEqual(200)
  })
})

// ── applyClusters ─────────────────────────────────────────────────────────────

describe('applyClusters', () => {
  it('creates related-to arrows between every pair in a cluster', () => {
    const host = new InMemoryCanvasHost()
    const service = fakeService([fakeCard('1', 'a'), fakeCard('2', 'b'), fakeCard('3', 'c')])
    const clusters: CardCluster[] = [{ ids: ['1', '2', '3'], kind: 'related', reason: 'x' }]
    const res = applyClusters(host, clusters, service, 'canvas-1')
    expect(res.arrowsCreated).toBe(3) // 3 pairs
    expect(res.clustersApplied).toBe(1)
    const arrows = host.getElements().filter((e) => e.kind === 'arrow')
    expect(arrows).toHaveLength(3)
    expect(arrows.every((a) => a.color === 'grey' && a.dash === 'dotted' && a.arrowhead === 'arrow' && a.text === 'related-to')).toBe(true)
  })

  it('does NOT create duplicate arrows on re-apply (idempotent)', () => {
    const host = new InMemoryCanvasHost()
    const service = fakeService([fakeCard('1', 'a'), fakeCard('2', 'b')])
    const clusters: CardCluster[] = [{ ids: ['1', '2'], kind: 'related', reason: 'x' }]
    applyClusters(host, clusters, service, 'canvas-1')
    const res2 = applyClusters(host, clusters, service, 'canvas-1')
    expect(res2.arrowsCreated).toBe(0)
    expect(host.getElements().filter((e) => e.kind === 'arrow')).toHaveLength(1)
  })

  it('treats a→b and b→a as the same pair (no dup across reverse)', () => {
    const host = new InMemoryCanvasHost()
    const service = fakeService([fakeCard('1', 'a'), fakeCard('2', 'b')])
    applyClusters(host, [{ ids: ['1', '2'], kind: 'related', reason: '' }], service, 'canvas-1')
    const res2 = applyClusters(host, [{ ids: ['2', '1'], kind: 'related', reason: '' }], service, 'canvas-1')
    expect(res2.arrowsCreated).toBe(0)
  })

  it('skips clusters whose cards are soft-deleted / archived / off-canvas', () => {
    const host = new InMemoryCanvasHost()
    const deleted = fakeCard('2', 'b')
    deleted.deletedAt = new Date()
    const service = fakeService([fakeCard('1', 'a'), deleted])
    const res = applyClusters(host, [{ ids: ['1', '2'], kind: 'related', reason: '' }], service, 'canvas-1')
    expect(res.arrowsCreated).toBe(0)
    expect(res.clustersApplied).toBe(0)
  })

  it('is a no-op for an empty cluster list', () => {
    const host = new InMemoryCanvasHost()
    const service = fakeService([fakeCard('1', 'a')])
    expect(applyClusters(host, [], service, 'canvas-1')).toEqual({ arrowsCreated: 0, clustersApplied: 0 })
  })
})
