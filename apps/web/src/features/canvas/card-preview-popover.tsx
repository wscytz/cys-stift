'use client'

import type { Card } from '@cys-stift/domain'
import { Tag } from '@cys-stift/ui'
import { MarkdownBody } from '@/app/inbox/markdown'
import { useI18n } from '@/lib/i18n'

/**
 * CardPreviewPopover - 画布 hover 只读速览浮层。
 *
 * 显示标题 + 正文 markdown 渲染 + tags。由 self-canvas 挂 pointermove 触发,
 * absolute 定位(调用方传 left/top 坐标)。
 *
 * R9:pointer-events:none —— 浮层是纯只读速览,绝不拦截画布指针。此前浮层
 * 盖在卡上且可交互,用户想看内容停 300ms 后浮层挡住卡 → 拖/点这张卡 pointerdown
 * 落在浮层上,画布收不到(拖不动/选不中)。编辑走双击卡 / 工作台(都有入口),
 * 浮层不需要按钮;pointer-events:none 后指针落回 canvas,移出卡的延迟隐藏照常。
 */
export function CardPreviewPopover({
  card,
  style,
}: {
  card: Card
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
    </div>
  )
}

const styles = `
.cv-preview {
  position: absolute;
  z-index: 50;
  min-width: 280px;
  max-width: 440px;
  max-height: 440px;
  overflow: auto;
  background: var(--color-white);
  border: var(--border-thick);
  box-shadow: var(--shadow-md);
  font-family: var(--font-body);
  pointer-events: none; /* R9:纯只读速览,不拦截画布指针(否则盖住卡拖不动) */
}
.cv-preview__head {
  padding: var(--space-2) var(--space-3);
  border-bottom: var(--border-hairline);
}
.cv-preview__title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: var(--font-size-base);
  display: block;
  /* 标题换行不截断(原 nowrap+ellipsis 太局促);最多 2 行,超出才省略。 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.cv-preview__body {
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-sm);
  max-height: 300px;
  overflow: auto;
  line-height: 1.5;
}
.cv-preview__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  border-top: var(--border-hairline);
}
.cv-preview__edit {
  display: block;
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: 0;
  border-top: var(--border-thick);
  background: var(--color-black);
  color: var(--color-white);
  font-family: var(--font-display);
  font-weight: 600;
  font-size: var(--font-size-sm);
  cursor: pointer;
  text-align: center;
}
.cv-preview__edit:hover { background: var(--color-red); }
`
