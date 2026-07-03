/**
 * tag-ops — 标签管理（D5）的纯函数（无副作用，可单测）。
 *
 * 标签是卡内联的 `tags: TagRef[]`（无独立 Tag 实体）。所有操作接收 Card[]，
 * 返回「受影响卡的 id + 新 tags」，由 /tags 页面 forEach 调 service.update 落库。
 * 纯函数 = 不碰 service / storage，单测直接喂 Card[]。
 */
import type { Card, TagColor, TagRef } from '@cys-stift/domain'

/** 聚合后的标签（/tags 管理表一行）。 */
export interface TagAggregate {
  value: string
  /** 出现最多的 color（卡间分歧时取多数）。 */
  color: TagColor
  count: number
}

/** 受影响卡的更新（id + 新 tags 数组）。 */
export interface TagChange {
  id: string
  tags: TagRef[]
}

/**
 * 聚合所有卡的 tags：按 value 去重 → count + 出现最多的 color → 按 count 降序（count 同按 value）。
 * 软删卡（deletedAt）应由调用方先过滤。
 */
export function aggregateTags(cards: Card[]): TagAggregate[] {
  const map = new Map<string, Map<string, number>>()
  for (const c of cards) {
    for (const t of c.tags ?? []) {
      const cc = map.get(t.value) ?? new Map<string, number>()
      cc.set(t.color, (cc.get(t.color) ?? 0) + 1)
      map.set(t.value, cc)
    }
  }
  const out: TagAggregate[] = []
  for (const [value, cc] of map) {
    let bestColor = '' as TagColor
    let bestCount = -1
    let total = 0
    for (const [color, cnt] of cc) {
      total += cnt
      if (cnt > bestCount) {
        bestCount = cnt
        bestColor = color as TagColor
      }
    }
    out.push({ value, color: bestColor, count: total })
  }
  return out.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
}

/** 改名：oldValue → newValue（保留各 tag 原 color）。oldValue===newValue 无操作。 */
export function renameTag(cards: Card[], oldValue: string, newValue: string): TagChange[] {
  if (oldValue === newValue || !newValue) return []
  const out: TagChange[] = []
  for (const c of cards) {
    if (!c.tags?.some((t) => t.value === oldValue)) continue
    out.push({ id: c.id, tags: c.tags.map((t) => (t.value === oldValue ? { ...t, value: newValue } : t)) })
  }
  return out
}

/** 改色：value 的 tag 颜色改成 color。已是该色的卡不输出。 */
export function recolorTag(cards: Card[], value: string, color: TagColor): TagChange[] {
  const out: TagChange[] = []
  for (const c of cards) {
    if (!c.tags?.some((t) => t.value === value && t.color !== color)) continue
    out.push({ id: c.id, tags: c.tags.map((t) => (t.value === value ? { ...t, color } : t)) })
  }
  return out
}

/** 删标签：移除 value（卡保留，仅去标）。 */
export function deleteTag(cards: Card[], value: string): TagChange[] {
  const out: TagChange[] = []
  for (const c of cards) {
    if (!c.tags?.some((t) => t.value === value)) continue
    out.push({ id: c.id, tags: c.tags.filter((t) => t.value !== value) })
  }
  return out
}

/**
 * 合并：把所有卡的 source 标签替换为 target（移 source；已有 target 则用 target 的 color，
 * 否则加 target）。source===target.value 无操作。
 */
export function mergeTag(cards: Card[], source: string, target: TagRef): TagChange[] {
  if (source === target.value) return []
  const out: TagChange[] = []
  for (const c of cards) {
    if (!c.tags?.some((t) => t.value === source)) continue
    const withoutSource = c.tags.filter((t) => t.value !== source)
    const hasTarget = withoutSource.some((t) => t.value === target.value)
    const tags = hasTarget
      ? withoutSource.map((t) => (t.value === target.value ? { ...target } : t))
      : [...withoutSource, { ...target }]
    out.push({ id: c.id, tags })
  }
  return out
}
