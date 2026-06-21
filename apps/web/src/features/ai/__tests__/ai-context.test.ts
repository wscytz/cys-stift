import { describe, it, expect } from 'vitest'
import {
  serializeCardForAI,
  serializeCardsForAI,
  AI_CARD_FIELDS,
  AI_REDACTED_FIELDS,
} from '../ai-context'
import type { Card } from '@cys-stift/domain'

function card(
  overrides: Partial<Card> & { title?: string; body?: string } = {},
): Card {
  return {
    id: overrides.id ?? ('c1' as never),
    title: overrides.title ?? 'Test card',
    body: overrides.body ?? 'Some body text',
    type: overrides.type ?? 'note',
    media: overrides.media ?? [],
    links: overrides.links ?? [],
    codeSnippets: overrides.codeSnippets ?? [],
    quotes: overrides.quotes ?? [],
    tags: overrides.tags ?? [],
    source: overrides.source ?? ({ kind: 'manual', deviceId: 'device-xyz' } as never),
    capturedAt: overrides.capturedAt ?? new Date('2026-06-01T00:00:00Z'),
    createdAt: overrides.createdAt ?? new Date('2026-06-01T00:00:00Z'),
    updatedAt: overrides.updatedAt ?? new Date('2026-06-01T00:00:00Z'),
    pinned: overrides.pinned ?? false,
    archived: overrides.archived ?? false,
    color: overrides.color,
    canvasPosition: overrides.canvasPosition,
    deletedAt: overrides.deletedAt,
  }
}

describe('AI_CARD_FIELDS allowlist', () => {
  it('serializes a card with title, body, type, and timestamp', () => {
    const output = serializeCardForAI(card())
    expect(output).toContain('title: Test card')
    expect(output).toContain('body: Some body text')
    expect(output).toContain('type: note')
    expect(output).toContain('capturedAt: 2026-06-01')
  })

  it('includes source kind but NOT deviceId', () => {
    const c = card({
      source: { kind: 'shortcut', shortcutId: 'cmd-x', deviceId: 'my-secret-device-123' } as never,
    })
    const output = serializeCardForAI(c)
    expect(output).toContain('sourceKind: shortcut')
    expect(output).not.toContain('device')
    expect(output).not.toContain('my-secret-device-123')
    expect(output).not.toContain('deviceId')
  })

  it('returns empty string for soft-deleted card', () => {
    const c = card({ deletedAt: new Date() })
    expect(serializeCardForAI(c)).toBe('')
  })

  it('includes media metadata but never dataUrl or assetId', () => {
    const c = card({
      media: [
        { assetId: 'ma-xxx' as never, order: 0, kind: 'image' } as never,
        { assetId: 'ma-yyy' as never, order: 1, kind: 'file' } as never,
      ],
    })
    const output = serializeCardForAI(c)
    expect(output).toContain('mediaCount: 2')
    expect(output).toContain('mediaKinds: image, file')
    // dataUrl must never appear
    expect(output).not.toContain('data:')
    expect(output).not.toContain('base64')
    // assetId must never appear
    expect(output).not.toContain('ma-xxx')
    expect(output).not.toContain('ma-yyy')
  })

  it('includes tags', () => {
    const c = card({
      tags: [
        { value: 'urgent', color: 'var(--color-red)' },
        { value: 'idea', color: 'var(--color-yellow)' },
      ],
    })
    const output = serializeCardForAI(c)
    expect(output).toContain('tags: urgent, idea')
  })

  it('skips empty arrays', () => {
    const c = card({ links: [], codeSnippets: [], quotes: [], tags: [], media: [] })
    const output = serializeCardForAI(c)
    expect(output).not.toContain('links:')
    expect(output).not.toContain('code:')
    expect(output).not.toContain('quotes:')
    expect(output).not.toContain('tags:')
    expect(output).not.toContain('mediaKinds:')
  })

  it('includes links as URLs/titles', () => {
    const c = card({
      links: [
        { url: 'https://example.com', title: 'Example', fetchedAt: new Date() },
      ],
    })
    const output = serializeCardForAI(c)
    expect(output).toContain('links: Example')
  })

  it('includes code snippets with language prefix', () => {
    const c = card({
      codeSnippets: [{ language: 'ts', code: 'const x = 1' }],
    })
    const output = serializeCardForAI(c)
    expect(output).toContain('code: [ts] const x = 1')
  })

  it('includes pinned state only when true', () => {
    const pinned = card({ pinned: true })
    expect(serializeCardForAI(pinned)).toContain('pinned: yes')

    const unpinned = card({ pinned: false })
    expect(serializeCardForAI(unpinned)).not.toContain('pinned:')
  })

  it('includes canvasId when card is on canvas', () => {
    const onCanvas = card({
      canvasPosition: {
        canvasId: 'canvas-1' as never,
        x: 0, y: 0, w: 200, h: 100, z: 0,
      },
    })
    expect(serializeCardForAI(onCanvas)).toContain('canvasId: canvas-1')

    const inInbox = card({ canvasPosition: undefined })
    expect(serializeCardForAI(inInbox)).not.toContain('canvasId:')
  })

  it('includes color when set', () => {
    const colored = card({ color: 'red' })
    expect(serializeCardForAI(colored)).toContain('color: red')
  })
})

describe('serializeCardsForAI', () => {
  it('serializes multiple cards with DSL headers and matching ids', () => {
    const c1 = card({ id: 'a1' as never, title: 'First' })
    const c2 = card({ id: 'a2' as never, title: 'Second' })
    const output = serializeCardsForAI([c1, c2])
    // The output uses String(c.id) for the header; verify the ids appear.
    expect(output).toContain('[card #a1]')
    expect(output).toContain('First')
    expect(output).toContain('[card #a2]')
    expect(output).toContain('Second')
  })

  it('filters out soft-deleted cards', () => {
    const cards = [
      card({ id: 'a1' as never, title: 'Visible' }),
      card({ id: 'a2' as never, title: 'Hidden', deletedAt: new Date() }),
    ]
    const output = serializeCardsForAI(cards)
    expect(output).toContain('Visible')
    expect(output).not.toContain('Hidden')
    expect(output).not.toContain('#a2')
  })

  it('returns empty string when all cards are soft-deleted', () => {
    const cards = [card({ deletedAt: new Date() })]
    expect(serializeCardsForAI(cards)).toBe('')
  })
})

describe('AI_REDACTED_FIELDS', () => {
  it('lists known sensitive fields', () => {
    expect(AI_REDACTED_FIELDS).toContain('source.deviceId')
    expect(AI_REDACTED_FIELDS).toContain('media[].dataUrl')
    expect(AI_REDACTED_FIELDS).toContain('deletedAt')
    expect(AI_REDACTED_FIELDS).toContain('apiKey')
  })
})

describe('AI_CARD_FIELDS — every Card field accounted for', () => {
  it('all text/core fields are in the allowlist', () => {
    const keys = Object.keys(AI_CARD_FIELDS)
    expect(keys).toContain('title')
    expect(keys).toContain('body')
    expect(keys).toContain('type')
    expect(keys).toContain('capturedAt')
    expect(keys).toContain('sourceKind')
    expect(keys).toContain('tags')
  })
})
