'use client'

/**
 * WorkbenchPanel — 工作台 dock 面板（D2）。附在选中卡外侧的复杂编辑区。
 *
 * 受控组件：page 传 card + onSave + onClose（与 CardDetailModal 同口径）。
 *   - card：当前要编辑的卡。
 *   - onSave({title, body, tags})：page 落 service.update + updateCardShape（同步画布）。
 *   - onClose：收起（page 调 workbenchStore.close）。
 *
 * 编辑：标题 input + MarkdownEditor（富 markdown 源 + 工具栏 + 预览）。
 * 存：autosave 防抖 500ms；收起时若脏则 flush 再 close（防丢编辑）。
 */
import { useEffect, useRef, useState } from 'react'
import type { Card, TagRef } from '@cys-stift/domain'
import { Tag } from '@cys-stift/ui'
import { MarkdownEditor } from '@/features/card/markdown-editor'
import { WorkbenchIcon } from '@/features/canvas/workbench-icons'
import { typeKeyOf } from '@/lib/type-label'
import { useI18n } from '@/lib/i18n'

export interface WorkbenchPanelProps {
  card: Card
  onSave: (patch: { title: string; body: string; tags: TagRef[] }) => void
  onClose: () => void
  /**
   * 专注编辑态（工作台撑满 + 画布缩预览）。
   * 头部按钮读它显示图标（true=collapse / false=expand）。
   * 可选：默认 false。T5 在 page 接线 store.setFocusEdit。
   */
  focusEdit?: boolean
  /**
   * 切换专注态（由 page 实现：store.setFocusEdit + 与 focusMode 互斥）。
   * 可选：默认 no-op。Toggle 是 VIEW 切换；脏草稿由既有防抖 autosave 持久化，无需 flush。
   */
  onToggleFocusEdit?: () => void
}

export function WorkbenchPanel({
  card,
  onSave,
  onClose,
  focusEdit = false,
  onToggleFocusEdit,
}: WorkbenchPanelProps) {
  const { t } = useI18n()
  const [title, setTitle] = useState(card.title)
  const [body, setBody] = useState(card.body)

  // 最新草稿 + 最新 onSave 放 ref，避免防抖 effect 依赖函数身份。
  const draftRef = useRef({ title, body })
  draftRef.current = { title, body }
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

  // 切卡时重置草稿（card.id 变或 card 内容变）
  useEffect(() => {
    setTitle(card.title)
    setBody(card.body)
  }, [card.id, card.title, card.body])

  // 防抖自动存（500ms）。脏才存。
  useEffect(() => {
    const id = setTimeout(() => {
      const d = draftRef.current
      if (d.title !== card.title || d.body !== card.body) {
        onSaveRef.current({ title: d.title, body: d.body, tags: card.tags ?? [] })
      }
    }, 500)
    return () => clearTimeout(id)
  }, [title, body, card.title, card.body, card.tags])

  const handleClose = () => {
    // 收起前 flush 脏编辑，防丢。
    const d = draftRef.current
    if (d.title !== card.title || d.body !== card.body) {
      onSaveRef.current({ title: d.title, body: d.body, tags: card.tags ?? [] })
    }
    onClose()
  }

  const barColor = card.color ?? 'gray'

  return (
    <aside className="wb-panel" aria-label={t('card.detail.title')}>
      <style>{styles}</style>
      <header className="wb-panel__head">
        <span className={`wb-panel__bar wb-panel__bar--${barColor}`} aria-hidden="true" />
        <input
          className="wb-panel__title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('card.untitled')}
          maxLength={200}
          aria-label={t('card.detail.fieldTitle')}
        />
        <Tag color="black">{t(typeKeyOf(card.type))}</Tag>
        <button
          type="button"
          data-testid="wb-focus-toggle"
          className="wb-panel__focus"
          onClick={onToggleFocusEdit}
          aria-label={focusEdit ? t('canvas.exitFocus') : t('canvas.focusEdit')}
          aria-pressed={focusEdit}
          title={focusEdit ? t('canvas.exitFocus') : t('canvas.focusEdit')}
        >
          <WorkbenchIcon name={focusEdit ? 'collapse' : 'expand'} size={16} />
        </button>
        <button
          type="button"
          className="wb-panel__close"
          onClick={handleClose}
          aria-label={t('common.close')}
          title={t('common.close')}
        >
          <WorkbenchIcon name="collapse" size={16} />
        </button>
      </header>
      <div className="wb-panel__body">
        <MarkdownEditor value={body} onChange={setBody} />
      </div>
    </aside>
  )
}

const styles = `
.wb-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--color-white);
}
.wb-panel__head {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2) var(--space-1) var(--space-3);
  border-bottom: var(--border-thick);
  background: var(--color-white);
  flex-shrink: 0;
}
.wb-panel__bar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
}
.wb-panel__bar--red { background: var(--color-red); }
.wb-panel__bar--yellow { background: var(--color-yellow); }
.wb-panel__bar--blue { background: var(--color-blue); }
.wb-panel__bar--gray { background: var(--color-gray); }
.wb-panel__title {
  flex: 1;
  min-width: 0;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: var(--font-size-lg);
  border: 0;
  border-bottom: var(--border-hairline);
  border-bottom-color: transparent;
  outline: 0;
  background: transparent;
  color: var(--color-black);
  padding: var(--space-quarter) 0;
}
.wb-panel__title:focus { border-bottom-color: var(--color-red); }
.wb-panel__title:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
.wb-panel__close {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: var(--border-hairline);
  background: var(--color-white);
  color: var(--color-black);
  cursor: pointer;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}
.wb-panel__close:hover { background: var(--color-yellow-soft); }
.wb-panel__close:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
.wb-panel__focus {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: var(--border-hairline);
  background: var(--color-white);
  color: var(--color-black);
  cursor: pointer;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}
.wb-panel__focus:hover { background: var(--color-yellow-soft); }
.wb-panel__focus:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
.wb-panel__focus[aria-pressed="true"] {
  background: var(--color-black);
  color: var(--color-white);
}
/* 触摸目标放大:画板/窄屏(<1024)按钮 28→40,与 canvas rail 事实标准对齐。 */
@media (max-width: 1023px) {
  .wb-panel__close, .wb-panel__focus { width: 40px; height: 40px; }
}
.wb-panel__body {
  flex: 1;
  min-height: 0;
  padding: var(--space-1);
  display: flex;
  flex-direction: column;
}
.wb-panel__body .md-editor { flex: 1; min-height: 0; }
`
