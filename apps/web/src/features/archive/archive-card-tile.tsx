'use client'

import type { ReactNode } from 'react'
import { Tag } from '@cys-stift/ui'
import type { Card } from '@cys-stift/domain'
import { useI18n } from '@/lib/i18n'
import { typeKeyOf } from '@/lib/type-label'
import { markdownPreview } from '@/features/card/markdown-preview'
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
  const preview = markdownPreview(card.body)
  const totalMedia = (card.links ?? []).length + (card.codeSnippets ?? []).length + (card.quotes ?? []).length
  const titleText = card.title || t('card.untitled')
  const cls = [
    variant === 'tile' ? 'tile' : 'row',
    // archive-family 走 blue bar(tile + row 两种 variant 都加;inbox 默认 red,
    // 见 shared.css §15)。trash / search / tags / timeline 都经此组件 → 都蓝条。
    'tile--bar-blue',
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
    </div>
  )
}

/* tile 共享视觉 chrome 在 shared.css §15(2026-07-03 合并:archive 注入每实例
   <style> 的 ~135 行 inline CSS 已删,~85% 与 inbox 重合;archive 加
   .tile--bar-blue modifier → blue bar,pinned → yellow 赢;active 统一到
   .tile__main button,角标(select/pin)不再随点击抖动)。 */
