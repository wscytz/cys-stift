import { describe, expect, it } from 'vitest'
import { InMemoryCanvasHost } from '@cys-stift/canvas-engine'
import {
  extractWikiLinks,
  matchWikiLinkTitle,
  resyncWikiLinksForTitleChange,
  syncAllWikiLinks,
  syncWikiLinkArrows,
} from '../wiki-links'
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

describe('matchWikiLinkTitle', () => {
  it('exact (case-insensitive) wins over fuzzy', () => {
    const candidates = [
      { id: 'a', title: 'Jones' },
      { id: 'b', title: 'Jones Exact' }, // 模糊近邻
      { id: 'c', title: 'jones' }, // 精确(归一化后 = 'jones')
    ]
    // 查 'Jones' → 精确命中(归一化都是 'jones'),多精确取字典序首 = a
    expect(matchWikiLinkTitle('Jones', candidates, '')).toBe('a')
  })

  it('exact none → fuzzy (Jone → Jones, distance 1) hits', () => {
    const candidates = [{ id: 'a', title: 'Jones' }]
    // 'Jone' vs 'Jones' = 1 次添加,长度 ≥ 3,距离 ≤ 2 → 命中
    expect(matchWikiLinkTitle('Jone', candidates, '')).toBe('a')
  })

  it('distance > 2 (Jon → JonathanSmith) → undefined', () => {
    const candidates = [{ id: 'a', title: 'JonathanSmith' }]
    // 'Jon' vs 'JonathanSmith' 距离 >> 2 → 不链
    expect(matchWikiLinkTitle('Jon', candidates, '')).toBeUndefined()
  })

  it('length < 3 candidates excluded from fuzzy', () => {
    // 'Jo' 长度 < 3 即便距离小也不参与模糊。
    // 唯一候选 'Jo'(长度 2)应被排除 → undefined。
    const candidates = [{ id: 'a', title: 'Jo' }]
    expect(matchWikiLinkTitle('Joo', candidates, '')).toBeUndefined()
  })

  it('multiple fuzzy candidates → smallest distance; ties → dict-order first', () => {
    // 查 'Jone'.候选 'Jones'(dist 1) 和 'Jonex'(dist 1)并列 → 字典序首(id='a')
    const candidates = [
      { id: 'b', title: 'Jonex' },
      { id: 'a', title: 'Jones' },
    ]
    expect(matchWikiLinkTitle('Jone', candidates, '')).toBe('a')
  })

  it('smallest distance wins over larger distance fuzzy', () => {
    // 查 'Jone'.候选 'Jones'(dist 1) 和 'Joness'(dist 2) → 取距离更小的 'Jones'
    const candidates = [
      { id: 'a', title: 'Joness' },
      { id: 'b', title: 'Jones' },
    ]
    expect(matchWikiLinkTitle('Jone', candidates, '')).toBe('b')
  })

  it('selfId excluded (exact match on self does not return self) → falls to fuzzy', () => {
    const candidates = [
      { id: 'self', title: 'Jones' },
      { id: 'other', title: 'Jonesy' },
    ]
    // 查 'Jones' 精确命中 'self',但 selfId='self' 被排除 → 退到模糊,命中 'other'
    expect(matchWikiLinkTitle('Jones', candidates, 'self')).toBe('other')
  })

  it('selfId excluded in fuzzy too', () => {
    const candidates = [{ id: 'self', title: 'Jones' }]
    // 查 'Jone' 模糊命中 'Jones',但 self 是 'self' → undefined
    expect(matchWikiLinkTitle('Jone', candidates, 'self')).toBeUndefined()
  })

  it('empty candidates → undefined', () => {
    expect(matchWikiLinkTitle('Anything', [], '')).toBeUndefined()
  })

  it('exact (no fuzzy needed) ignores self only when self matches', () => {
    // 防回归:self 是精确命中候选之一,但还有其他精确命中。
    const candidates = [
      { id: 'self', title: 'Dup' },
      { id: 'b', title: 'Dup' },
    ]
    // 排除 self 后剩 'b' 是精确命中 → 'b'
    expect(matchWikiLinkTitle('Dup', candidates, 'self')).toBe('b')
  })
})

