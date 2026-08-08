'use client'

/**
 * SearchFilters — /search 筛选框架(B-3「收敛找回」)。
 *
 * 受控组件:filter + onChange 由 page 持有,这里只渲染 + 派发(同 GraphFilters 口径)。
 * 让「找回」的多个维度——状态(全部/收件箱/归档)、时间(全部/近N天)、标签(多选 any-match)
 * 在搜索里一次到位,不必先选维度路由。样式走 token + mono-label(shared.css 全局),不写死。
 */
import { useI18n } from '@/lib/i18n'
import { solidTagChipStyle, stableTagColor } from '@/lib/tag-color'
import {
  DEFAULT_SEARCH_FILTER,
  type SearchFilter,
  type SearchStatus,
  type SearchTimeRange,
} from './search-filter'

const STATUS_KEYS: {
  v: SearchStatus
  key: 'search.status.all' | 'search.status.active' | 'search.status.archived'
}[] = [
  { v: 'all', key: 'search.status.all' },
  { v: 'active', key: 'search.status.active' },
  { v: 'archived', key: 'search.status.archived' },
]

const TIME_KEYS: {
  v: SearchTimeRange
  key: 'search.time.all' | 'search.time.7d' | 'search.time.30d' | 'search.time.90d'
}[] = [
  { v: 'all', key: 'search.time.all' },
  { v: '7d', key: 'search.time.7d' },
  { v: '30d', key: 'search.time.30d' },
  { v: '90d', key: 'search.time.90d' },
]

export function SearchFilters({
  filter,
  onChange,
  tags,
}: {
  filter: SearchFilter
  onChange: (next: SearchFilter) => void
  /** 可选 tag 值列表(全部活卡的 tag 值去重)。 */
  tags: string[]
}) {
  const { t } = useI18n()
  const hasActive =
    filter.tags.length > 0 || filter.status !== 'all' || filter.timeRange !== 'all'

  return (
    <div className="sf">
      <style>{styles}</style>
      <div className="sf__row">
        <div className="sf__seg" role="group" aria-label={t('search.filter.status')}>
          {STATUS_KEYS.map((s) => (
            <button
              key={s.v}
              type="button"
              className={`sf__seg-btn${filter.status === s.v ? ' is-active' : ''}`}
              aria-pressed={filter.status === s.v}
              onClick={() => onChange({ ...filter, status: s.v })}
            >
              {t(s.key)}
            </button>
          ))}
        </div>

        <label className="sf__field">
          <span className="mono-label">{t('search.filter.time')}</span>
          <select
            className="sf__select"
            value={filter.timeRange}
            onChange={(e) =>
              onChange({ ...filter, timeRange: e.target.value as SearchTimeRange })
            }
          >
            {TIME_KEYS.map((r) => (
              <option key={r.v} value={r.v}>
                {t(r.key)}
              </option>
            ))}
          </select>
        </label>

        {hasActive && (
          <button
            type="button"
            className="sf__clear"
            onClick={() => onChange(DEFAULT_SEARCH_FILTER)}
          >
            {t('search.clearFilters')}
          </button>
        )}
      </div>

      {tags.length > 0 && (
        <div className="sf__tags" role="group" aria-label={t('search.filter.tags')}>
          {tags.map((tag) => {
            const active = filter.tags.includes(tag)
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={active}
                className={`sf__tag${active ? ' is-active' : ''}`}
                style={solidTagChipStyle(active ? stableTagColor(tag) : 'var(--color-white)')}
                onClick={() =>
                  onChange({
                    ...filter,
                    tags: active
                      ? filter.tags.filter((x) => x !== tag)
                      : [...filter.tags, tag],
                  })
                }
              >
                {tag}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

const styles = `
.sf { display: flex; flex-direction: column; gap: var(--space-2); margin-top: var(--space-2); }
.sf__row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.sf__seg { display: inline-flex; border: var(--border-hairline); border-radius: var(--radius-sm); overflow: hidden; }
.sf__seg-btn {
  appearance: none; -webkit-appearance: none;
  background: var(--color-white); color: var(--color-black);
  border: 0; font-family: var(--font-mono); font-size: var(--font-size-xs);
  text-transform: uppercase; letter-spacing: 0.08em;
  padding: var(--space-1) var(--space-2); min-height: 44px; cursor: pointer;
}
.sf__seg-btn.is-active { background: var(--color-black); color: var(--color-white); }
.sf__seg-btn:focus-visible { outline: 2px solid var(--color-red); outline-offset: 1px; }
.sf__field { display: inline-flex; align-items: center; gap: var(--space-1); }
.sf__select {
  appearance: none; -webkit-appearance: none;
  font-family: var(--font-mono); font-size: var(--font-size-xs);
  text-transform: uppercase; letter-spacing: 0.08em;
  padding: var(--space-1) var(--space-5) var(--space-1) var(--space-2);
  background: var(--color-white); color: var(--color-black);
  border: var(--border-hairline); border-radius: var(--radius-sm); cursor: pointer;
  background-image: linear-gradient(45deg, transparent 50%, var(--color-gray) 50%),
    linear-gradient(135deg, var(--color-gray) 50%, transparent 50%);
  background-position: calc(100% - 12px) calc(50% - 1px), calc(100% - 9px) calc(50% - 1px);
  background-size: 3px 3px, 3px 3px; background-repeat: no-repeat;
}
.sf__select:focus-visible { outline: 2px solid var(--color-red); outline-offset: 1px; }
.sf__clear {
  appearance: none; -webkit-appearance: none;
  background: transparent; border: 0; cursor: pointer;
  font-family: var(--font-mono); font-size: var(--font-size-xs);
  color: var(--color-red); text-decoration: underline; text-underline-offset: 2px;
  min-height: 44px;
}
.sf__tags { display: flex; flex-wrap: wrap; gap: var(--space-1); }
.sf__tag {
  appearance: none; -webkit-appearance: none;
  font-family: var(--font-display); font-weight: 600; font-size: var(--font-size-xs);
  border: 1px solid var(--color-black); border-radius: 1px;
  padding: var(--space-quarter) var(--space-1); min-height: 44px; cursor: pointer;
}
.sf__tag.is-active { border: 2px solid var(--color-black); }
.sf__tag:not(.is-active) { background: var(--color-white); color: var(--color-black); opacity: 0.6; }
.sf__tag:focus-visible { outline: 2px solid var(--color-red); outline-offset: 1px; }
`
