import type { Card } from '@cys-stift/domain'
import { findDuplicateGroups } from '@cys-stift/domain'
import type { CanvasElement } from '@cys-stift/canvas-engine'
import { recommendRelations } from './relation-recommend'
import { relationTypeById, type RelationTypeId } from './relation-types'

export type InsightKind = 'duplicate' | 'relation' | 'orphan'

export interface Insight {
  /** 稳定 id = kind + ':' + 排序后 cardIds(内容稳定,免重算抖动 / AI 深挖 note 复用)。 */
  id: string
  kind: InsightKind
  cardIds: string[]
  /** 排序用:duplicate=组大小 / relation=本地打分 / orphan=0。 */
  score: number
  /** 建立关联用的语义类型(duplicate=related-to / relation=rec.suggestedType.id / orphan=无)。 */
  suggestedType?: RelationTypeId
  /** 本地一句话理由(duplicate 的 reason / relation 的 reasons 拼接)。 */
  description?: string
  /** AI 深挖回填(运行时,非持久 —— 由 panel 用 id 索引的 Map 合并)。 */
  deepened?: boolean
  aiNote?: string
}

export interface DiscoverOptions {
  /** relation 类上限(默认 12)。 */
  maxRelations?: number
  /** relation 最低本地分(默认 2,过滤弱信号)。 */
  minRelationScore?: number
  /** 超此卡数启用候选池剪枝(默认 50)。 */
  pruneThreshold?: number
}

const DEFAULT_MAX_RELATIONS = 12
const DEFAULT_MIN_SCORE = 1
const DEFAULT_PRUNE_THRESHOLD = 50

const RANK: Record<InsightKind, number> = { duplicate: 3, relation: 2, orphan: 1 }

/** 入口:elements(画布元素,含 arrow)+ cards(当前画布卡,未过滤软删)→ 发现列表(已排序)。 */
export function discoverInsights(
  elements: CanvasElement[],
  cards: Card[],
  opts: DiscoverOptions = {},
): Insight[] {
  const live = cards.filter((c) => !c.deletedAt)
  if (live.length < 2) return []
  const maxRelations = opts.maxRelations ?? DEFAULT_MAX_RELATIONS
  const minScore = opts.minRelationScore ?? DEFAULT_MIN_SCORE
  const pruneAt = opts.pruneThreshold ?? DEFAULT_PRUNE_THRESHOLD
  const duplicates = discoverDuplicates(live)
  const relations = discoverRelations(live, {
    maxRelations, minScore, prune: live.length > pruneAt,
  })
  const orphans = discoverOrphans(elements, live)
  return [...duplicates, ...relations, ...orphans].sort((a, b) => {
    if (RANK[a.kind] !== RANK[b.kind]) return RANK[b.kind] - RANK[a.kind]
    return b.score - a.score
  })
}

function discoverDuplicates(cards: Card[]): Insight[] {
  return findDuplicateGroups(cards).map((g) => ({
    id: `duplicate:${g.cardIds.slice().sort().join(',')}`,
    kind: 'duplicate' as const,
    cardIds: g.cardIds,
    score: g.cardIds.length,
    suggestedType: 'related-to' as RelationTypeId,
    description: g.reason,
  }))
}

function discoverRelations(
  cards: Card[],
  o: { maxRelations: number; minScore: number; prune: boolean },
): Insight[] {
  const seen = new Set<string>()
  const pairKey = (a: string, b: string) => [a, b].sort().join('|')
  const out: Insight[] = []
  for (const card of cards) {
    const pool = o.prune ? pruneCandidates(card, cards) : cards
    if (pool.length === 0) continue
    const recs = recommendRelations(card, pool, { limit: 3, minScore: o.minScore })
    for (const r of recs) {
      const key = pairKey(card.id, r.otherCardId)
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        id: `relation:${key}`,
        kind: 'relation',
        cardIds: [card.id, r.otherCardId],
        score: r.score,
        suggestedType: r.suggestedType?.id ?? 'related-to',
        description: r.reasons.join(', '),
      })
    }
    if (out.length >= o.maxRelations * 3) break // 超收后排序裁剪
  }
  return out.sort((a, b) => b.score - a.score).slice(0, o.maxRelations)
}

