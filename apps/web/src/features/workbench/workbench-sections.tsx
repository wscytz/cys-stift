'use client'

import { useMemo, useState } from 'react'
import type { Card, CanvasId } from '@cys-stift/domain'
import { useI18n } from '@/lib/i18n'
import { useCanvases } from '@/lib/canvas-store'
import type { WorkbenchModeId } from './workbench-modes'
import { groupForMode, extractPinned, type WorkbenchSection } from './workbench-grouping'
import { plainPreview } from './preview-text'

/**
 * WorkbenchSections — 分区列表(手风琴:同时只一区展开)。
 *
 * 折叠态 = 卡组堆叠(A:3 张卡硬阴影叠厚度);展开态 = 行列表(C:色条+标题+预览)。
 * 行点击 → onOpenCard(工作台右栏就地编辑,不跳画布)。当前编辑卡(activeCardId)高亮。
 *
 * canvas 模式 + 收件箱 + 手风琴。type/tag 模式经 groupForMode 路由同构渲染。
 */
export function WorkbenchSections({
  cards,
  mode,
  selectedTags = [],
  tagColors = new Map<string, string>(),
  activeCardId = null,
  onOpenCard,
}: {
  cards: Card[]
  mode: WorkbenchModeId
  selectedTags?: string[]
  tagColors?: Map<string, string>
  /** 当前编辑卡(高亮)。null = 无。 */
  activeCardId?: string | null
  /** 行点击:就地编辑(工作台右栏接管)。 */
  onOpenCard: (card: Card) => void
}) {
  const { t } = useI18n()
  const { snapshot } = useCanvases()

  // canvas 名映射(画布列表;未知 id 兜底「已删画布」)
  const canvasNames = useMemo(() => {
    const m = new Map<CanvasId, string>()
    for (const c of snapshot.canvases) m.set(c.id, c.name)
    return m
  }, [snapshot.canvases])

  const { pinned, rest } = useMemo(() => extractPinned(cards), [cards])

  const sections = useMemo(
    () =>
      groupForMode(mode, rest, {
        canvasNames,
        inboxLabel: t('workbench.inbox'),
        unknownCanvasLabel: t('workbench.unknownCanvas'),
        otherLabel: t('workbench.other'),
        selectedTags,
        tagColors,
      }),
    [mode, rest, canvasNames, t, selectedTags, tagColors],
  )

  // 手风琴:展开的 section key(null = 全折叠)。默认展开第一个分区。
  const [expanded, setExpanded] = useState<string | null>(sections[0]?.key ?? null)

  if (rest.length === 0 && pinned.length === 0) {
    return <div className="wb__no-match">{t('workbench.noSections')}</div>
  }

  return (
    <div className="wb__sections">
      {pinned.length > 0 && (
        <section className="wb__sec wb__sec--pinned">
          <div className="wb__pinnedhd">
            <span className="wb__pinicon" aria-hidden="true">★</span>
            <span className="wb__seclbl">{t('workbench.pinned')}</span>
            <span className="wb__seccnt">{pinned.length}</span>
          </div>
          <ul className="wb__rows wb__rows--pinned">
            {pinned.map((c) => (
              <li
                key={c.id}
                className={`wb__row${c.id === activeCardId ? ' wb__row--active' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => onOpenCard(c)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onOpenCard(c)
                  }
                }}
              >
                <span className="wb__rb" style={{ background: 'var(--color-yellow)' }} aria-hidden="true" />
                <div className="wb__rowtext">
                  <div className="wb__rowtitle">{c.title || plainPreview(c.body, 40) || c.id}</div>
                  <div className="wb__rowpreview">{plainPreview(c.body, 60)}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {sections.map((s) => (
        <WorkbenchSectionRow
          key={s.key}
          section={s}
          expanded={expanded === s.key}
          activeCardId={activeCardId}
          onToggle={() => setExpanded(expanded === s.key ? null : s.key)}
          onOpenCard={onOpenCard}
        />
      ))}
      <style>{styles}</style>
    </div>
  )
}

/** 单个分区:表头(色条+名+计数+展开箭头)+ 折叠卡组/展开行列表。 */
function WorkbenchSectionRow({
  section,
  expanded,
  activeCardId = null,
  onToggle,
  onOpenCard,
}: {
  section: WorkbenchSection
  expanded: boolean
  activeCardId?: string | null
  onToggle: () => void
  onOpenCard: (card: Card) => void
}) {
  const preview3 = section.cards.slice(0, 3)
  return (
    <section
      className={`wb__sec${section.isInbox ? ' wb__sec--inbox' : ''}`}
    >
      <button
        type="button"
        className="wb__sechd"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className="wb__chv" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
        <span className="wb__bb" style={{ background: section.colorBar }} aria-hidden="true" />
        <span className="wb__seclbl">{section.label}</span>
        <span className="wb__seccnt">{section.cards.length}</span>
      </button>
      {expanded ? (
        <ul className="wb__rows">
          {section.cards.map((c) => (
            <li
              key={c.id}
              className={`wb__row${c.id === activeCardId ? ' wb__row--active' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => onOpenCard(c)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onOpenCard(c)
                }
              }}
            >
              <span className="wb__rb" style={{ background: section.colorBar }} aria-hidden="true" />
              <div className="wb__rowtext">
                <div className="wb__rowtitle">{c.title || plainPreview(c.body, 40) || c.id}</div>
                <div className="wb__rowpreview">{plainPreview(c.body, 60)}</div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        // 折叠态:卡组堆叠(A,最多 3 张硬阴影叠厚度)
        preview3.length > 0 && (
          <div className="wb__deck" aria-hidden="true">
            {preview3
              .slice()
              .reverse()
              .map((c, i) => (
                <div key={c.id} className="wb__minicard" style={{ opacity: i === 0 ? 1 : 0.9 }}>
                  <span className="wb__mcbar" style={{ background: section.colorBar }} />
                  <div className="wb__mctitle">{c.title || plainPreview(c.body, 24) || c.id}</div>
                  <div className="wb__mcpreview">{plainPreview(c.body, 30)}</div>
                </div>
              ))}
          </div>
        )
      )}
    </section>
  )
}

const styles = `
.wb__sections { display: flex; flex-direction: column; }
.wb__sec { border-top: 1px solid var(--color-black); }
.wb__sec:first-child { border-top: 0; }
/* 已固定置顶区(跨模式常驻最顶,黄底) */
.wb__sec--pinned { background: var(--color-yellow-soft); }
.wb__pinnedhd {
  display: flex; align-items: center; gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
}
.wb__pinicon { color: var(--color-yellow); font-size: var(--font-size-sm); }
.wb__rows--pinned { padding-bottom: var(--space-1); }
.wb__sec--inbox .wb__sechd,
.wb__sec--inbox .wb__rows { border-left: 0; }
.wb__sec--inbox .wb__deck { border-style: dashed; border-width: 1.5px; border-color: var(--color-gray); margin-left: var(--space-2); margin-right: var(--space-2); }
.wb__sechd {
  display: flex; align-items: center; gap: var(--space-2);
  width: 100%; padding: var(--space-2) var(--space-3);
  background: transparent; border: 0; cursor: pointer;
  font-family: var(--font-display); text-align: left;
}
.wb__sechd:hover { background: var(--color-gray-soft); }
.wb__sechd:focus-visible { outline: 2px solid var(--color-red); outline-offset: -2px; }
.wb__chv { font-size: var(--font-size-xs); color: var(--color-black); width: 12px; }
.wb__bb { width: 4px; height: 16px; flex-shrink: 0; }
.wb__seclbl { font-weight: 600; font-size: var(--font-size-sm); color: var(--color-black); }
.wb__seccnt {
  margin-left: auto; font-size: var(--font-size-xs); color: var(--color-gray);
  border: 1.5px solid var(--color-gray-soft); padding: 1px var(--space-1); border-radius: 1px;
}
/* 展开态行列表(C) */
.wb__rows { list-style: none; margin: 0; padding: 0 0 var(--space-2); }
.wb__row {
  display: flex; align-items: center; gap: var(--space-2);
  padding: var(--space-1) var(--space-3) var(--space-1) var(--space-4);
  cursor: pointer;
}
.wb__row:hover { background: var(--color-gray-soft); }
.wb__row--active { background: var(--color-yellow-soft); box-shadow: inset 3px 0 0 var(--color-red); }
.wb__row:focus-visible { outline: 2px solid var(--color-red); outline-offset: -2px; }
.wb__rb { width: 4px; height: 26px; flex-shrink: 0; }
.wb__rowtext { min-width: 0; }
.wb__rowtitle {
  font-family: var(--font-display); font-weight: 600;
  font-size: var(--font-size-sm); line-height: 1.2;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.wb__rowpreview {
  font-size: var(--font-size-xs); color: var(--color-gray); line-height: 1.25; margin-top: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 240px;
}
/* 折叠态卡组堆叠(A) */
.wb__deck { position: relative; height: 52px; margin: 0 var(--space-3) var(--space-2); }
.wb__minicard {
  position: absolute; width: 150px; height: 40px;
  background: var(--color-white); border: 1.5px solid var(--color-black);
  box-shadow: var(--shadow-md); border-radius: 1px;
}
.wb__deck .wb__minicard:nth-child(1) { top: 16px; left: 10px; z-index: 1; }
.wb__deck .wb__minicard:nth-child(2) { top: var(--space-1); left: var(--space-0.5); z-index: 2; }
.wb__deck .wb__minicard:nth-child(3) { top: 0; left: 0; z-index: 3; }
/* 单卡折叠态:只有一张卡时不应用堆叠偏移,居正。 */
.wb__deck > .wb__minicard:only-child { top: 0; left: 0; }
.wb__mcbar { position: absolute; left: 0; top: 0; bottom: 0; width: 4px; }
.wb__mctitle {
  font-family: var(--font-display); font-weight: 600; font-size: var(--font-size-xs);
  padding: var(--space-1) var(--space-1) 0 var(--space-2);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.wb__mcpreview {
  font-size: var(--font-size-xs); color: var(--color-gray); padding: 1px 8px 0 12px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
`
