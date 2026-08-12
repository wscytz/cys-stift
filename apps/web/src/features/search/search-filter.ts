import type { Card } from '@cys-stift/domain'

/**
 * /search 的筛选维度(B-3「收敛找回」)。把「找回」的多个维度(tag / time / status)
 * 收敛到搜索里一次到位,不必先选维度路由(此前 tags/timeline/archive 各是一面)。
 * 纯函数,可单测。deletedAt 由 searchCards 内部排除,这里不碰。
 */
export type SearchStatus = 'all' | 'active' | 'archived'
export type SearchTimeRange = 'all' | '7d' | '30d' | '90d'

export interface SearchFilter {
  /** 选中的 tag 值,any-match(命中任一即保留)。空 = 不过滤。 */
  tags: string[]
  status: SearchStatus
  timeRange: SearchTimeRange
}

export const DEFAULT_SEARCH_FILTER: SearchFilter = {
  tags: [],
  status: 'all',
  timeRange: 'all',
}

/** R12:筛选是否处于默认态(无 tag / 状态全 / 时间全)。空结果文案据此区分
 *  「筛选把结果滤成 0」vs「真的没搜到」,避免误导用户以为词错了。 */
export function isDefaultSearchFilter(filter: SearchFilter): boolean {
  return (
    (filter.tags?.length ?? 0) === 0 &&
    (filter.status ?? 'all') === 'all' &&
    (filter.timeRange ?? 'all') === 'all'
  )
}

const DAY_MS = 24 * 3600 * 1000
const TIME_MS: Record<Exclude<SearchTimeRange, 'all'>, number> = {
  '7d': 7 * DAY_MS,
  '30d': 30 * DAY_MS,
  '90d': 90 * DAY_MS,
}

/** 应用筛选。now = 当前时间戳(ms),外部传,保持纯函数可测。 */
export function applySearchFilters(
  cards: Card[],
  filter: SearchFilter,
  now: number,
): Card[] {
  let out = cards
  if (filter.status === 'active') out = out.filter((c) => !c.archived)
  else if (filter.status === 'archived') out = out.filter((c) => c.archived)
  if (filter.tags.length > 0) {
    const set = new Set(filter.tags)
    out = out.filter((c) => (c.tags ?? []).some((tg) => set.has(tg.value)))
  }
  if (filter.timeRange !== 'all') {
    const cutoff = now - TIME_MS[filter.timeRange]
    out = out.filter((c) => c.capturedAt.getTime() >= cutoff)
  }
  return out
}

/** 全卡的 tag 值去重排序列表(给 filter chips 用)。 */
export function collectTagValues(cards: Card[]): string[] {
  const seen = new Set<string>()
  for (const c of cards) {
    for (const tg of c.tags ?? []) seen.add(tg.value)
  }
  return [...seen].sort((a, b) => a.localeCompare(b))
}
