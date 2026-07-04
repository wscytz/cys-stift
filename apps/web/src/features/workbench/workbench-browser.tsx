'use client'

import { useMemo, useState } from 'react'
import type { Card } from '@cys-stift/domain'
import { useI18n } from '@/lib/i18n'
import {
  DEFAULT_WORKBENCH_MODE,
  WORKBENCH_MODES,
  type WorkbenchModeId,
} from './workbench-modes'

/**
 * WorkbenchBrowser — `/workbench` 库主体(搜索 + 分类模式切换器 + 分区列表)。
 *
 * 库 = 浏览/整理面,不编辑(点卡跳 /canvas 由 dock 接管)。分类模式数据驱动
 * (WORKBENCH_MODES),切换器渲染由数组派生,加模式只改 modes.ts。
 *
 * 搜索跨模式:对 title/body 做大小写不敏感包含匹配,过滤后的 cards 再进分区。
 */
export function WorkbenchBrowser({ cards }: { cards: Card[] }) {
  const { t } = useI18n()
  const [mode, setMode] = useState<WorkbenchModeId>(DEFAULT_WORKBENCH_MODE)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return cards
    return cards.filter(
      (c) =>
        c.title.toLowerCase().includes(q) || c.body.toLowerCase().includes(q),
    )
  }, [cards, query])

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

      {filtered.length === 0 ? (
        <div className="wb__no-match">{t('workbench.noMatch')}</div>
      ) : (
        // 子任务 2-4:分类模式分组 + 分区手风琴。当前 placeholder(模式 + 计数)。
        <div className="wb__placeholder">
          {t('workbench.modeLabel', {
            mode: t(WORKBENCH_MODES.find((m) => m.id === mode)!.i18nKey),
          })}{' '}
          · {t('workbench.count', { n: String(filtered.length) })}
        </div>
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
.wb__no-match {
  padding: var(--space-4) var(--space-3);
  color: var(--color-gray); font-style: italic; text-align: center;
}
.wb__placeholder {
  padding: var(--space-3);
  color: var(--color-gray); font-style: italic;
}
`
