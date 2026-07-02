'use client'

import type { ReactNode } from 'react'
import { Tag } from '@cys-stift/ui'
import type { Card } from '@cys-stift/domain'
import { useI18n } from '@/lib/i18n'
import { typeKeyOf } from '@/lib/type-label'
import type { MessageKey } from '@/lib/i18n/messages'

interface ArchiveCardTileProps {
  card: Card
  variant?: 'tile' | 'row'
  /**
   * Select props are OPTIONAL (2026-06-25 timeline view reuses this tile
   * for read-only rows with no batch-select). Archive / trash / search
   * callers pass all three; timeline omits them. The select checkbox only
   * renders when `selectMode` is truthy, so callers that omit it see no
   * checkbox UI. Defaults: selectMode=false, selected=false, noop.
   */
  selected?: boolean
  selectMode?: boolean
  onClick: () => void
  onToggleSelect?: () => void
  /**
   * 2026-06-25 (timeline): optional badge slot rendered in the meta row
   * next to the type tag (e.g. the timeline "now in: inbox / canvas X /
   * archived" state Tag). Both tile + row variants render it. Omit on
   * archive / trash / search (no badge there).
   */
  badge?: ReactNode
  /**
   * L3 (v0.23.3): when true the tile renders as a non-interactive
   * container instead of a <button>. Used by /trash where tiles are
   * display-only (restore/delete happen via sibling actions). Before
   * this, the tile was a <button> with an empty onClick — keyboard
   * users could Tab to it and press Enter with nothing happening.
   */
  disabled?: boolean
  /** Phase A (v0.24.0): pin toggle. When provided, a ★ button renders
   * in the tile corner. Omit (e.g. on /trash) to hide pinning. */
  onTogglePin?: () => void
}

/**
 * Archive card visual: 白底黑边 1px + 8px 圆角 + 左侧 8px 蓝条
 * (与 inbox 红条区分,spec §5.2 archive→blue / §5.4 Archive 视觉骨架).
 *
 * - variant="tile" 网格视图
 * - variant="row"  时间轴行式
 */
export function ArchiveCardTile({
  card,
  variant = 'tile',
  selected = false,
  selectMode = false,
  onClick,
  onToggleSelect = () => {},
  badge,
  disabled = false,
  onTogglePin,
}: ArchiveCardTileProps) {
  const { t } = useI18n()
  const preview = card.body.slice(0, 120)
  const totalMedia = (card.links ?? []).length + (card.codeSnippets ?? []).length + (card.quotes ?? []).length
  const titleText = card.title || t('card.untitled')
  const cls = [
    variant === 'tile' ? 'tile' : 'row',
    selected ? 'tile--selected' : '',
    disabled ? 'tile--disabled' : '',
    // R2 (v0.25.1): don't show the pinned visual on disabled tiles (e.g.
    // /trash) — the pin button is hidden there, so a lingering yellow
    // border would be a visual leak with no way to toggle it off.
    !disabled && card.pinned ? 'tile--pinned' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const inner = (
    <>
      <div className="tile__bar" aria-hidden="true" />
      <div className="tile__body">
        <h3 className={variant === 'tile' ? 'tile__title' : 'row__title'}>
          {titleText}
        </h3>
        {variant === 'tile' && preview && (
          <p className="tile__preview">{preview}</p>
        )}
        <div className="tile__meta">
          <Tag color="blue">{t(typeKeyOf(card.type) as MessageKey)}</Tag>
          {badge}
          {totalMedia > 0 && <Tag color="red">{t('card.mediaCount', { n: totalMedia })}</Tag>}
          <span className="tile__time">
            {card.updatedAt.toISOString().slice(0, 10)}
          </span>
        </div>
      </div>
    </>
  )

  return (
    <div className={cls}>
      {selectMode && (
        <button
          type="button"
          className="tile__select"
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect()
          }}
          aria-label={titleText}
          aria-pressed={selected}
        >
          {selected ? '✓' : ''}
        </button>
      )}
      {onTogglePin && !disabled && (
        <button
          type="button"
          className="tile__pin"
          onClick={(e) => {
            e.stopPropagation()
            onTogglePin()
          }}
          aria-label={card.pinned ? t('card.detail.unpin') : t('card.detail.pin')}
          aria-pressed={card.pinned}
        >
          {card.pinned ? '★' : '☆'}
        </button>
      )}
      {disabled ? (
        <div className="tile__main" aria-disabled="true" role="img" aria-label={titleText}>
          {inner}
        </div>
      ) : (
        <button
          type="button"
          className="tile__main"
          onClick={onClick}
          aria-label={titleText}
        >
          {inner}
        </button>
      )}
      <style>{styles}</style>
    </div>
  )
}

