'use client'

/**
 * RelationPicker — 卡片详情页「添加关系」面板(RB-T2)。
 *
 * 用户在卡片详情里点「添加关系」打开本面板。流程:
 *   1. 搜索框过滤可选目标卡(排除已删 / 排除当前卡);
 *   2. 选一个目标卡;
 *   3. 在 4 种关系类型里选一种(过滤掉 embeds —— embeds 走 BR-T2 的 ((标题))
 *      自动嵌入,不该手动建);
 *   4. 确认 → onConfirm({ targetId, type })。
 *
 * 搜索复用 `@cys-stift/domain` 的 searchCards(纯函数,Phase 1 search 已用):
 *   - 空 query → 返回全部未删卡(score 0,按 capturedAt desc),刚好给用户
 *     一个「最近卡片」默认列表,无需额外排序逻辑;
 *   - 有 query → 命中打分排序。前端再截前 10 张,够选。
 *
 * 类型按钮组复用 RELATION_TYPES(过滤 embeds),swatch 取关系类型的真实 CSS
 * color token(var(--color-*)),让选中态有色块视觉反馈,与画布上箭头颜色一致。
 *
 * 本组件**无副作用**:不直接建关系(RB-T1 的 addRelation / removeRelation 由
 * card-detail 调用方在 onConfirm 里接)。它只负责 UI 交互 + 把选择结果交给
 * 调用方,职责单一。
 *
 * 无单测(UI 组件),靠 RB-T4 的 e2e + 手测覆盖。
 */
import { useMemo, useState } from 'react'
import { Button } from '@cys-stift/ui'
import { searchCards, type Card } from '@cys-stift/domain'
import { useI18n } from '@/lib/i18n'
import {
  RELATION_TYPES,
  type RelationType,
  type RelationTypeId,
} from '@/features/canvas/relation-types'

/** 选中类型默认 related-to —— 最通用的语义关系,匹配画布 RelationPanel 的默认推断。 */
const PICKABLE_TYPES: RelationType[] = RELATION_TYPES.filter((r) => r.id !== 'embeds')
const DEFAULT_TYPE_ID: RelationTypeId = 'related-to'

export interface RelationPickerSelection {
  /** 目标卡 id(from = 调用方传入的 currentCardId,to = 这里选的 targetId)。 */
  targetId: string
  /** 关系类型(4 种之一,不含 embeds)。 */
  type: RelationType
}

export interface RelationPickerProps {
  /** 当前卡 —— 选目标时排除它(不能跟自己建关系)。 */
  currentCardId: string
  /** 全部卡(含已删;组件内部过滤 !deletedAt)。由调用方从 CardService 注入。 */
  allCards: Card[]
  /** 确认回调:把 { targetId, type } 交给调用方去 addRelation。 */
  onConfirm: (selection: RelationPickerSelection) => void
  /** 取消/关闭。 */
  onCancel: () => void
}

