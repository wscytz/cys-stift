'use client'

/**
 * CanvasUnplacedPanel — 「未放置」面板(B-4 安全增量「canvas 为家」第一步)。
 *
 * 列出尚无 canvasPosition 的卡(未归档、未软删 = inbox 谓词),逐张「放置」到当前
 * 画布(collision-aware 自动排版,复用 planInboxCanvasPlacements)。让 canvas 成为看
 * 「已放 + 未放」的唯一主场,inbox 缩为纯捕获整理 —— 路由/导航不动,纯增量。
 *
 * Chrome 镜像 outline 面板(Bauhaus 白底 + 2px 黑边 + 4px 硬阴影),浮动左上,z-index 30。
 * 受控:cards + onPlace + onClose 由 page 传。
 */
import type { Card } from '@cys-stift/domain'
import { useI18n } from '@/lib/i18n'

const PANEL_WIDTH = 240
const BODY_MAX_HEIGHT = 360

export function CanvasUnplacedPanel({
  cards,
  onPlace,
  onClose,
}: {
  cards: Card[]
  onPlace: (card: Card) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  return (
    <div
      className="cv-unplaced"
      role="dialog"
      aria-label={t('canvas.unplaced')}
      style={{
        position: 'absolute',
        left: 'var(--space-1)',
        top: 'var(--space-1)',
        width: PANEL_WIDTH,
        zIndex: 30,
        background: 'var(--color-white)',
        border: '2px solid var(--color-black)',
        boxShadow: '4px 4px 0 0 var(--color-black)',
        borderRadius: 'var(--radius-sm)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <style>{styles}</style>
      <div className="cv-unplaced__head">
        <span className="cv-unplaced__title">{t('canvas.unplaced')}</span>
        <span className="cv-unplaced__count mono-label">{cards.length}</span>
        <button
          type="button"
          className="cv-unplaced__close"
          onClick={onClose}
          aria-label={t('common.close')}
          title={t('common.close')}
        >
          ×
        </button>
      </div>
      <div className="cv-unplaced__body">
        {cards.length === 0 ? (
          <p className="cv-unplaced__empty">{t('canvas.unplaced.empty')}</p>
        ) : (
          cards.map((card) => (
            <button
              key={String(card.id)}
              type="button"
              className="cv-unplaced__item"
              onClick={() => onPlace(card)}
              title={t('canvas.unplaced.place')}
            >
              <span className="cv-unplaced__item-title">
                {card.title || t('card.untitled')}
              </span>
              <span className="cv-unplaced__item-time">{shortTime(card.capturedAt)}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

function shortTime(value: Date): string {
  return value instanceof Date && Number.isFinite(value.getTime())
    ? value.toISOString().slice(0, 16).replace('T', ' ')
    : '—'
}

const styles = `
.cv-unplaced__head {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--space-1); padding: var(--space-1);
  border-bottom: var(--border-hairline);
}
.cv-unplaced__title {
  font-family: var(--font-mono); font-size: var(--font-size-xs);
  letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-black);
}
.cv-unplaced__close {
  appearance: none; -webkit-appearance: none;
  background: transparent; border: 0; cursor: pointer;
  font-family: var(--font-mono); font-size: var(--font-size-sm);
  min-width: 44px; min-height: 44px; color: var(--color-black);
}
.cv-unplaced__close:hover { background: var(--color-yellow); }
.cv-unplaced__close:focus-visible { outline: 2px solid var(--color-red); outline-offset: 1px; }
.cv-unplaced__body {
  max-height: 360px; overflow-y: auto;
  padding: var(--space-1); display: flex; flex-direction: column; gap: 2px;
}
.cv-unplaced__body::-webkit-scrollbar { width: 6px; }
.cv-unplaced__body::-webkit-scrollbar-thumb { background: var(--color-gray); border-radius: 3px; }
.cv-unplaced__empty {
  margin: 0; padding: var(--space-1);
  font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-gray);
}
.cv-unplaced__item {
  appearance: none; -webkit-appearance: none;
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  width: 100%; padding: 4px var(--space-1); text-align: left;
  background: transparent; color: var(--color-black);
  border: 1px solid transparent; border-radius: var(--radius-sm);
  cursor: pointer; font-family: var(--font-mono); font-size: var(--font-size-xs); line-height: 1.3;
}
.cv-unplaced__item:hover { background: var(--color-gray-soft); }
.cv-unplaced__item:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
.cv-unplaced__item-title {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;
}
.cv-unplaced__item-time {
  font-size: calc(var(--font-size-xs) - 2px); opacity: 0.7;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;
}
`