/** 大画布剪枝:只留共享 ≥1 标签(按 value 匹配)或 标题 token 重叠 的候选(spec §8)。 */
function pruneCandidates(source: Card, all: Card[]): Card[] {
  // tags 是 TagRef[]({value,color})——必须比 .value,不能装对象进 Set(对象恒等永不命中)。
  const srcTags = new Set((source.tags ?? []).map((t) => t.value.toLowerCase()).filter(Boolean))
  const srcTokens = new Set(tokenize(source.title))
  return all.filter((c) => {
    if (c.id === source.id) return false
    if (srcTags.size && (c.tags ?? []).some((t) => srcTags.has(t.value.toLowerCase()))) return true
    if (srcTokens.size && tokenize(c.title).some((t) => srcTokens.has(t))) return true
    return false
  })
}

function tokenize(s: string | undefined): string[] {
  if (!s) return []
  return s.toLowerCase().split(/[\s,，。、]+/).filter((t) => t.length > 1)
}

function discoverOrphans(elements: CanvasElement[], cards: Card[]): Insight[] {
  const connected = new Set<string>()
  for (const el of elements) {
    if (el.kind === 'arrow') {
      if (el.from) connected.add(el.from)
      if (el.to) connected.add(el.to)
    }
  }
  return cards
    .filter((c) => !connected.has(c.id))
    .map((c) => ({ id: `orphan:${c.id}`, kind: 'orphan' as const, cardIds: [c.id], score: 0 }))
}

/** 多元素并集 bbox 中心(选中定位居中用;负 w/h flip 处理)。空 → null。 */
export function elementsCenter(els: CanvasElement[]): { x: number; y: number } | null {
  if (els.length === 0) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const e of els) {
    const x0 = e.w < 0 ? e.x + e.w : e.x
    const y0 = e.h < 0 ? e.y + e.h : e.y
    const x1 = x0 + Math.abs(e.w)
    const y1 = y0 + Math.abs(e.h)
    if (x0 < minX) minX = x0
    if (y0 < minY) minY = y0
    if (x1 > maxX) maxX = x1
    if (y1 > maxY) maxY = y1
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
}

/** pair 间是否已有 arrow(双向)。建立关联去重用。 */
export function arrowExistsBetween(elements: CanvasElement[], a: string, b: string): boolean {
  return elements.some(
    (el) => el.kind === 'arrow' &&
      ((el.from === a && el.to === b) || (el.from === b && el.to === a)),
  )
}

/** 构建一条 relation arrow 元素(镜像 cluster.ts:155-161;text=typeId 供 inferRelationType 回读)。 */
export function buildRelationArrow(a: string, b: string, typeId: RelationTypeId): CanvasElement {
  const rt = relationTypeById(typeId) ?? relationTypeById('related-to')!
  const shortId = Math.random().toString(36).slice(2, 10)
  return {
    id: `companion-${a}-${b}-${shortId}`,
    kind: 'arrow',
    x: 0, y: 0, w: 0, h: 0, rotation: 0,
    from: a, to: b,
    color: rt.color, dash: rt.dash, arrowhead: rt.arrowhead, text: rt.id,
  }
}

/** 由 insight 推导要建的 arrow 列表(relation=单箭头 / duplicate=星形 每个→primary / orphan=空)。 */
export function buildConnectArrows(insight: Insight, elements: CanvasElement[]): CanvasElement[] {
  const typeId = insight.suggestedType ?? 'related-to'
  if (insight.kind === 'relation' && insight.cardIds.length >= 2) {
    const [a, b] = insight.cardIds
    if (arrowExistsBetween(elements, a!, b!)) return []
    return [buildRelationArrow(a!, b!, typeId)]
  }
  if (insight.kind === 'duplicate' && insight.cardIds.length >= 2) {
    const primary = insight.cardIds[0]!
    const out: CanvasElement[] = []
    for (const id of insight.cardIds.slice(1)) {
      if (!arrowExistsBetween(elements, primary, id)) out.push(buildRelationArrow(primary, id, typeId))
    }
    return out
  }
  return [] // orphan:无 pair
}
