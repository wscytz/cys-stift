import { describe, it, expect } from 'vitest'
import type { Card, LinkPreview } from '@cys-stift/domain'
import { DETAIL_FIELDS } from '../field-registry'
import { buildPatch } from '../use-card-draft'

// ── 为什么有这个文件 ──────────────────────────────────────────────────────────
// buildPatch 是 useCardDraft.toPatch 的纯函数版,也是「修复 link 富字段被 clobber」
// 的关键:只把【脏】字段(草稿 ≠ Card 原值)放进 patch,未改字段不进 → service.update
// 不碰它们 → links 的 title/description/ogImage 不被 draftLinksToPayload 的有损重建
// ({url, fetchedAt: now})抹掉。与 v8-fields.sameLinkUrls「相同 URL 不重写,保住已抓
// title」同款语义。
//
// service.update「只动 patch 里有的字段」这条契约由 card-detail-fixes.test.ts 守卫;
// 这里守 buildPatch 的 per-field dirty 门控本身(精度:只发脏字段 / 召回:真编辑不漏)。

const fixedDate = new Date('2026-01-01T00:00:00Z')

function makeCard(over: Partial<Card> = {}): Card {
  return {
    id: 'c1',
    title: 'T',
    body: 'old body',
    type: 'note',
    media: [],
    links: [],
    codeSnippets: [],
    quotes: [],
    source: { kind: 'manual', deviceId: 'd' } as never,
    capturedAt: fixedDate,
    createdAt: fixedDate,
    updatedAt: fixedDate,
    tags: [],
    pinned: false,
    archived: false,
    ...over,
  } as unknown as Card
}

/** 模拟 useCardDraft 的 draft:每 field 跑 toDraft,再用用户编辑覆盖。 */
function draftOf(card: Card, overrides: Record<string, unknown>): Record<string, unknown> {
  const d: Record<string, unknown> = {}
  for (const f of DETAIL_FIELDS) d[f.key as string] = f.toDraft(card)
  return { ...d, ...overrides }
}

const richLink: LinkPreview = {
  url: 'https://x.com',
  title: 'X Site',
  description: 'desc',
  ogImageUrl: 'https://x.com/og.png',
  fetchedAt: fixedDate,
}

describe('buildPatch — per-field dirty 门控(不误伤未改字段)', () => {
  it('只改 body → patch 只含 body;links(带富字段)/title/tags 等未改字段不进 patch', () => {
    const card = makeCard({ links: [richLink] })
    const patch = buildPatch(card, draftOf(card, { body: 'new body' }), DETAIL_FIELDS)

    expect(patch.body).toBe('new body')
    // links 未改 → 不进 patch → service.update 不会用 {url, fetchedAt:now} 覆盖 → 富字段存活
    expect(patch.links).toBeUndefined()
    expect(patch.title).toBeUndefined()
    expect(patch.tags).toBeUndefined()
    expect(patch.codeSnippets).toBeUndefined()
    expect(patch.quotes).toBeUndefined()
  })

  it('真改 links → patch 含 links(无假阴性,不丢真编辑)', () => {
    const card = makeCard({ links: [{ url: 'https://a.com', fetchedAt: fixedDate }] })
    const draft = draftOf(card, {
      links: [{ url: 'https://a.com' }, { url: 'https://b.com' }],
    })
    const patch = buildPatch(card, draft, DETAIL_FIELDS)

    expect(patch.links).toBeDefined()
    expect((patch.links as Array<{ url: string }>).map((l) => l.url)).toEqual([
      'https://a.com',
      'https://b.com',
    ])
  })

  it('无改动 → 空 patch(dirty 假时 buildPatch 必空,不发无谓写)', () => {
    const card = makeCard({
      links: [richLink],
      tags: [{ value: 'a', color: 'red' } as never],
    })
    const patch = buildPatch(card, draftOf(card, {}), DETAIL_FIELDS)

    expect(Object.keys(patch)).toHaveLength(0)
  })
})