describe('matchWikiLinkTitle (cross-canvas, same-canvas preferred)', () => {
  it('exact: same-canvas hit preferred over cross-canvas hit (both exact)', () => {
    // 两张精确命中卡:'same'(本画布) + 'other'(跨画布)。
    // 同画布优先 → 选 'same'(尽管 'other' id 字典序更小)。
    const candidates = [
      { id: 'aaa', title: 'Dup', canvasId: 'canvas-other' },
      { id: 'zzz', title: 'Dup', canvasId: 'canvas-self' },
    ]
    expect(matchWikiLinkTitle('Dup', candidates, 'src', 'canvas-self')).toBe('zzz')
  })

  it('exact: same-canvas preference among multiple same-canvas hits (dict-order)', () => {
    // 多张同画布精确命中 → 字典序首(同原逻辑)。
    const candidates = [
      { id: 'b', title: 'Dup', canvasId: 'canvas-self' },
      { id: 'a', title: 'Dup', canvasId: 'canvas-self' },
    ]
    expect(matchWikiLinkTitle('Dup', candidates, 'src', 'canvas-self')).toBe('a')
  })

  it('exact: no same-canvas → cross-canvas exact still wins (exact beats fuzzy)', () => {
    // 精确命中只有跨画布卡 → 仍选它(精确优先于模糊)。
    const candidates = [{ id: 'x', title: 'Target', canvasId: 'canvas-other' }]
    expect(matchWikiLinkTitle('Target', candidates, 'src', 'canvas-self')).toBe('x')
  })

  it('fuzzy: same-canvas preferred among distance-tied fuzzy hits', () => {
    // 两张模糊并列(distance 1):'same'(本画布) + 'other'(跨画布)。
    // 同画布优先 → 选 'same'(尽管 'other' id 字典序更小)。
    const candidates = [
      { id: 'aaa', title: 'Jones', canvasId: 'canvas-other' },
      { id: 'zzz', title: 'Jones', canvasId: 'canvas-self' },
    ]
    // 查 'Jone' → 两张 distance 1 并列 → 同画布优先 → 'zzz'
    expect(matchWikiLinkTitle('Jone', candidates, 'src', 'canvas-self')).toBe('zzz')
  })

  it('fuzzy: smaller distance beats same-canvas (preference is tiebreaker only)', () => {
    // 同画布卡距离 2,跨画布卡距离 1 → 距离优先(同画布只是并列打破器)。
    const candidates = [
      { id: 'near', title: 'Jone', canvasId: 'canvas-other' }, // distance 0 实际
      { id: 'far', title: 'Joness', canvasId: 'canvas-self' }, // distance 2
    ]
    expect(matchWikiLinkTitle('Jone', candidates, 'src', 'canvas-self')).toBe('near')
  })

  it('no currentCanvasId → no same-canvas preference (backward compat)', () => {
    // 不传 currentCanvasId → 同画布优先不生效,退回纯字典序(向后兼容)。
    const candidates = [
      { id: 'aaa', title: 'Dup', canvasId: 'canvas-other' },
      { id: 'zzz', title: 'Dup', canvasId: 'canvas-self' },
    ]
    expect(matchWikiLinkTitle('Dup', candidates, 'src')).toBe('aaa')
  })

  it('candidates without canvasId (inbox) never same-canvas preferred', () => {
    // inbox 卡(canvasId undefined) + 跨画布卡 → 都不是同画布 → 字典序首。
    const candidates = [
      { id: 'inbox', title: 'Dup' }, // canvasId undefined
      { id: 'other', title: 'Dup', canvasId: 'canvas-other' },
    ]
    expect(matchWikiLinkTitle('Dup', candidates, 'src', 'canvas-self')).toBe('inbox')
  })
})

describe('syncWikiLinkArrows (fuzzy)', () => {
  it('creates arrow when body has typo of an existing card title (fuzzy hit)', () => {
    const host = new InMemoryCanvasHost()
    addCard(host, 'src')
    addCard(host, 'tgt')
    const titles: Record<string, string> = { src: 'S', tgt: 'Jones' }

    const r = syncWikiLinkArrows({
      host,
      getCardTitle: (id) => titles[id],
      sourceCardId: 'src',
      body: 'see [[Joens]]', // typo,距离 2(transposition)+ trim
    })

    expect(r.created).toBe(1)
    const arrows = host.getElements().filter((e) => e.kind === 'arrow')
    expect(arrows).toHaveLength(1)
    expect(arrows[0]!.to).toBe('tgt')
    expect(arrows[0]!.meta?.wikilink).toBe(true)
  })

  it('creates no arrow when body link has no close match (undefined)', () => {
    const host = new InMemoryCanvasHost()
    addCard(host, 'src')
    addCard(host, 'tgt')
    const titles: Record<string, string> = { src: 'S', tgt: 'Jones' }

    const r = syncWikiLinkArrows({
      host,
      getCardTitle: (id) => titles[id],
      sourceCardId: 'src',
      body: 'see [[XYZ]]', // 无近邻
    })

    expect(r.created).toBe(0)
    expect(host.getElements().filter((e) => e.kind === 'arrow')).toHaveLength(0)
  })
})

