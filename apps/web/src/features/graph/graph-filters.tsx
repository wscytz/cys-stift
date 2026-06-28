'use client'

/**
 * GraphFilters — 图谱过滤器 UI(隐藏归档 + 标签 + 类型)。
 *
 * 受控组件:filter 值与 onChange 由 page 持有,这里只渲染 + 派发。
 * 样式复用 settings 的 mono-label 口径;颜色/间距走 token,不写死。
 */
import type { CardType } from '@cys-stift/domain'
import type { GraphFilter } from './graph-filter'
import { useI18n } from '@/lib/i18n'
import { typeKeyOf } from '@/lib/type-label'
import type { MessageKey } from '@/lib/i18n/messages'

const ALL_TYPES: CardType[] = ['note', 'image', 'link', 'code', 'quote']

interface GraphFiltersProps {
  filter: GraphFilter
  onChange: (next: GraphFilter) => void
  /** 可选标签色值去重列表(给 tag select 用)。 */
  tags: string[]
}

export function GraphFilters({ filter, onChange, tags }: GraphFiltersProps) {
  const { t } = useI18n()

  return (
    <div className="graph-filters">
      <label className="graph-filters__check">
        <input
          type="checkbox"
          checked={filter.hideArchived}
          onChange={(e) => onChange({ ...filter, hideArchived: e.target.checked })}
        />
        <span className="mono-label">{t('graph.filter.hideArchived')}</span>
      </label>

      <label className="graph-filters__field">
        <span className="mono-label">{t('graph.filter.tag')}</span>
        <select
          className="graph-filters__select"
          value={filter.tag ?? ''}
          onChange={(e) =>
            onChange({ ...filter, tag: e.target.value === '' ? null : e.target.value })
          }
        >
          <option value="">{t('graph.filter.tag')}</option>
          {tags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
      </label>

      <label className="graph-filters__field">
        <span className="mono-label">{t('graph.filter.type')}</span>
        <select
          className="graph-filters__select"
          value={filter.type ?? ''}
          onChange={(e) =>
            onChange({
              ...filter,
              type: e.target.value === '' ? null : (e.target.value as CardType),
            })
          }
        >
          <option value="">{t('graph.filter.type')}</option>
          {ALL_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(typeKeyOf(type) as MessageKey)}
            </option>
          ))}
        </select>
      </label>

      <style>{styles}</style>
    </div>
  )
}

const styles = `
.graph-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}
.graph-filters__check {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  cursor: pointer;
}
.graph-filters__field {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}
.graph-filters__select {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: var(--space-1) var(--space-2);
  background: var(--color-white);
  color: var(--color-black);
  border: var(--border-hairline);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.graph-filters__select:focus { outline: 2px solid var(--color-red); outline-offset: 1px; }
`
