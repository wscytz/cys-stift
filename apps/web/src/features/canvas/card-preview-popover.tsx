'use client'

import type { Card } from '@cys-stift/domain'
import { Tag } from '@cys-stift/ui'
import { MarkdownBody } from '@/app/inbox/markdown'
import { useI18n } from '@/lib/i18n'

/**
 * CardPreviewPopover - 画布 hover 只读速览浮层。
 *
 * 显示标题 + 正文 markdown 渲染 + tags +「在工作台编辑」按钮(-> onEdit)。
 * 由 self-canvas 挂 pointermove 触发,absolute 定位(调用方传 left/top 坐标)。
 * 非编辑(编辑去工作台);只读速览,调布局时快速看卡内容。
 */
export function CardPreviewPopover({
  card,
  onEdit,
  style,
}: {
  card: Card
  onEdit: () => void
  style?: React.CSSProperties
}) {
  const { t } = useI18n()
  return (
    <div className="cv-preview" style={style} role="dialog" aria-label={card.title || t('card.untitled')}>
      <style>{styles}</style>
      <div className="cv-preview__head">
        <span className="cv-preview__title">{card.title || t('card.untitled')}</span>
      </div>
      {card.body && (
        <div className="cv-preview__body">
          <MarkdownBody source={card.body} />
        </div>
      )}
      {(card.tags?.length ?? 0) > 0 && (
        <div className="cv-preview__tags">
          {(card.tags ?? []).map((tag) => (
            <Tag key={tag.value} color="gray">{tag.value}</Tag>
          ))}
        </div>
      )}
      <button type="button" className="cv-preview__edit" onClick={onEdit}>
        {t('canvas.preview.editInWorkbench')}
      </button>
    </div>
  )
}

const styles = `
.cv-preview {
  position: absolute;
  z-index: 50;
  min-width: 200px;
  max-width: 320px;
  max-height: 360px;
  overflow: auto;
  background: var(--color-white);
  border: var(--border-thick);
  box-shadow: var(--shadow-md);
  font-family: var(--font-body);
}
.cv-preview__head {
  padding: var(--space-1) var(--space-2);
  border-bottom: var(--border-hairline);
}
.cv-preview__title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: var(--font-size-sm);
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cv-preview__body {
  padding: var(--space-1) var(--space-2);
  font-size: var(--font-size-xs);
  max-height: 200px;
  overflow: auto;
}
.cv-preview__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border-top: var(--border-hairline);
}
.cv-preview__edit {
  display: block;
  width: 100%;
  padding: var(--space-1) var(--space-2);
  border: 0;
  border-top: var(--border-thick);
  background: var(--color-black);
  color: var(--color-white);
  font-family: var(--font-display);
  font-weight: 600;
  font-size: var(--font-size-xs);
  cursor: pointer;
  text-align: center;
}
.cv-preview__edit:hover { background: var(--color-red); }
`