describe('syncWikiLinkArrows (cross-canvas, allCards)', () => {
  it('cross-canvas target → arrow with meta.crossCanvas + targetTitle + targetCanvasId', () => {
    // src 在 canvas-self,目标卡 'tgt' 在 canvas-other(不在 host)。
    // allCards 提供跨画布候选 → 建 cross-canvas wikilink arrow。
    const host = new InMemoryCanvasHost()
    addCard(host, 'src')
    // 注意:tgt 故意不 addCard 到 host(它在别的画布,本 host 看不到)
    const allCards = [
      { id: 'src', title: '本卡', canvasId: 'canvas-self' },
      { id: 'tgt', title: '目标卡', canvasId: 'canvas-other' },
    ]

    const r = syncWikiLinkArrows({
      host,
      getCardTitle: () => undefined,
      sourceCardId: 'src',
      body: '看 [[目标卡]]',
      allCards,
      currentCanvasId: 'canvas-self',
    })

    expect(r.created).toBe(1)
    const arrows = host.getElements().filter((e) => e.kind === 'arrow')
    expect(arrows).toHaveLength(1)
    const a = arrows[0]!
    expect(a.from).toBe('src')
    expect(a.to).toBe('tgt')
    expect(a.meta?.wikilink).toBe(true)
    expect(a.meta?.crossCanvas).toBe(true)
    expect(a.meta?.targetTitle).toBe('目标卡')
    expect(a.meta?.targetCanvasId).toBe('canvas-other')
    // references 签名(blue/dashed/none)+ text 含目标标题
    expect(a.color).toBe('blue')
    expect(a.dash).toBe('dashed')
    expect(a.arrowhead).toBe('none')
    expect(a.text).toContain('目标卡')
  })

  it('same-canvas target via allCards → no crossCanvas meta (plain wikilink)', () => {
    // allCards 提供,但目标在本画布 → 普通 wikilink arrow(无 crossCanvas)。
    const host = new InMemoryCanvasHost()
    addCard(host, 'src')
    addCard(host, 'tgt') // 在 host(本画布)
    const allCards = [
      { id: 'src', title: 'S', canvasId: 'canvas-self' },
      { id: 'tgt', title: 'T', canvasId: 'canvas-self' },
    ]

    const r = syncWikiLinkArrows({
      host,
      getCardTitle: (id) => (id === 'src' ? 'S' : id === 'tgt' ? 'T' : undefined),
      sourceCardId: 'src',
      body: '[[T]]',
      allCards,
      currentCanvasId: 'canvas-self',
    })

    expect(r.created).toBe(1)
    const a = host.getElements().find((e) => e.kind === 'arrow')!
    expect(a.meta?.wikilink).toBe(true)
    expect(a.meta?.crossCanvas).toBeUndefined()
    expect(a.text).toBe('references')
  })

  it('same-canvas preferred over cross-canvas when both match title', () => {
    // 两张卡都叫 'Dup':一张本画布(tgt-self),一张跨画布(tgt-other)。
    // 同画布优先 → arrow.to = 'tgt-self'(无 crossCanvas)。
    const host = new InMemoryCanvasHost()
    addCard(host, 'src')
    addCard(host, 'tgt-self')
    const allCards = [
      { id: 'src', title: 'S', canvasId: 'canvas-self' },
      { id: 'tgt-self', title: 'Dup', canvasId: 'canvas-self' },
      { id: 'tgt-other', title: 'Dup', canvasId: 'canvas-other' },
    ]

    syncWikiLinkArrows({
      host,
      getCardTitle: () => undefined,
      sourceCardId: 'src',
      body: '[[Dup]]',
      allCards,
      currentCanvasId: 'canvas-self',
    })

    const a = host.getElements().find((e) => e.kind === 'arrow')!
    expect(a.to).toBe('tgt-self')
    expect(a.meta?.crossCanvas).toBeUndefined()
  })

  it('meta-mismatch: existing crossCanvas arrow, target now same-canvas → recreate', () => {
    // 预置一条 crossCanvas arrow(to=tgt,meta.crossCanvas=true)。
    // 现在 tgt 卡搬到了本画布(host 上有)→ 同步应重建为普通 wikilink arrow(去 crossCanvas)。
    const host = new InMemoryCanvasHost()
    addCard(host, 'src')
    addCard(host, 'tgt') // tgt 现在在本画布 host 上
    host.upsert({
      id: 'arrow-stale',
      kind: 'arrow',
      x: 0, y: 0, w: 0, h: 0, rotation: 0,
      from: 'src',
      to: 'tgt',
      color: 'blue',
      dash: 'dashed',
      arrowhead: 'none',
      text: '→ 旧目标',
      meta: { wikilink: true, crossCanvas: true, targetTitle: '旧目标', targetCanvasId: 'canvas-other' },
    })

    const allCards = [
      { id: 'src', title: 'S', canvasId: 'canvas-self' },
      { id: 'tgt', title: 'T', canvasId: 'canvas-self' }, // 现在同画布
    ]

    const r = syncWikiLinkArrows({
      host,
      getCardTitle: () => undefined,
      sourceCardId: 'src',
      body: '[[T]]',
      allCards,
      currentCanvasId: 'canvas-self',
    })

    // 重建:1 删(旧 crossCanvas)+ 1 建(新普通)
    expect(r.created).toBe(1)
    expect(r.removed).toBe(1)
    expect(host.getElement('arrow-stale')).toBeUndefined()
    const a = host.getElements().find((e) => e.kind === 'arrow')!
    expect(a.to).toBe('tgt')
    expect(a.meta?.crossCanvas).toBeUndefined()
    expect(a.meta?.wikilink).toBe(true)
    expect(a.text).toBe('references')
  })

  it('meta-mismatch: existing same-canvas arrow, target now cross-canvas → recreate', () => {
    // 反向:预置普通 wikilink arrow,目标卡搬走(从 host 移除,变跨画布)。
    const host = new InMemoryCanvasHost()
    addCard(host, 'src')
    // tgt 不在 host(已搬走)
    host.upsert({
      id: 'arrow-old',
      kind: 'arrow',
      x: 0, y: 0, w: 0, h: 0, rotation: 0,
      from: 'src',
      to: 'tgt',
      color: 'blue',
      dash: 'dashed',
      arrowhead: 'none',
      text: 'references',
      meta: { wikilink: true },
    })

    const allCards = [
      { id: 'src', title: 'S', canvasId: 'canvas-self' },
      { id: 'tgt', title: 'T', canvasId: 'canvas-other' }, // 现在跨画布
    ]

    const r = syncWikiLinkArrows({
      host,
      getCardTitle: () => undefined,
      sourceCardId: 'src',
      body: '[[T]]',
      allCards,
      currentCanvasId: 'canvas-self',
    })

    expect(r.created).toBe(1)
    expect(r.removed).toBe(1)
    const a = host.getElements().find((e) => e.kind === 'arrow')!
    expect(a.meta?.crossCanvas).toBe(true)
    expect(a.meta?.targetCanvasId).toBe('canvas-other')
  })

  it('allCards not provided → backward compat (host-based candidates, same-canvas only)', () => {
    // 不传 allCards → 退回旧行为:从 host 建 candidate,无 canvasId,无跨画布。
    const host = new InMemoryCanvasHost()
    addCard(host, 'src')
    addCard(host, 'tgt')
    const titles: Record<string, string> = { src: 'S', tgt: 'T' }

    const r = syncWikiLinkArrows({
      host,
      getCardTitle: (id) => titles[id],
      sourceCardId: 'src',
      body: '[[T]]',
    })

    expect(r.created).toBe(1)
    const a = host.getElements().find((e) => e.kind === 'arrow')!
    expect(a.meta?.crossCanvas).toBeUndefined()
  })

  it('REGRESSION (T5 review Fix 1): same-canvas desired via allCards+currentCanvasId → no churn on re-sync', () => {
    // 复现条件:传 allCards + currentCanvasId,目标在本画布(同画布 desired)。
    // 旧 bug:desired.targetCanvasId = 卡所在画布 id(如 'canvas-self'),
    // 但同画布 wikilink arrow 的 meta 只打 {wikilink:true}(无 targetCanvasId)。
    // aCanvasId (undefined) !== desired.targetCanvasId ('canvas-self') → 每次失配 → 删旧+建新。
    // 修后:同画布 desired 期望 arrow 上 targetCanvasId=undefined,不会误判 stale。
    const host = new InMemoryCanvasHost()
    addCard(host, 'src')
    addCard(host, 'tgt')
    const allCards = [
      { id: 'src', title: 'S', canvasId: 'canvas-self' },
      { id: 'tgt', title: 'T', canvasId: 'canvas-self' },
    ]
    const opts = {
      host,
      getCardTitle: () => undefined,
      sourceCardId: 'src',
      body: '[[T]]',
      allCards,
      currentCanvasId: 'canvas-self',
    } as const

    const first = syncWikiLinkArrows(opts)
    expect(first.created).toBe(1)
    const arrowAfterFirst = host.getElements().find((e) => e.kind === 'arrow')!
    expect(arrowAfterFirst.meta?.wikilink).toBe(true)
    expect(arrowAfterFirst.meta?.crossCanvas).toBeUndefined()
    expect(arrowAfterFirst.meta?.targetCanvasId).toBeUndefined()

    // 第二次同步:body 没变,期望 no-op(created=0, removed=0,同一 arrow id 保留)。
    const second = syncWikiLinkArrows(opts)
    expect(second.created).toBe(0)
    expect(second.removed).toBe(0)
    expect(host.getElements().filter((e) => e.kind === 'arrow')).toHaveLength(1)
    // 同一条 arrow(id 不变)—— churning 会换 id,这里断言 id 稳定。
    expect(host.getElements().find((e) => e.kind === 'arrow')!.id).toBe(arrowAfterFirst.id)
  })
})

