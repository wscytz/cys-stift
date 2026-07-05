'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Card } from '@cys-stift/domain'
import { useI18n } from '@/lib/i18n'
import { workbenchStore } from '@/lib/workbench-store'
import { pushToast } from '@/lib/toast-store'
import { aggregateTags } from '@/features/tags/tag-ops'
import {
  DEFAULT_WORKBENCH_MODE,
  WORKBENCH_MODES,
  type WorkbenchModeId,
} from './workbench-modes'
import { WorkbenchSections } from './workbench-sections'

/**
 * WorkbenchBrowser — `/workbench` 库主体(搜索 + 分类模式切换器 + 分区列表)。
 *
 * 库 = 浏览/整理面,不编辑(点卡跳 /canvas 由 dock 接管)。分类模式数据驱动
 * (WORKBENCH_MODES),切换器渲染由数组派生,加模式只改 modes.ts。
 *
 * 搜索跨模式:对 title/body 做大小写不敏感包含匹配,过滤后的 cards 再进分区。
 * 标签模式:多选 chip(任一匹配),复用 D5 aggregateTags 拉标签列表。
 *
 * 行点击(子任务 5):有 canvasPosition → workbenchStore.open + push /canvas(dock 接管编辑);
 * 无 canvasPosition → toast「未上画布」+ push /inbox(收件箱区卡本就未上画布,去 inbox 更顺)。
 */
export function WorkbenchBrowser({ cards }: { cards: Card[] }) {
  const { t } = useI18n()
  const router = useRouter()
  const [mode, setMode] = useState<WorkbenchModeId>(DEFAULT_WORKBENCH_MODE)
  const [query, setQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  const onOpenCard = useCallback(
    (card: Card) => {
      if (card.canvasPosition) {
        workbenchStore.open(card.id)
        router.push('/canvas')
      } else {
        // 收件箱区/未上画布的卡 → 提示 + 去 inbox(库本身不编辑)
        pushToast({ kind: 'info', message: t('workbench.notOnCanvas') })
        router.push('/inbox')
      }
    },
    [router, t],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return cards
    return cards.filter(
      (c) =>
        c.title.toLowerCase().includes(q) || c.body.toLowerCase().includes(q),
    )
  }, [cards, query])

  // 标签模式:聚合所有卡的 tags(D5 aggregateTags),按 count 降序。
  const tagAgg = useMemo(() => aggregateTags(filtered), [filtered])
  const tagColors = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of tagAgg) m.set(t.value, t.color)
    return m
  }, [tagAgg])

  const toggleTag = (value: string) => {
    setSelectedTags((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    )
  }

  return (
    <div className="wb">
      <div className="wb__topbar">
        <div className="wb__search">
          <span className="wb__mag" aria-hidden="true">⌕</span>
          <input
            type="search"
            className="wb__search-input"
            placeholder={t('workbench.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t('workbench.searchPlaceholder')}
          />
        </div>
        <div className="wb__modes" role="tablist" aria-label={t('workbench.modesLabel')}>
          {WORKBENCH_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={mode === m.id}
              className={`wb__mode${mode === m.id ? ' wb__mode--on' : ''}`}
              onClick={() => setMode(m.id)}
            >
              {t(m.i18nKey)}
            </button>
          ))}
        </div>
      </div>

      {/* 标签模式:多选 chip 栏(任一匹配)。空标签 → 提示。 */}
      {mode === 'tag' && (
        <div className="wb__tagbar">
          {tagAgg.length === 0 ? (
            <span className="wb__tagempty">{t('workbench.noTags')}</span>
          ) : (
            tagAgg.map((t) => {
              const on = selectedTags.includes(t.value)
              return (
                <button
                  key={t.value}
                  type="button"
                  className={`wb__tagchip${on ? ' wb__tagchip--on' : ''}`}
                  style={on ? { background: t.color, borderColor: t.color } : { borderColor: t.color }}
                  aria-pressed={on}
                  onClick={() => toggleTag(t.value)}
                >
                  {t.value} <span className="wb__tagcnt">{t.count}</span>
                </button>
              )
            })
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="wb__no-match">{t('workbench.noMatch')}</div>
      ) : mode === 'tag' && selectedTags.length === 0 ? (
        <div className="wb__hint">{t('workbench.selectTagHint')}</div>
      ) : (
        <WorkbenchSections
          cards={filtered}
          mode={mode}
          selectedTags={selectedTags}
          tagColors={tagColors}
          onOpenCard={onOpenCard}
        />
      )}

      <style>{styles}</style>
    </div>
  )
}

const styles = `
.wb { border: 2px solid var(--color-black); box-shadow: var(--shadow-md); background: var(--color-white); }
.wb__topbar {
  display: flex; align-items: center; gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-bottom: 2px solid var(--color-black);
  flex-wrap: wrap;
}
.wb__search {
  display: flex; align-items: center; gap: var(--space-1);
  border: 1.5px solid var(--color-black);
  padding: var(--space-1) var(--space-2);
  background: var(--color-white);
  flex: 1; min-width: 180px;
}
.wb__mag { color: var(--color-gray); font-size: var(--font-size-sm); }
.wb__search-input {
  border: 0; outline: 0; background: transparent;
  font-family: var(--font-content); font-size: var(--font-size-sm);
  color: var(--color-black); flex: 1; min-width: 0;
}
.wb__search-input:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
.wb__modes { display: flex; gap: var(--space-1); flex-wrap: wrap; }
.wb__mode {
  font-family: var(--font-display); font-weight: 600;
  font-size: var(--font-size-xs);
  text-transform: uppercase; letter-spacing: 0.08em;
  padding: var(--space-1) var(--space-2);
  border: 1.5px solid var(--color-black);
  background: var(--color-white); color: var(--color-black);
  cursor: pointer; border-radius: 1px;
}
.wb__mode:hover { background: var(--color-gray-soft); }
.wb__mode:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
.wb__mode--on { background: var(--color-black); color: var(--color-white); }
/* 标签模式 chip 栏 */
.wb__tagbar {
  display: flex; gap: var(--space-1); flex-wrap: wrap;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1.5px solid var(--color-gray-soft);
}
.wb__tagempty { color: var(--color-gray); font-style: italic; font-size: var(--font-size-sm); }
.wb__tagchip {
  font-family: var(--font-display); font-weight: 600;
  font-size: var(--font-size-xs);
  padding: var(--space-1) var(--space-2);
  border: 1.5px solid; background: var(--color-white); color: var(--color-black);
  cursor: pointer; border-radius: 1px;
}
.wb__tagchip:hover { background: var(--color-gray-soft); }
.wb__tagchip:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
.wb__tagchip--on { color: var(--color-white); }
.wb__tagcnt {
  font-family: var(--font-mono); font-size: var(--font-size-xs); opacity: 0.8;
  margin-left: var(--space-1);
}
.wb__hint, .wb__no-match {
  padding: var(--space-4) var(--space-3);
  color: var(--color-gray); font-style: italic; text-align: center;
}
`
