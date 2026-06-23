import { describe, it, expect } from 'vitest'
import {
  RELATION_TYPES,
  relationTypeById,
  inferRelationType,
  applyRelationType,
  type RelationTypeId,
} from '../relation-types'
import { inferRelationTypeFromContext } from '../relation-inference'
import { InMemoryCanvasHost } from '../host/in-memory-host'
import type { CanvasElement } from '../host/canvas-host'
import type { Card } from '@cys-stift/domain'

// Minimal Card-like objects for context inference.
function card(title: string, body = ''): Card {
  return {
    id: 'x' as never,
    title,
    body,
    type: 'note',
    media: [],
    links: [],
    codeSnippets: [],
    quotes: [],
    source: { kind: 'manual', deviceId: 'dev' } as never,
    capturedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    pinned: false,
    archived: false,
  }
}

describe('relationTypeById', () => {
  it('finds known types', () => {
    expect(relationTypeById('blocks')?.id).toBe('blocks')
    expect(relationTypeById('related-to')?.id).toBe('related-to')
  })
  it('returns undefined for unknown', () => {
    expect(relationTypeById('unknown' as RelationTypeId)).toBeUndefined()
  })
})

describe('inferRelationType (from CanvasElement)', () => {
  const baseArrow = (over: Partial<CanvasElement> = {}): CanvasElement => ({
    id: 'a',
    kind: 'arrow',
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    rotation: 0,
    from: 's',
    to: 't',
    ...over,
  })
  it('matches blocks (color+text)', () => {
    const t = RELATION_TYPES.find((r) => r.id === 'blocks')!
    expect(inferRelationType(baseArrow({ color: t.color, text: t.id }))?.id).toBe('blocks')
  })
  it('matches references (color+text)', () => {
    const t = RELATION_TYPES.find((r) => r.id === 'references')!
    expect(inferRelationType(baseArrow({ color: t.color, text: t.id }))?.id).toBe('references')
  })
  it('returns null when color/text differ from every registry type', () => {
    expect(inferRelationType(baseArrow({ color: 'orange', text: 'whatever' }))).toBeNull()
  })
  it('returns null for arrow with no color/text', () => {
    expect(inferRelationType(baseArrow())).toBeNull()
  })
})

describe('applyRelationType (via host.upsert)', () => {
  it('rewrites the arrow color + text', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({
      id: 'a',
      kind: 'arrow',
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      rotation: 0,
      from: 's',
      to: 't',
    })
    const rt = RELATION_TYPES[0]! // blocks (color red)
    applyRelationType(host, 'a', rt, 'blocks')
    const el = host.getElement('a')!
    expect(el.color).toBe(rt.color)
    expect(el.text).toBe('blocks')
  })
  it('writes the full visual signature: dash + arrowhead (语义三维签名)', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'a', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 's', to: 't' })
    const refs = RELATION_TYPES.find((r) => r.id === 'references')! // blue dashed none
    applyRelationType(host, 'a', refs, 'references')
    const el = host.getElement('a')!
    expect(el.color).toBe(refs.color)
    expect(el.dash).toBe(refs.dash)
    expect(el.arrowhead).toBe(refs.arrowhead)
  })
  it('no-ops on a non-arrow element', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({
      id: 'c',
      kind: 'rect',
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      rotation: 0,
    })
    const rt = RELATION_TYPES[0]!
    applyRelationType(host, 'c', rt, 'blocks')
    const el = host.getElement('c')!
    expect(el.color).toBeUndefined()
    expect(el.text).toBeUndefined()
  })
})

describe('inferRelationTypeFromContext (keyword matching)', () => {
  it('returns blocks for high block-keyword density', () => {
    const r = inferRelationTypeFromContext(
      card('Fix login bug', '这是阻塞项 block todo 需要等待'),
      card('Login page', ''),
    )
    expect(r?.id).toBe('blocks')
  })

  it('returns references for link/ref keywords', () => {
    const r = inferRelationTypeFromContext(
      card('API doc', 'see also the reference 参见链接'),
      card(''),
    )
    expect(r?.id).toBe('references')
  })

  it('returns derived-from for derivation keywords', () => {
    const r = inferRelationTypeFromContext(
      card('New design', 'derived from v1 based on 源自旧版'),
      card('Old design', '出自从 sketch'),
    )
    expect(r?.id).toBe('derived-from')
  })

  it('returns related-to for similarity keywords', () => {
    const r = inferRelationTypeFromContext(
      card('Idea A', ''),
      card('Idea B', '相关 similar'),
    )
    expect(r?.id).toBe('related-to')
  })

  it('returns null when nothing matches', () => {
    const r = inferRelationTypeFromContext(
      card('Hello World', 'nothing relevant here'),
      card('Random text', 'also nothing'),
    )
    expect(r).toBeNull()
  })

  it('returns null when both source and target are null/undefined', () => {
    expect(inferRelationTypeFromContext(null, null)).toBeNull()
  })

  it('case-insensitive keyword matching', () => {
    const r = inferRelationTypeFromContext(
      card('', 'BLOCKER TODO ref LINK'),
      card('', ''),
    )
    // "BLOCKER TODO" → 2 blocks hits, "ref LINK" → 2 refs hits. blocks score 2 > refs score 2 → blocks (tie-break: blocks before references in registry order).
    // Actually both score 2 → blocks wins on registry order (first).
    expect(r?.id).toBe('blocks')
  })

  it('tie-break: blocks > references > derived-from > related-to (registry order)', () => {
    const r = inferRelationTypeFromContext(
      card('', '阻塞 引用 衍生 related'),
      card('', ''),
    )
    // Each has exactly 1 keyword hit. Registry order: blocks first with score 1 → wins.
    expect(r?.id).toBe('blocks')
  })
})
