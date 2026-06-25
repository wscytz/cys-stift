/**
 * groupCardsByDay — 按 getDate 返回的 Date 的 UTC 日(ISO yyyy-mm-dd)分组。
 *
 * 纯函数,零依赖。Map 的插入序 = 输入序(调用方先按时间倒/正序排好,
 * 即得到日倒/正序的 key 顺序)。bucket 内保持输入顺序。
 *
 * 用途(2026-06-25 timeline 视图):
 * - timeline:`groupCardsByDay(sorted, c => c.capturedAt)`
 * - archive timeline:`groupCardsByDay(sorted, c => c.updatedAt)`(机械替换原内联 Map)
 *
 * helper 只负责分组;日内 pinned 置顶等稳定分区由消费方做。
 *
 * spec: docs/superpowers/specs/2026-06-25-timeline-view-design.md §4
 */
export function groupCardsByDay<T>(
  cards: T[],
  getDate: (c: T) => Date,
): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const c of cards) {
    const day = getDate(c).toISOString().slice(0, 10)
    const bucket = groups.get(day)
    if (bucket) bucket.push(c)
    else groups.set(day, [c])
  }
  return groups
}
