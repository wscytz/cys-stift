import { describe, expect, it } from 'vitest'
import { InMemoryCanvasHost } from '@cys-stift/canvas-engine'
import { extractWikiLinks, syncWikiLinkArrows } from '../wiki-links'
import type { CanvasElement } from '@cys-stift/canvas-engine'

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

/** 给 host 塞一条手动 references 箭头(无 meta.wikilink,绝不应被自动逻辑删)。 */
function addManualReferenceArrow(host: InMemoryCanvasHost, from: string, to: string): string {
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
    color: 'blue',
    dash: 'dashed',
    arrowhead: 'none',
    text: 'references',
  })
  return id
}

/** 给 host 塞一条已有 wikilink 箭头(meta.wikilink=true)。 */
function addWikiLinkArrow(host: InMemoryCanvasHost, from: string, to: string): string {
  const id = 'arrow-wiki-' + from + '-' + to
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
    color: 'blue',
    dash: 'dashed',
    arrowhead: 'none',
    text: 'references',
    meta: { wikilink: true },
  })
  return id
}

describe('extractWikiLinks', () => {
  it('returns empty for body with no [[]]', () => {
    expect(extractWikiLinks('普通文本，没有链接')).toEqual([])
    expect(extractWikiLinks('')).toEqual([])
  })

  it('extracts single [[title]]', () => {
    expect(extractWikiLinks('看 [[另一张卡]]')).toEqual(['另一张卡'])
  })

  it('extracts multiple [[titles]]', () => {
    expect(extractWikiLinks('[[A]] 和 [[B]] 还有 [[C]]')).toEqual(['A', 'B', 'C'])
  })

  it('trims whitespace inside brackets', () => {
    expect(extractWikiLinks('[[  有空格  ]]')).toEqual(['有空格'])
  })

  it('dedupes keeping first occurrence order', () => {
    expect(extractWikiLinks('[[A]] [[B]] [[A]] [[C]] [[B]]')).toEqual(['A', 'B', 'C'])
  })

  it('ignores empty [[]]', () => {
    expect(extractWikiLinks('[[]] 和 [[  ]]')).toEqual([])
  })

  it('does not match single brackets', () => {
    expect(extractWikiLinks('[A] 不是双链')).toEqual([])
  })
})

