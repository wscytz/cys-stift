'use client'

import { Tag } from '@cys-stift/ui'
import type { Card } from '@cys-stift/domain'
import { useI18n } from '@/lib/i18n'
import { typeKeyOf } from '@/lib/type-label'
import type { MessageKey } from '@/lib/i18n/messages'

interface ArchiveCardTileProps {
  card: Card
  variant?: 'tile' | 'row'
  selected: boolean
  selectMode: boolean
  onClick: () => void
  onToggleSelect: () => void
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
  selected,
  selectMode,
  onClick,
  onToggleSelect,
  disabled = false,
  onTogglePin,
}: ArchiveCardTileProps) {
  const { t } = useI18n()
  const preview = card.body.slice(0, 120)
  const totalMedia = card.links.length + card.codeSnippets.length + card.quotes.length
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
          {totalMedia > 0 && <Tag color="red">{totalMedia} media</Tag>}
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
        <label className="tile__check" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            aria-label={titleText}
          />
        </label>
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
.tile:hover, .row:hover { box-shadow: var(--shadow-md); }
.tile:active, .row:active { transform: translate(2px, 2px); box-shadow: none; }

.tile__check {
  position: absolute;
  top: var(--space-1);
  left: var(--space-1);
  z-index: 2;
  background: var(--color-white);
  padding: 2px 4px;
  border-radius: 2px;
  cursor: pointer;
}
.tile__check input { cursor: pointer; }

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
.tile__title {
  margin: 0;
  font-family: var(--font-display);
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
  font-family: var(--font-display);
  font-size: var(--font-size-base);
  font-weight: 500;
  line-height: 1.4;
  letter-spacing: -0.005em;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
`