const styles = `
.tile, .row {
  position: relative;
  display: flex;
  text-align: left;
  background: var(--color-white);
  border: var(--border-hairline);
  border-radius: var(--radius-sm);
  cursor: pointer;
  overflow: hidden;
  color: var(--color-black);
  font-family: var(--font-body);
  transition: transform 80ms ease-out, box-shadow 80ms ease-out, border-color 80ms ease-out;
  box-shadow: var(--shadow-sm);
}
.tile { min-height: 160px; }
/* R4 (v0.25.1): state via outline (not border-width) so toggling
   pinned/selected doesn't reflow the grid. Default keeps the 1px
   hairline; the 2px outline overlays it (outline-offset -1px). Pinned
   is declared last so it wins the shared outline property when both
   states apply. */
.tile--selected { outline: 2px solid var(--color-blue); outline-offset: -1px; }
.tile--pinned { outline: 2px solid var(--color-yellow); outline-offset: -1px; }
.tile--pinned .tile__bar { background: var(--color-yellow); }
.tile--disabled { cursor: default; }
.tile--disabled:hover { box-shadow: var(--shadow-sm); }
.tile__pin {
  position: absolute; top: var(--space-1); right: var(--space-1); z-index: 2;
  width: 28px; height: 28px;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--color-white); border: var(--border-hairline); border-radius: var(--radius-sm);
  font-size: var(--font-size-base); line-height: 1; color: var(--color-gray);
  cursor: pointer; padding: 0;
}
.tile__pin:hover { color: var(--color-yellow); }
.tile__pin:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
.tile:hover, .row:hover { box-shadow: var(--shadow-md); }
.tile:active, .row:active { transform: translate(2px, 2px); box-shadow: none; }

/* Select affordance — mirrors inbox's .tile__select (square, outline-only
   when unselected; fills BLUE with ✓ when selected). Keeps visual parity
   with the inbox grid's batch-select indicator. */
.tile__select {
  position: absolute; top: var(--space-1); left: var(--space-1); z-index: 2;
  width: 28px; height: 28px;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--color-white); border: var(--border-hairline); border-radius: var(--radius-sm);
  font-family: var(--font-mono); font-size: var(--font-size-base); line-height: 1;
  color: var(--color-white); cursor: pointer; padding: 0;
}
.tile__select[aria-pressed="true"] { background: var(--color-blue); border-color: var(--color-blue); color: var(--color-white); }
.tile__select:hover:not([aria-pressed="true"]) { border-color: var(--color-blue); color: var(--color-blue); }
.tile__select:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }

.tile__main {
  flex: 1;
  display: flex;
  background: transparent;
  border: 0;
  padding: 0;
  text-align: left;
  cursor: pointer;
  color: inherit;
  font: inherit;
}
.tile__main:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
.tile__bar {
  width: 8px;
  flex-shrink: 0;
  background: var(--color-blue);
}
.tile__body {
  flex: 1;
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}
/* Fix ①: tile 变体标题避让角标带(★/☑ 在 top:space-1 + 28px,底边 y=36)。
   仅 .tile 命中(特异性 0,2,0 > base 0,1,0);.row 变体的 .tile__body 无角标,保持 24。 */
.tile .tile__body { padding-top: var(--space-5); }
.tile__title {
  margin: 0;
  font-family: var(--font-content);
  font-size: var(--font-size-lg);
  font-weight: 500;
  line-height: 1.25;
  letter-spacing: -0.01em;
}
.tile__preview {
  margin: 0;
  color: var(--color-black-soft);
  font-size: var(--font-size-sm);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.tile__meta {
  display: flex;
  gap: var(--space-1);
  align-items: center;
  margin-top: auto;
  flex-wrap: wrap;
}
.tile__time {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--color-gray);
  margin-left: auto;
}

/* Row variant (timeline) */
.row { min-height: 56px; }
.row__title {
  margin: 0;
  font-family: var(--font-content);
  font-size: var(--font-size-base);
  font-weight: 500;
  line-height: 1.4;
  letter-spacing: -0.005em;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  /* Fix ②: 长标题换行到第 2 行(原 nowrap+ellipsis 砍成一行看不全),>2 行才省略。 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
`