export function RelationPicker({
  currentCardId,
  allCards,
  onConfirm,
  onCancel,
}: RelationPickerProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [targetId, setTargetId] = useState<string | null>(null)
  const [typeId, setTypeId] = useState<RelationTypeId>(DEFAULT_TYPE_ID)

  // 候选池:未删 + 排除当前卡。allCards 来自 CardService.listAll()(可能含已删)。
  const candidates = useMemo(
    () => allCards.filter((c) => !c.deletedAt && c.id !== currentCardId),
    [allCards, currentCardId],
  )

  // 搜索:searchCards 空 query 时返回全部未删卡(score 0,capturedAt desc),
  // 刚好把 candidates 按最近优先排。有 query 时按打分排。截前 10 张。
  const results = useMemo(() => {
    const live: Card[] = candidates
    const hits = searchCards(live, query)
    return hits.slice(0, 10).map((r) => r.card)
  }, [candidates, query])

  const selectedType = PICKABLE_TYPES.find((r) => r.id === typeId) ?? PICKABLE_TYPES[0]!
  const canConfirm = targetId !== null

  const handleConfirm = () => {
    if (!targetId) return
    onConfirm({ targetId, type: selectedType })
  }

  return (
    <div className="rp">
      {/* 搜索框 */}
      <input
        className="rp__search"
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('relation.searchPlaceholder')}
        aria-label={t('relation.searchPlaceholder')}
        autoFocus
      />

      {/* 结果列表:选目标卡 */}
      <ul className="rp__list" role="listbox" aria-label={t('relation.add')}>
        {results.length === 0 ? (
          <li className="rp__empty">{t('relation.empty')}</li>
        ) : (
          results.map((c) => {
            const selected = c.id === targetId
            return (
              <li key={String(c.id)} role="option" aria-selected={selected}>
                <button
                  type="button"
                  className={`rp__item${selected ? ' rp__item--selected' : ''}`}
                  onClick={() => setTargetId(c.id)}
                >
                  <span className="rp__item-title">{c.title || t('card.untitled')}</span>
                  {c.body && <span className="rp__item-body">{c.body}</span>}
                </button>
              </li>
            )
          })
        )}
      </ul>

      {/* 类型按钮组:4 种(过滤 embeds),swatch 色块取关系类型的 color token */}
      <div className="rp__types" role="radiogroup" aria-label={t('relation.title')}>
        {PICKABLE_TYPES.map((rt) => {
          const selected = rt.id === typeId
          return (
            <button
              key={rt.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`rp__type${selected ? ' rp__type--selected' : ''}`}
              onClick={() => setTypeId(rt.id)}
            >
              <span className="rp__swatch" style={{ background: rt.swatch }} aria-hidden="true" />
              {t(rt.labelKey)}
            </button>
          )
        })}
      </div>

      {/* 操作 */}
      <div className="rp__actions">
        <Button variant="ghost" onClick={onCancel}>
          {t('card.detail.cancel')}
        </Button>
        <Button variant="primary" onClick={handleConfirm} disabled={!canConfirm}>
          {t('relation.confirm')}
        </Button>
      </div>

      <style>{rpStyles}</style>
    </div>
  )
}

const rpStyles = `
.rp { display: flex; flex-direction: column; gap: var(--space-3); }

.rp__search {
  appearance: none; background: transparent;
  border: 0; border-bottom: var(--border-hairline);
  padding: var(--space-1) 0;
  font-family: var(--font-body); font-size: var(--font-size-base);
  color: var(--color-black); outline: none;
}
.rp__search:focus { border-bottom-color: var(--color-red); }
.rp__search::placeholder { color: var(--color-gray); }

.rp__list {
  list-style: none; margin: 0; padding: 0;
  display: flex; flex-direction: column; gap: var(--space-1);
  max-height: 240px; overflow-y: auto;
}
.rp__empty {
  padding: var(--space-2) var(--space-1);
  font-family: var(--font-mono); font-size: var(--font-size-xs);
  color: var(--color-gray);
}
.rp__item {
  display: flex; flex-direction: column; gap: 2px;
  width: 100%; text-align: left;
  padding: var(--space-1) var(--space-2);
  background: transparent; border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-family: var(--font-body); font-size: var(--font-size-sm);
  color: var(--color-black);
  transition: background 80ms ease-out, border-color 80ms ease-out;
}
.rp__item:hover { background: var(--color-gray-soft); border-color: var(--color-gray-soft); }
.rp__item:focus-visible { outline: 2px solid var(--color-red); outline-offset: 1px; }
.rp__item--selected {
  background: var(--color-gray-soft);
  border-color: var(--color-black);
}
.rp__item-title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rp__item-body {
  font-family: var(--font-mono); font-size: var(--font-size-xs);
  color: var(--color-gray);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.rp__types { display: flex; flex-wrap: wrap; gap: var(--space-1); }
.rp__type {
  display: inline-flex; align-items: center; gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  background: var(--color-white); color: var(--color-black);
  border: 1px solid var(--color-black);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono); font-size: var(--font-size-xs);
  text-transform: uppercase; letter-spacing: 0.08em;
  cursor: pointer; line-height: 1.3;
}
.rp__type:hover { opacity: 0.8; }
.rp__type:focus-visible { outline: 2px solid var(--color-red); outline-offset: 1px; }
.rp__type--selected { background: var(--color-black); color: var(--color-white); }
.rp__type--selected .rp__swatch { /* swatch keeps its color against black bg */ }
.rp__swatch {
  display: inline-block;
  width: 12px; height: 12px;
  border: 1px solid var(--color-black);
  flex: 0 0 auto;
}
.rp__type--selected .rp__swatch { border-color: var(--color-white); }

.rp__actions { display: flex; gap: var(--space-2); justify-content: flex-end; }
`