describe('syncWikiLinkArrows (dedup race self-heal)', () => {
  it('two duplicate wikilink arrows A->B + body [[B]] → exactly one A->B after sync', () => {
    const host = new InMemoryCanvasHost()
    addCard(host, 'a')
    addCard(host, 'b')
    const titles: Record<string, string> = { a: 'A', b: 'B' }

    // 预置两条 wikilink arrow a->b(模拟 T2 hydrate race 后的重复)
    const dup1Id = 'arrow-wiki-dup-1-a-b'
    const dup2Id = 'arrow-wiki-dup-2-a-b'
    host.upsert({
      id: dup1Id,
      kind: 'arrow',
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      rotation: 0,
      from: 'a',
      to: 'b',
      color: 'blue',
      dash: 'dashed',
      arrowhead: 'none',
      text: 'references',
      meta: { wikilink: true },
    })
    host.upsert({
      id: dup2Id,
      kind: 'arrow',
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      rotation: 0,
      from: 'a',
      to: 'b',
      color: 'blue',
      dash: 'dashed',
      arrowhead: 'none',
      text: 'references',
      meta: { wikilink: true },
    })

    const r = syncWikiLinkArrows({
      host,
      getCardTitle: (id) => titles[id],
      sourceCardId: 'a',
      body: 'see [[B]]',
    })

    // body 含 [[B]] → 期望保留一条;重复的那条应被去重 → removed=1
    expect(r.created).toBe(0)
    expect(r.removed).toBe(1)
    const wikiArrows = host
      .getElements()
      .filter((e) => e.kind === 'arrow' && e.meta?.wikilink === true && e.from === 'a' && e.to === 'b')
    expect(wikiArrows).toHaveLength(1)
  })

  it('dedup keeps the lowest-id arrow deterministically', () => {
    const host = new InMemoryCanvasHost()
    addCard(host, 'a')
    addCard(host, 'b')
    const titles: Record<string, string> = { a: 'A', b: 'B' }

    // 注意为字典序:'zzz' > 'aaa'
    host.upsert({
      id: 'zzz',
      kind: 'arrow',
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      rotation: 0,
      from: 'a',
      to: 'b',
      color: 'blue',
      dash: 'dashed',
      arrowhead: 'none',
      text: 'references',
      meta: { wikilink: true },
    })
    host.upsert({
      id: 'aaa',
      kind: 'arrow',
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      rotation: 0,
      from: 'a',
      to: 'b',
      color: 'blue',
      dash: 'dashed',
      arrowhead: 'none',
      text: 'references',
      meta: { wikilink: true },
    })

    syncWikiLinkArrows({
      host,
      getCardTitle: (id) => titles[id],
      sourceCardId: 'a',
      body: 'see [[B]]',
    })

    // 应保留 'aaa'(字典序首),'zzz' 被删
    expect(host.getElement('aaa')).toBeDefined()
    expect(host.getElement('zzz')).toBeUndefined()
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

describe('syncAllWikiLinks', () => {
  it('iterates all canvasCardIds, syncing each card (multi-card aggregation)', () => {
    // 两张卡互相双链:a[[B]] + b[[A]] → 各建一条 wikilink arrow。
    const host = new InMemoryCanvasHost()
    addCard(host, 'a')
    addCard(host, 'b')
    const titles: Record<string, string> = { a: 'A', b: 'B' }
    const bodies: Record<string, string> = { a: 'see [[B]]', b: 'see [[A]]' }

    const r = syncAllWikiLinks({
      host,
      getCardTitle: (id) => titles[id],
      getCardBody: (id) => bodies[id],
      canvasCardIds: ['a', 'b'],
    })

    // 每卡各建 1 条 → 合计 2
    expect(r.created).toBe(2)
    expect(r.removed).toBe(0)
    const arrows = host.getElements().filter((e) => e.kind === 'arrow')
    expect(arrows).toHaveLength(2)
    const targets = arrows.map((a) => `${a.from}->${a.to}`).sort()
    expect(targets).toEqual(['a->b', 'b->a'])
  })

  it('summed counts correct across create + remove', () => {
    // 预置一条 stale wikilink arrow(src→old),source body 已不含 [[Old]] → 应删 1;
    // 同时 src body 含 [[New]] → 应建 1。合计 created=1, removed=1。
    const host = new InMemoryCanvasHost()
    addCard(host, 'src')
    addCard(host, 'old')
    addCard(host, 'new')
    addWikiLinkArrow(host, 'src', 'old') // stale
    const titles: Record<string, string> = { src: 'S', old: 'Old', new: 'New' }
    const bodies: Record<string, string> = { src: 'see [[New]]', old: '', new: '' }

    const r = syncAllWikiLinks({
      host,
      getCardTitle: (id) => titles[id],
      getCardBody: (id) => bodies[id],
      canvasCardIds: ['src', 'old', 'new'],
    })

    expect(r.created).toBe(1)
    expect(r.removed).toBe(1)
  })

  it('wraps all per-card syncs in a single outer host.batch (single undo step)', () => {
    // 3 张卡 + 多个 wikilink 目标;即便内部 syncWikiLinkArrows 各自调 batch,
    // 外层 syncAllWikiLinks 应只推一次 undo 快照(嵌套 batch 不重复推)。
    // 验证:整个 syncAllWikiLinks 后,单次 host.undo() 应把所有新建箭头全清掉。
    const host = new InMemoryCanvasHost()
    addCard(host, 'a')
    addCard(host, 'b')
    addCard(host, 'c')
    const titles: Record<string, string> = { a: 'A', b: 'B', c: 'C' }
    const bodies: Record<string, string> = {
      a: '[[B]] [[C]]', // 建 2
      b: '[[A]]', // 建 1
      c: '', // 无
    }
    const arrowsBefore = host.getElements().filter((e) => e.kind === 'arrow').length

    syncAllWikiLinks({
      host,
      getCardTitle: (id) => titles[id],
      getCardBody: (id) => bodies[id],
      canvasCardIds: ['a', 'b', 'c'],
    })

    // 3 条 wikilink 箭头建出
    const arrowsAfter = host.getElements().filter((e) => e.kind === 'arrow').length
    expect(arrowsAfter - arrowsBefore).toBe(3)

    // 单次 undo 应恢复到 syncAll 之前(证明只推了 1 步 undo 快照)
    host.undo()
    const arrowsAfterUndo = host.getElements().filter((e) => e.kind === 'arrow').length
    expect(arrowsAfterUndo).toBe(arrowsBefore)
  })

  it('empty canvasCardIds → {created:0, removed:0} no-op', () => {
    const host = new InMemoryCanvasHost()
    addCard(host, 'src')
    addWikiLinkArrow(host, 'src', 'tgt') // 已有 stale 箭头
    const titles: Record<string, string> = { src: 'S' }
    const bodies: Record<string, string> = { src: '[[T]]' }

    let batchCalls = 0
    const realBatch = host.batch.bind(host)
    host.batch = (fn: () => void) => {
      batchCalls++
      realBatch(fn)
    }

    const r = syncAllWikiLinks({
      host,
      getCardTitle: (id) => titles[id],
      getCardBody: (id) => bodies[id],
      canvasCardIds: [], // 空
    })

    expect(r.created).toBe(0)
    expect(r.removed).toBe(0)
    // 即便空列表也应 no-op:不应调 batch(无可 sync 之物)
    expect(batchCalls).toBe(0)
    // 已有箭头不动(因为根本没跑 sync)
    expect(host.getElements().filter((e) => e.kind === 'arrow')).toHaveLength(1)
  })

  it('skips cardIds whose getCardBody returns undefined (no throw)', () => {
    // 卡被删 / body 缺失时不应炸;undefined 视作空 body。
    const host = new InMemoryCanvasHost()
    addCard(host, 'a')
    addCard(host, 'b')
    const titles: Record<string, string> = { a: 'A', b: 'B' }

    const r = syncAllWikiLinks({
      host,
      getCardTitle: (id) => titles[id],
      getCardBody: () => undefined, // 全 undefined
      canvasCardIds: ['a', 'b'],
    })

    expect(r.created).toBe(0)
    expect(r.removed).toBe(0)
  })

  it('does not double-sync: respects existing wikilink arrows (idempotent)', () => {
    // 第一次跑建箭头;立刻再跑应 no-op(diff 已平衡)。
    const host = new InMemoryCanvasHost()
    addCard(host, 'src')
    addCard(host, 'tgt')
    const titles: Record<string, string> = { src: 'S', tgt: 'T' }
    const bodies: Record<string, string> = { src: '[[T]]', tgt: '' }

    const opts = {
      host,
      getCardTitle: (id: string) => titles[id],
      getCardBody: (id: string) => bodies[id],
      canvasCardIds: ['src', 'tgt'] as string[],
    }

    const first = syncAllWikiLinks(opts)
    expect(first.created).toBe(1)

    const historyBeforeSecond = (host as unknown as { undoStack: unknown[] }).undoStack.length
    const second = syncAllWikiLinks(opts)
    expect(second.created).toBe(0)
    expect(second.removed).toBe(0)
    expect((host as unknown as { undoStack: unknown[] }).undoStack.length).toBe(historyBeforeSecond)
    // 箭头不重复
    expect(host.getElements().filter((e) => e.kind === 'arrow')).toHaveLength(1)
  })
})

describe('resyncWikiLinksForTitleChange', () => {
  it('(a) card with [[oldTitle]] in body → re-synced: stale arrow to renamed card removed', () => {
    // 场景:卡 R 从 "oldTitle" 改名到 "newTitle"。卡 X body 有 [[oldTitle]]。
    // 改名前 X 已有 wikilink arrow X→R(因 R 曾叫 "oldTitle")。
    // resync 后:R 现在 title="newTitle",X 的 body [[oldTitle]] 不再匹配任何卡
    // → X→R 的 stale wikilink arrow 应被删除。
    const host = new InMemoryCanvasHost()
    addCard(host, 'r')
    addCard(host, 'x')
    // 改名后的 R:title="newTitle"(oldTitle="oldTitle")
    const titles: Record<string, string> = { r: 'newTitle', x: 'X' }
    // 预置 X→R wikilink arrow(改名前 R 还叫 oldTitle 时建的)
    addWikiLinkArrow(host, 'x', 'r')
    const bodies: Record<string, string> = { x: 'see [[oldTitle]]' }

    const res = resyncWikiLinksForTitleChange({
      host,
      getCardTitle: (id) => titles[id],
      getCardBody: (id) => bodies[id] ?? '',
      canvasCardIds: ['r', 'x'],
      oldTitle: 'oldTitle',
      newTitle: 'newTitle',
    })

    // X 被 re-sync → 它的 stale arrow 被删
    expect(res.removed).toBe(1)
    expect(res.created).toBe(0)
    const wikiArrows = host.getElements().filter((e) => e.kind === 'arrow' && e.meta?.wikilink === true)
    expect(wikiArrows).toHaveLength(0)
  })

  it('(b) card with [[newTitle]] in body → re-synced: new arrow created to renamed card', () => {
    // 场景:卡 R 从 "oldTitle" 改名到 "newTitle"。卡 Y body 有 [[newTitle]]。
    // 改名前 Y 没箭头([[newTitle]] 找不到匹配)。
    // resync 后:R 现在 title="newTitle",Y 的 [[newTitle]] 匹配 R → 建 Y→R。
    const host = new InMemoryCanvasHost()
    addCard(host, 'r')
    addCard(host, 'y')
    const titles: Record<string, string> = { r: 'newTitle', y: 'Y' }
    const bodies: Record<string, string> = { y: 'see [[newTitle]]' }

    const res = resyncWikiLinksForTitleChange({
      host,
      getCardTitle: (id) => titles[id],
      getCardBody: (id) => bodies[id] ?? '',
      canvasCardIds: ['r', 'y'],
      oldTitle: 'oldTitle',
      newTitle: 'newTitle',
    })

    expect(res.created).toBe(1)
    expect(res.removed).toBe(0)
    const wikiArrows = host.getElements().filter((e) => e.kind === 'arrow' && e.meta?.wikilink === true)
    expect(wikiArrows).toHaveLength(1)
    expect(wikiArrows[0]!.from).toBe('y')
    expect(wikiArrows[0]!.to).toBe('r')
  })

  it('(c) card with neither oldTitle nor newTitle in body → NOT re-synced (skipped)', () => {
    // 卡 Z body 有 [[unrelated]],既不含 oldTitle 也不含 newTitle → 应被 filter 跳过。
    // 验证:即便 Z 有 stale wikilink arrow,也不应被触碰(因为 Z 未被 re-sync)。
    const host = new InMemoryCanvasHost()
    addCard(host, 'r')
    addCard(host, 'z')
    const titles: Record<string, string> = { r: 'newTitle', z: 'Z' }
    const bodies: Record<string, string> = { z: 'see [[unrelated]]' }
    // Z 的 stale arrow(不是 R,是别的卡 'other')— resync 不应碰它
    const staleId = addWikiLinkArrow(host, 'z', 'r')

    resyncWikiLinksForTitleChange({
      host,
      getCardTitle: (id) => titles[id],
      getCardBody: (id) => bodies[id] ?? '',
      canvasCardIds: ['r', 'z'],
      oldTitle: 'oldTitle',
      newTitle: 'newTitle',
    })

    // Z 被 skip → 它的 stale wikilink arrow 应仍在(若 Z 被 re-sync,
    // [[unrelated]] 不匹配任何卡,这条 arrow 会被删——所以箭头还在 = Z 被 skip)
    expect(host.getElement(staleId)).toBeDefined()
  })

  it('(d) wraps all per-card re-syncs in a single outer host.batch (single undo step)', () => {
    // 多个受影响卡:即便内部 syncWikiLinkArrows 各自 batch,外层只推一次 undo 快照。
    // 验证:整个 resync 后,单次 host.undo() 应把所有新建箭头全清掉(证明只推了 1 步)。
    const host = new InMemoryCanvasHost()
    addCard(host, 'r')
    addCard(host, 'y1')
    addCard(host, 'y2')
    const titles: Record<string, string> = { r: 'newTitle', y1: 'Y1', y2: 'Y2' }
    const bodies: Record<string, string> = {
      y1: '[[newTitle]]',
      y2: '[[newTitle]]',
    }
    const arrowsBefore = host.getElements().filter((e) => e.kind === 'arrow').length

    resyncWikiLinksForTitleChange({
      host,
      getCardTitle: (id) => titles[id],
      getCardBody: (id) => bodies[id] ?? '',
      canvasCardIds: ['r', 'y1', 'y2'],
      oldTitle: 'oldTitle',
      newTitle: 'newTitle',
    })

    // 2 条 wikilink 箭头建出
    const arrowsAfter = host.getElements().filter((e) => e.kind === 'arrow').length
    expect(arrowsAfter - arrowsBefore).toBe(2)

    // 单次 undo 应恢复到 resync 之前(证明只推了 1 步 undo 快照)
    host.undo()
    const arrowsAfterUndo = host.getElements().filter((e) => e.kind === 'arrow').length
    expect(arrowsAfterUndo).toBe(arrowsBefore)
  })

  it('(e) summed counts correct across multiple affected cards', () => {
    // Y1 有 [[newTitle]] → 建 1;Y2 有 [[oldTitle]] + 预置 stale arrow → 删 1。
    const host = new InMemoryCanvasHost()
    addCard(host, 'r')
    addCard(host, 'y1')
    addCard(host, 'y2')
    addWikiLinkArrow(host, 'y2', 'r') // stale(改名前 R="oldTitle",Y2=[[oldTitle]] 建的)
    const titles: Record<string, string> = { r: 'newTitle', y1: 'Y1', y2: 'Y2' }
    const bodies: Record<string, string> = {
      y1: '[[newTitle]]',
      y2: '[[oldTitle]]',
    }

    const res = resyncWikiLinksForTitleChange({
      host,
      getCardTitle: (id) => titles[id],
      getCardBody: (id) => bodies[id] ?? '',
      canvasCardIds: ['r', 'y1', 'y2'],
      oldTitle: 'oldTitle',
      newTitle: 'newTitle',
    })

    expect(res.created).toBe(1) // Y1
    expect(res.removed).toBe(1) // Y2
  })

  it('(f) empty/whitespace titles → no-op (returns zeros, no batch)', () => {
    const host = new InMemoryCanvasHost()
    addCard(host, 'r')
    addCard(host, 'y')
    const titles: Record<string, string> = { r: '', y: 'Y' }
    const bodies: Record<string, string> = { y: '[[]]' }

    let batchCalls = 0
    const realBatch = host.batch.bind(host)
    host.batch = (fn: () => void) => {
      batchCalls++
      realBatch(fn)
    }

    const res = resyncWikiLinksForTitleChange({
      host,
      getCardTitle: (id) => titles[id],
      getCardBody: (id) => bodies[id] ?? '',
      canvasCardIds: ['r', 'y'],
      oldTitle: '   ',
      newTitle: '   ',
    })

    expect(res.created).toBe(0)
    expect(res.removed).toBe(0)
    expect(batchCalls).toBe(0)
  })

  it('empty canvasCardIds → {0,0} no-op', () => {
    const host = new InMemoryCanvasHost()

    let batchCalls = 0
    const realBatch = host.batch.bind(host)
    host.batch = (fn: () => void) => {
      batchCalls++
      realBatch(fn)
    }

    const res = resyncWikiLinksForTitleChange({
      host,
      getCardTitle: () => undefined,
      getCardBody: () => undefined,
      canvasCardIds: [],
      oldTitle: 'A',
      newTitle: 'B',
    })

    expect(res.created).toBe(0)
    expect(res.removed).toBe(0)
    expect(batchCalls).toBe(0)
  })

  it('filter is case-insensitive (matches syncWikiLinkArrows matching)', () => {
    // body 有 [[OLD]](大写),oldTitle="old"(小写)→ filter 应捕获(小写比较)。
    // 验证方式:预置一条 stale wikilink arrow Y→R(R 改名前="old" 建的);
    // resync 后 Y 被 re-sync → [[OLD]] 不再匹配任何卡(R 现在="new")→ stale arrow 被删。
    // 若 filter 大小写敏感,Y 会被 skip,stale arrow 仍在。
    const host = new InMemoryCanvasHost()
    addCard(host, 'r')
    addCard(host, 'y')
    const titles: Record<string, string> = { r: 'newTitle', y: 'Y' }
    const bodies: Record<string, string> = { y: 'see [[OLD]]' }
    const staleId = addWikiLinkArrow(host, 'y', 'r')

    resyncWikiLinksForTitleChange({
      host,
      getCardTitle: (id) => titles[id],
      getCardBody: (id) => bodies[id] ?? '',
      canvasCardIds: ['r', 'y'],
      oldTitle: 'old',
      newTitle: 'newTitle',
    })

    // Y 被 re-sync(因 filter 大小写不敏感)→ stale arrow 被删
    expect(host.getElement(staleId)).toBeUndefined()
  })
})
