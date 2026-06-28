import { describe, expect, it } from 'vitest'
import { InMemoryCanvasHost } from '@cys-stift/canvas-engine'
import { extractEmbeds, syncEmbedArrows, resolveCardByTitle } from '../embed-links'
import type { Card, CardId } from '@cys-stift/domain'

/** 构造一张 Card(只关心 id + title;embed-links 不碰其他字段)。 */
function card(id: string, title: string): Card {
  return {
    id: id as CardId,
    title,
    body: '',
    type: 'note',
    media: [],
    links: [],
    codeSnippets: [],
    quotes: [],
    source: { kind: 'manual', deviceId: 'd' },
    capturedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: [],
    archived: false,
    pinned: false,
  }
}

/** 给 host 塞一个 card 元素(让目标卡在画布上可见,且 from/to 解析得到)。 */
function addCard(host: InMemoryCanvasHost, id: string): void {
  host.upsert({
    id,
    kind: 'card',
    x: 0,
    y: 0,
    w: 100,
    h: 60,
    rotation: 0,
  })
}

/** 给 host 塞一条手动 embeds 箭头(无 meta.embed,绝不应被自动逻辑删)。 */
function addManualEmbedArrow(host: InMemoryCanvasHost, from: string, to: string): string {
  const id = 'arrow-manual-' + from + '-' + to
  host.upsert({
    id,
    kind: 'arrow',
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    rotation: 0,
    from,
    to,
    color: 'yellow',
    dash: 'dotted',
    arrowhead: 'none',
    text: 'embeds',
  })
  return id
}

describe('extractEmbeds', () => {
  it('returns empty for body with no (())', () => {
    expect(extractEmbeds('普通文本，没有嵌入')).toEqual([])
    expect(extractEmbeds('')).toEqual([])
  })

  it('extracts single ((title))', () => {
    expect(extractEmbeds('嵌入 ((另一张卡))')).toEqual(['另一张卡'])
  })

  it('extracts multiple ((titles)) and dedupes keeping order', () => {
    expect(extractEmbeds('((A)) 和 ((B)) 还有 ((A))')).toEqual(['A', 'B'])
  })

  it('trims whitespace and ignores empty (())', () => {
    expect(extractEmbeds('((  有空格  ))')).toEqual(['有空格'])
    expect(extractEmbeds('(() 和 ((  ))')).toEqual([])
  })

  it('does not match single parens', () => {
    expect(extractEmbeds('(A) 不是嵌入')).toEqual([])
  })
})

describe('resolveCardByTitle', () => {
  it('returns the card id for an exact case-insensitive title match', () => {
    const cards = [card('a', 'Login'), card('b', 'Settings')]
    expect(resolveCardByTitle(cards, 'login')).toBe('a' as CardId)
  })

  it('picks the lexically-first id when multiple cards share a title', () => {
    const cards = [card('b', 'Dup'), card('a', 'Dup')]
    expect(resolveCardByTitle(cards, 'dup')).toBe('a' as CardId)
  })

  it('returns null when no card matches', () => {
    expect(resolveCardByTitle([card('a', 'X')], '不存在')).toBeNull()
  })
})

describe('syncEmbedArrows', () => {
  it('creates an embeds arrow with yellow/dotted signature when body embeds an existing card', () => {
    const host = new InMemoryCanvasHost()
    addCard(host, 'src')
    addCard(host, 'tgt')
    const titles: Record<string, string> = { src: '本卡', tgt: '目标卡' }

    const r = syncEmbedArrows({
      host,
      getCardTitle: (id) => titles[id],
      sourceCardId: 'src',
      body: '嵌入 ((目标卡))',
    })

    expect(r.created).toBe(1)
    expect(r.removed).toBe(0)
    const arrows = host.getElements().filter((e) => e.kind === 'arrow')
    expect(arrows).toHaveLength(1)
    const a = arrows[0]!
    expect(a.from).toBe('src')
    expect(a.to).toBe('tgt')
    // embeds 签名
    expect(a.color).toBe('yellow')
    expect(a.dash).toBe('dotted')
    expect(a.arrowhead).toBe('none')
    expect(a.text).toBe('embeds')
    expect(a.meta?.embed).toBe(true)
  })

  it('removes a stale embed arrow when body drops the embed', () => {
    const host = new InMemoryCanvasHost()
    addCard(host, 'src')
    addCard(host, 'tgt')
    const titles: Record<string, string> = { src: 'S', tgt: 'T' }

    syncEmbedArrows({
      host,
      getCardTitle: (id) => titles[id],
      sourceCardId: 'src',
      body: '((T))',
    })
    expect(host.getElements().filter((e) => e.kind === 'arrow')).toHaveLength(1)

    const r = syncEmbedArrows({
      host,
      getCardTitle: (id) => titles[id],
      sourceCardId: 'src',
      body: '现在没嵌入了',
    })
    expect(r.created).toBe(0)
    expect(r.removed).toBe(1)
    expect(host.getElements().filter((e) => e.kind === 'arrow')).toHaveLength(0)
  })

  it('NEVER deletes a manual (non-embed) embeds arrow', () => {
    const host = new InMemoryCanvasHost()
    addCard(host, 'src')
    addCard(host, 'tgt')
    const manualId = addManualEmbedArrow(host, 'src', 'tgt')
    const titles: Record<string, string> = { src: 'S', tgt: 'T' }

    const r = syncEmbedArrows({
      host,
      getCardTitle: (id) => titles[id],
      sourceCardId: 'src',
      body: '没嵌入',
    })
    expect(r.removed).toBe(0)
    expect(host.getElement(manualId)).toBeDefined()
  })

  it('does not duplicate an embed arrow on re-sync with same body', () => {
    const host = new InMemoryCanvasHost()
    addCard(host, 'src')
    addCard(host, 'tgt')
    const titles: Record<string, string> = { src: 'S', tgt: 'T' }

    const opts = {
      host,
      getCardTitle: (id: string) => titles[id],
      sourceCardId: 'src',
      body: '((T))',
    } as const
    syncEmbedArrows(opts)
    const r = syncEmbedArrows(opts)
    expect(r.created).toBe(0)
    expect(r.removed).toBe(0)
    expect(host.getElements().filter((e) => e.kind === 'arrow')).toHaveLength(1)
  })

  it('excludes self: ((本卡标题)) does not create a self-loop', () => {
    const host = new InMemoryCanvasHost()
    addCard(host, 'src')
    addCard(host, 'tgt')
    const titles: Record<string, string> = { src: 'S', tgt: 'S' } // 两个同名卡

    const r = syncEmbedArrows({
      host,
      getCardTitle: (id) => titles[id],
      sourceCardId: 'src',
      body: '((S))',
    })
    expect(r.created).toBe(1)
    const a = host.getElements().filter((e) => e.kind === 'arrow')[0]!
    expect(a.from).toBe('src')
    expect(a.to).toBe('tgt') // 排除本卡自身,落到同名 tgt
  })

  it('batch-wraps the diff in a single undo step', () => {
    const host = new InMemoryCanvasHost()
    addCard(host, 'src')
    addCard(host, 'b')
    addCard(host, 'c')
    const titles: Record<string, string> = { src: 'S', b: 'B', c: 'C' }

    let batchCalls = 0
    const realBatch = host.batch.bind(host)
    host.batch = (fn: () => void) => {
      batchCalls++
      realBatch(fn)
    }

    syncEmbedArrows({
      host,
      getCardTitle: (id) => titles[id],
      sourceCardId: 'src',
      body: '((B)) ((C))',
    })
    expect(batchCalls).toBe(1)
  })
})