describe('syncWikiLinkArrows', () => {
  it('creates a references arrow when body links an existing card by exact title', () => {
    const host = new InMemoryCanvasHost()
    addCard(host, 'src')
    addCard(host, 'tgt')
    const titles: Record<string, string> = { src: '本卡', tgt: '目标卡' }

    const r = syncWikiLinkArrows({
      host,
      getCardTitle: (id) => titles[id],
      sourceCardId: 'src',
      body: '看 [[目标卡]]',
    })

    expect(r.created).toBe(1)
    expect(r.removed).toBe(0)
    const arrows = host.getElements().filter((e) => e.kind === 'arrow')
    expect(arrows).toHaveLength(1)
    const a = arrows[0]!
    expect(a.from).toBe('src')
    expect(a.to).toBe('tgt')
    // references 签名
    expect(a.color).toBe('blue')
    expect(a.dash).toBe('dashed')
    expect(a.arrowhead).toBe('none')
    expect(a.text).toBe('references')
    expect(a.meta?.wikilink).toBe(true)
  })

  it('matches title case-insensitively', () => {
    const host = new InMemoryCanvasHost()
    addCard(host, 'src')
    addCard(host, 'tgt')
    const titles: Record<string, string> = { src: 'S', tgt: 'Login Page' }

    const r = syncWikiLinkArrows({
      host,
      getCardTitle: (id) => titles[id],
      sourceCardId: 'src',
      body: '[[login page]]',
    })
    expect(r.created).toBe(1)
  })

  it('picks the lexically-first id when multiple cards share a title', () => {
    const host = new InMemoryCanvasHost()
    addCard(host, 'src')
    addCard(host, 'tgt-b')
    addCard(host, 'tgt-a')
    const titles: Record<string, string> = { src: 'S', 'tgt-b': 'Dup', 'tgt-a': 'Dup' }

    syncWikiLinkArrows({
      host,
      getCardTitle: (id) => titles[id],
      sourceCardId: 'src',
      body: '[[Dup]]',
    })
    const arrows = host.getElements().filter((e) => e.kind === 'arrow')
    expect(arrows).toHaveLength(1)
    expect(arrows[0]!.to).toBe('tgt-a') // 字典序首
  })

  it('ignores [[]] with no matching card (creates nothing, no throw)', () => {
    const host = new InMemoryCanvasHost()
    addCard(host, 'src')
    addCard(host, 'tgt')
    const titles: Record<string, string> = { src: 'S', tgt: 'T' }

    const r = syncWikiLinkArrows({
      host,
      getCardTitle: (id) => titles[id],
      sourceCardId: 'src',
      body: '[[不存在的卡]]',
    })
    expect(r.created).toBe(0)
    expect(r.removed).toBe(0)
    expect(host.getElements().filter((e) => e.kind === 'arrow')).toHaveLength(0)
  })

  it('creates nothing when body has no [[]]', () => {
    const host = new InMemoryCanvasHost()
    addCard(host, 'src')
    addCard(host, 'tgt')
    const titles: Record<string, string> = { src: 'S', tgt: 'T' }

    const r = syncWikiLinkArrows({
      host,
      getCardTitle: (id) => titles[id],
      sourceCardId: 'src',
      body: '普通正文',
    })
    expect(r.created).toBe(0)
    expect(r.removed).toBe(0)
  })

  it('removes stale wikilink arrow when body changes to drop a link', () => {
    const host = new InMemoryCanvasHost()
    addCard(host, 'src')
    addCard(host, 'tgt')
    const titles: Record<string, string> = { src: 'S', tgt: 'T' }

    // 第一次:建立 src→tgt wikilink
    syncWikiLinkArrows({
      host,
      getCardTitle: (id) => titles[id],
      sourceCardId: 'src',
      body: '[[T]]',
    })
    expect(host.getElements().filter((e) => e.kind === 'arrow')).toHaveLength(1)

    // 第二次:body 不再含 [[T]] → 删
    const r = syncWikiLinkArrows({
      host,
      getCardTitle: (id) => titles[id],
      sourceCardId: 'src',
      body: '现在没链接了',
    })
    expect(r.created).toBe(0)
    expect(r.removed).toBe(1)
    expect(host.getElements().filter((e) => e.kind === 'arrow')).toHaveLength(0)
  })

  it('swaps: removes old target arrow, creates new target arrow when link changes', () => {
    const host = new InMemoryCanvasHost()
    addCard(host, 'src')
    addCard(host, 'old')
    addCard(host, 'new')
    const titles: Record<string, string> = { src: 'S', old: 'Old', new: 'New' }

    syncWikiLinkArrows({
      host,
      getCardTitle: (id) => titles[id],
      sourceCardId: 'src',
      body: '[[Old]]',
    })

    const r = syncWikiLinkArrows({
      host,
      getCardTitle: (id) => titles[id],
      sourceCardId: 'src',
      body: '[[New]]',
    })
    expect(r.created).toBe(1)
    expect(r.removed).toBe(1)
    const arrows = host.getElements().filter((e) => e.kind === 'arrow')
    expect(arrows).toHaveLength(1)
    expect(arrows[0]!.to).toBe('new')
  })

  it('NEVER deletes a manual (non-wikilink) references arrow', () => {
    const host = new InMemoryCanvasHost()
    addCard(host, 'src')
    addCard(host, 'tgt')
    const manualId = addManualReferenceArrow(host, 'src', 'tgt')
    const titles: Record<string, string> = { src: 'S', tgt: 'T' }

    // body 无双链 → 即使有 src→tgt references 箭头,只要不是 wikilink,不动
    const r = syncWikiLinkArrows({
      host,
      getCardTitle: (id) => titles[id],
      sourceCardId: 'src',
      body: '没链接',
    })
    expect(r.removed).toBe(0)
    expect(host.getElement(manualId)).toBeDefined()
  })

  it('keeps manual references arrow even when body links the same target (no dup wikilink needed, but manual survives)', () => {
    const host = new InMemoryCanvasHost()
    addCard(host, 'src')
    addCard(host, 'tgt')
    const manualId = addManualReferenceArrow(host, 'src', 'tgt')
    const titles: Record<string, string> = { src: 'S', tgt: 'T' }

    const r = syncWikiLinkArrows({
      host,
      getCardTitle: (id) => titles[id],
      sourceCardId: 'src',
      body: '[[T]]',
    })
    // 手动箭头仍在
    expect(host.getElement(manualId)).toBeDefined()
    // 又建了一条 wikilink(因为是独立箭头)
    expect(r.created).toBe(1)
    const wikiArrows = host
      .getElements()
      .filter((e) => e.kind === 'arrow' && e.meta?.wikilink === true)
    expect(wikiArrows).toHaveLength(1)
  })

  it('does not duplicate a wikilink arrow on re-sync with same body', () => {
    const host = new InMemoryCanvasHost()
    addCard(host, 'src')
    addCard(host, 'tgt')
    const titles: Record<string, string> = { src: 'S', tgt: 'T' }

    const opts = {
      host,
      getCardTitle: (id: string) => titles[id],
      sourceCardId: 'src',
      body: '[[T]]',
    } as const
    syncWikiLinkArrows(opts)
    const r = syncWikiLinkArrows(opts)
    expect(r.created).toBe(0)
    expect(r.removed).toBe(0)
    expect(host.getElements().filter((e) => e.kind === 'arrow')).toHaveLength(1)
  })

  it('handles circular reference A[[B]] / B[[A]] as two arrows', () => {
    const host = new InMemoryCanvasHost()
    addCard(host, 'a')
    addCard(host, 'b')
    const titles: Record<string, string> = { a: 'A', b: 'B' }

    const ra = syncWikiLinkArrows({
      host,
      getCardTitle: (id) => titles[id],
      sourceCardId: 'a',
      body: '[[B]]',
    })
    const rb = syncWikiLinkArrows({
      host,
      getCardTitle: (id) => titles[id],
      sourceCardId: 'b',
      body: '[[A]]',
    })
    expect(ra.created).toBe(1)
    expect(rb.created).toBe(1)
    const arrows = host.getElements().filter((e) => e.kind === 'arrow')
    expect(arrows).toHaveLength(2)
    const targets = arrows.map((a) => `${a.from}->${a.to}`).sort()
    expect(targets).toEqual(['a->b', 'b->a'])
  })

  it('excludes self: [[本卡标题]] does not create self-loop', () => {
    const host = new InMemoryCanvasHost()
    addCard(host, 'src')
    addCard(host, 'tgt')
    const titles: Record<string, string> = { src: 'S', tgt: 'S' } // 两个同名卡

    const r = syncWikiLinkArrows({
      host,
      getCardTitle: (id) => titles[id],
      sourceCardId: 'src',
      body: '[[S]]',
    })
    // 本卡自身排除 → 只剩 tgt(同名)→ 建 src→tgt
    expect(r.created).toBe(1)
    const arrows = host.getElements().filter((e) => e.kind === 'arrow')
    expect(arrows[0]!.to).toBe('tgt')
    expect(arrows[0]!.from).toBe('src')
  })

  it('creates multiple arrows for multiple distinct links in one body', () => {
    const host = new InMemoryCanvasHost()
    addCard(host, 'src')
    addCard(host, 'b')
    addCard(host, 'c')
    const titles: Record<string, string> = { src: 'S', b: 'B', c: 'C' }

    const r = syncWikiLinkArrows({
      host,
      getCardTitle: (id) => titles[id],
      sourceCardId: 'src',
      body: '[[B]] 和 [[C]]',
    })
    expect(r.created).toBe(2)
  })

  it('only touches wikilink arrows where from === sourceCardId (does not delete incoming wikilinks)', () => {
    const host = new InMemoryCanvasHost()
    addCard(host, 'src')
    addCard(host, 'tgt')
    // 一条别人指向 src 的 wikilink 箭头(不是本卡发出)
    const incoming = addWikiLinkArrow(host, 'tgt', 'src')
    const titles: Record<string, string> = { src: 'S', tgt: 'T' }

    syncWikiLinkArrows({
      host,
      getCardTitle: (id) => titles[id],
      sourceCardId: 'src',
      body: '没链接',
    })
    // 不该删 incoming
    expect(host.getElement(incoming)).toBeDefined()
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

    syncWikiLinkArrows({
      host,
      getCardTitle: (id) => titles[id],
      sourceCardId: 'src',
      body: '[[B]] [[C]]',
    })
    expect(batchCalls).toBe(1)
  })

  it('returns zeros and changes nothing when host has no target cards at all', () => {
    const host = new InMemoryCanvasHost()
    addCard(host, 'src') // 只有本卡
    const titles: Record<string, string> = { src: 'S' }

    const r = syncWikiLinkArrows({
      host,
      getCardTitle: (id) => titles[id],
      sourceCardId: 'src',
      body: '[[任何人]]',
    })
    expect(r.created).toBe(0)
    expect(r.removed).toBe(0)
  })
})
