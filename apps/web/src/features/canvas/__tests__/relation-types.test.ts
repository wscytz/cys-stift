import { describe, it, expect } from 'vitest'
import {
  RELATION_TYPES,
  relationTypeById,
  inferRelationType,
  type RelationTypeId,
} from '../relation-types'
import { inferRelationTypeFromContext } from '../relation-inference'
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

describe('inferRelationType (props → registry)', () => {
  it('matches blocks props', () => {
    const t = RELATION_TYPES.find((r) => r.id === 'blocks')!
    expect(inferRelationType({ color: t.color, dash: t.dash, arrowheadEnd: t.arrowhead, labelColor: t.labelColor })?.id).toBe('blocks')
  })
  it('matches references props', () => {
    const t = RELATION_TYPES.find((r) => r.id === 'references')!
    expect(inferRelationType({ color: t.color, dash: t.dash, arrowheadEnd: t.arrowhead, labelColor: t.labelColor })?.id).toBe('references')
  })
  it('returns null when props differ from every registry type', () => {
    expect(inferRelationType({ color: 'orange', dash: 'dotted', arrowheadEnd: 'diamond', labelColor: 'red' })).toBeNull()
  })
  it('returns null for empty props', () => {
    expect(inferRelationType({})).toBeNull()
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
