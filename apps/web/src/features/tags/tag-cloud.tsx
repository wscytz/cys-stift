'use client'

import { useState } from 'react'
import type { Card } from '@cys-stift/domain'
import { ArchiveCardTile } from '@/features/archive/archive-card-tile'
import { useI18n } from '@/lib/i18n'

/**
 * TagCloud (P3-T2) — 标签墙的核心。
 *
 * 两条职责:
 *  1. 聚合 cards 上的 tags(value + color),按 count 倒序铺成 chip。
 *     chip 字号随 count 增大(Math.min(20, 12 + count)),背景直接用
 *     tag.color(TagColor = CSS var 字符串,如 var(--color-red))。
 *  2. 点选 chip → 展开含该 tag 的卡网格(ArchiveCardTile,复用归档渲染)。
 *     再点一次取消,点别的 chip 切换。无选中 = 只展示 chip 云。
 *
 * 无标签时返回 null(由页层处理空态)。
 *
 * 聚合在父页过滤好 !deletedAt 后传入,这里只做纯展示 + 本地选中状态。
 */
export function TagCloud({ cards }: { cards: Card[] }) {
  const { t } = useI18n()

  // 聚合:遍历 cards 的 tags,Map 累计 count。保留首次见到的 color
  // (同一 value 不同卡可能颜色不同——取首个,与 CardService.listTags 一致)。
  const tags = aggregateTags(cards)

  const [selected, setSelected] = useState<string | null>(null)

  // 自动失效:选中的 value 不再存在(被删/改名)时清掉,避免残留无卡 chip。
  if (selected && !tags.some((tag) => tag.value === selected)) {
    setSelected(null)
  }

  if (tags.length === 0) return null

  const filtered = selected
    ? cards.filter((c) => (c.tags ?? []).some((tag) => tag.value === selected))
    : []

  const toggle = (value: string) =>
    setSelected((prev) => (prev === value ? null : value))

  return (
    <>
      <ul className="tag-cloud" aria-label={t('tags.title')}>
        {tags.map((tag) => {
          const isSel = selected === tag.value
          const size = Math.min(20, 12 + tag.count)
          return (
            <li key={tag.value}>
              <button
                type="button"
                className={`tag-chip ${isSel ? 'tag-chip--selected' : ''}`}
                aria-pressed={isSel}
                style={{
                  ['--chip-bg' as string]: tag.color,
                  fontSize: `${size}px`,
                }}
                onClick={() => toggle(tag.value)}
              >
                <span className="tag-chip__label">{tag.value}</span>
                <span className="tag-chip__count">
                  {t('tags.count', { n: tag.count })}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {selected && (
        <ul className="tag-grid" aria-label={selected}>
          {filtered.map((card) => (
            <li key={card.id}>
              <ArchiveCardTile
                card={card}
                variant="tile"
                onClick={() => {
                  /* 第一版只展示不可点;详情入口留给后续 */
                }}
              />
            </li>
          ))}
        </ul>
      )}

      <style>{styles}</style>
    </>
  )
}

/**
 * 聚合 tags:value → { color, count }。
 * 纯函数,便于推理;输入是页层已过滤 !deletedAt 的 cards。
 */
function aggregateTags(
  cards: Card[],
): { value: string; color: string; count: number }[] {
  const map = new Map<string, { color: string; count: number }>()
  for (const c of cards) {
    // 老数据/导入卡可能 tags === undefined(.some / for..of 崩)。?? [] 兜底。
    for (const tag of c.tags ?? []) {
      const entry = map.get(tag.value)
      if (entry) entry.count++
      else map.set(tag.value, { color: tag.color, count: 1 })
    }
  }
  // count 倒序;同 count 按 value 升序(稳定可读)。
  return [...map.entries()]
    .map(([value, { color, count }]) => ({ value, color, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
}

const styles = `
.tag-cloud {
  list-style: none;
  margin: 0 0 var(--space-4);
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
}
.tag-chip {
  display: inline-flex;
  align-items: baseline;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  background: var(--chip-bg, var(--color-gray-soft));
  color: var(--color-black);
  border: 2px solid var(--color-black);
  border-radius: var(--radius-sm);
  font-family: var(--font-display);
  font-weight: 500;
  line-height: 1.25;
  letter-spacing: -0.01em;
  cursor: pointer;
  transition: transform 80ms ease-out, box-shadow 80ms ease-out;
}
.tag-chip:hover { box-shadow: 2px 2px 0 0 var(--color-black); }
.tag-chip:active { transform: translate(2px, 2px); box-shadow: none; }
.tag-chip:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
.tag-chip--selected { outline: 2px solid var(--color-red); outline-offset: 2px; }
.tag-chip__count {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  /* black-soft:在所有饱和 tag 背景上(红/蓝/黄/紫…)对比度达标,且暗色模式自动反转
     (rgba(0,0,0,0.7) 暗色 tag 深底上不可读)。审计 H5 + v0.41 暗色可读。 */
  color: var(--color-black-soft);
}
.tag-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--space-3) var(--space-4);
}
`
