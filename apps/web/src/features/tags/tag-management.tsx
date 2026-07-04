'use client'

/**
 * TagManagement — /tags 管理表（D5）。
 *
 * 受控：cards（非删除）+ onApplyChanges（落库）。内部用 tag-ops 纯函数算变更。
 * 操作：改名（点标签名行内编辑）/ 改色（点色块 popover，10 色取一）/ 删（单行去标）/
 * 合并（勾 ≥2 个 → 顶 bar 选 target → 一次性多源合）。
 */
import { useEffect, useRef, useState } from 'react'
import type { Card, TagColor } from '@cys-stift/domain'
import { TAG_COLORS } from '@cys-stift/domain'
import {
  aggregateTags,
  renameTag,
  recolorTag,
  deleteTag,
  mergeTagsInto,
  type TagChange,
} from './tag-ops'
import { WorkbenchIcon } from '@/features/canvas/workbench-icons'
import { useI18n } from '@/lib/i18n'

export interface TagManagementProps {
  cards: Card[]
  onApplyChanges: (changes: TagChange[]) => void
}

export function TagManagement({ cards, onApplyChanges }: TagManagementProps) {
  const { t } = useI18n()
  const tags = aggregateTags(cards)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [colorFor, setColorFor] = useState<string | null>(null)
  const [mergeTarget, setMergeTarget] = useState('')
  const renameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renaming) renameRef.current?.select()
  }, [renaming])

  const toggle = (v: string) =>
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(v)) n.delete(v)
      else n.add(v)
      return n
    })

  const startRename = (v: string) => {
    setRenaming(v)
    setDraft(v)
  }
  const commitRename = (old: string) => {
    const nv = draft.trim()
    if (nv && nv !== old) onApplyChanges(renameTag(cards, old, nv))
    setRenaming(null)
  }

  const sel = [...selected]
  const doMerge = () => {
    if (sel.length < 2 || !mergeTarget) return
    const targetTag = tags.find((x) => x.value === mergeTarget)
    if (!targetTag) return
    const sources = sel.filter((v) => v !== mergeTarget)
    onApplyChanges(
      mergeTagsInto(cards, sources, { value: targetTag.value, color: targetTag.color }),
    )
    setSelected(new Set())
    setMergeTarget('')
  }

  return (
    <div className="tm">
      <style>{styles}</style>
      {sel.length >= 2 && (
        <div className="tm__bar" role="region" aria-label={t('tags.mergeAction')}>
          <span className="tm__bar-info">{t('tags.mergeSelected', { n: String(sel.length) })}</span>
          <select
            className="tm__select"
            value={mergeTarget}
            onChange={(e) => setMergeTarget(e.target.value)}
            aria-label={t('tags.mergePickTarget')}
          >
            <option value="">{t('tags.mergePickTarget')}</option>
            {sel.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="tm__bar-btn tm__bar-btn--primary"
            onClick={doMerge}
            disabled={!mergeTarget}
          >
            {t('tags.mergeAction')}
          </button>
          <button
            type="button"
            className="tm__bar-btn"
            onClick={() => {
              setSelected(new Set())
              setMergeTarget('')
            }}
          >
            {t('common.cancel')}
          </button>
        </div>
      )}

      <div className="tm__table" role="table">
        <div className="tm__head" role="row">
          <span className="tm__cell tm__cell--check" />
          <span className="tm__cell tm__cell--color">{t('tags.colColor')}</span>
          <span className="tm__cell tm__cell--name">{t('tags.colName')}</span>
          <span className="tm__cell tm__cell--count">{t('tags.colCount')}</span>
          <span className="tm__cell tm__cell--actions">{t('tags.colActions')}</span>
        </div>
        {tags.map((tag) => {
          const isRenaming = renaming === tag.value
          const popoverOpen = colorFor === tag.value
          const checked = selected.has(tag.value)
          return (
            <div key={tag.value} className={`tm__row${checked ? ' is-sel' : ''}`} role="row">
              <span className="tm__cell tm__cell--check">
                <button
                  type="button"
                  className={`tm__check${checked ? ' is-on' : ''}`}
                  role="checkbox"
                  aria-checked={checked}
                  aria-label={t('tags.selectTag', { value: tag.value })}
                  onClick={() => toggle(tag.value)}
                />
              </span>
              <span className="tm__cell tm__cell--color">
                <button
                  type="button"
                  className="tm__swatch"
                  style={{ background: tag.color }}
                  aria-label={t('tags.recolorTag', { value: tag.value })}
                  onClick={() => setColorFor(popoverOpen ? null : tag.value)}
                >
                  {popoverOpen && (
                    <span className="tm__popover" role="dialog" aria-label={t('tags.colColor')}>
                      {TAG_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={`tm__swatch-mini${c === tag.color ? ' is-cur' : ''}`}
                          style={{ background: c }}
                          aria-label={String(c)}
                          onClick={(e) => {
                            e.stopPropagation()
                            onApplyChanges(recolorTag(cards, tag.value, c as TagColor))
                            setColorFor(null)
                          }}
                        />
                      ))}
                    </span>
                  )}
                </button>
              </span>
              <span className="tm__cell tm__cell--name">
                {isRenaming ? (
                  <input
                    ref={renameRef}
                    className="tm__rename"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => commitRename(tag.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(tag.value)
                      else if (e.key === 'Escape') setRenaming(null)
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="tm__name"
                    onClick={() => startRename(tag.value)}
                    title={t('tags.renameTag', { value: tag.value })}
                  >
                    {tag.value}
                  </button>
                )}
              </span>
              <span className="tm__cell tm__cell--count">{tag.count}</span>
              <span className="tm__cell tm__cell--actions">
                <button
                  type="button"
                  className="tm__act"
                  onClick={() => startRename(tag.value)}
                  aria-label={t('tags.renameTag', { value: tag.value })}
                  title={t('tags.renameTag', { value: tag.value })}
                >
                  <WorkbenchIcon name="pencil" size={14} />
                </button>
                <button
                  type="button"
                  className="tm__act tm__act--danger"
                  onClick={() => onApplyChanges(deleteTag(cards, tag.value))}
                  aria-label={t('tags.deleteTag', { value: tag.value })}
                  title={t('tags.deleteTag', { value: tag.value })}
                >
                  <WorkbenchIcon name="trash" size={14} />
                </button>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const styles = `
.tm { font-family: var(--font-body); }
.tm__bar {
  display: flex; align-items: center; gap: var(--space-2);
  padding: var(--space-2); border: var(--border-thick);
  background: var(--color-black); color: var(--color-white);
  margin-bottom: var(--space-2); flex-wrap: wrap;
}
.tm__bar-info { font-family: var(--font-display); font-weight: 600; font-size: var(--font-size-sm); }
.tm__select {
  font-family: var(--font-body); font-size: var(--font-size-sm);
  padding: var(--space-quarter) var(--space-1); border: var(--border-hairline);
  background: var(--color-white); color: var(--color-black);
}
.tm__bar-btn {
  font-family: var(--font-display); font-weight: 600; font-size: var(--font-size-sm);
  padding: var(--space-quarter) var(--space-2); border: var(--border-hairline);
  background: var(--color-white); color: var(--color-black); cursor: pointer;
}
.tm__bar-btn--primary { background: var(--color-red); color: var(--color-white); border-color: var(--color-red); }
.tm__bar-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.tm__table { border: var(--border-thick); background: var(--color-white); }
.tm__head, .tm__row {
  display: grid;
  grid-template-columns: 40px 44px 1fr 60px 96px;
  align-items: center;
}
.tm__head {
  background: var(--color-black); color: var(--color-white);
  font-family: var(--font-display); font-weight: 600; font-size: var(--font-size-xs);
  text-transform: uppercase; letter-spacing: 0.06em;
}
.tm__head > * { padding: var(--space-1) var(--space-2); }
.tm__row { border-top: var(--border-hairline); }
.tm__row.is-sel { background: var(--color-yellow-soft); }
.tm__cell { padding: var(--space-1) var(--space-2); }
.tm__check {
  width: 18px; height: 18px; border: var(--border-hairline);
  background: var(--color-white); cursor: pointer; padding: 0; justify-self: center;
}
.tm__check.is-on { background: var(--color-black); position: relative; }
.tm__check.is-on::after {
  content: '✓'; position: absolute; inset: 0; display: grid; place-items: center;
  color: var(--color-white); font-size: 11px; line-height: 1;
}
.tm__swatch {
  width: 20px; height: 20px; border: var(--border-hairline);
  cursor: pointer; padding: 0; position: relative;
}
.tm__popover {
  position: absolute; top: 24px; left: 0; z-index: 5;
  background: var(--color-white); border: var(--border-thick);
  box-shadow: var(--shadow-md); padding: var(--space-1);
  display: grid; grid-template-columns: repeat(5, 1fr); gap: var(--space-quarter);
}
.tm__swatch-mini { width: 20px; height: 20px; border: var(--border-hairline); cursor: pointer; padding: 0; }
.tm__swatch-mini.is-cur { outline: 2px solid var(--color-black); outline-offset: 1px; }
.tm__name {
  font-family: var(--font-display); font-weight: 600; font-size: var(--font-size-sm);
  background: transparent; border: 0; padding: 0; cursor: text; text-align: left;
  color: var(--color-black);
}
.tm__name:hover { text-decoration: underline; }
.tm__rename {
  font-family: var(--font-body); font-size: var(--font-size-sm);
  border: var(--border-hairline); padding: 2px var(--space-1); width: 100%;
  background: var(--color-white); color: var(--color-black);
}
.tm__rename:focus { outline: 2px solid var(--color-red); outline-offset: 1px; }
.tm__count { font-family: var(--font-mono); font-size: var(--font-size-sm); color: var(--color-gray); }
.tm__cell--actions { display: flex; gap: var(--space-quarter); }
.tm__act {
  width: 26px; height: 26px; border: var(--border-hairline);
  background: var(--color-white); cursor: pointer; display: inline-grid; place-items: center; padding: 0;
}
.tm__act:hover { background: var(--color-yellow-soft); }
.tm__act--danger:hover { background: var(--color-red-soft); }
`
