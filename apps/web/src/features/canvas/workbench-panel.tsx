'use client'

/**
 * WorkbenchPanel — 工作台右栏编辑器。标题 + tags + Markdown body(autosave)。
 *
 * 受控组件:page 传 card + onSave + onClose。
 *   - onSave({title, body, tags}):page 落 service.update(+ wikilink 追踪)。
 *   - onClose:收起(page 调 workbenchStore.close)。
 *
 * 存:autosave 防抖 500ms;收起时若脏则 flush 再 close(防丢编辑)。
 */
import { useEffect, useRef, useState } from 'react'
import type { Card, TagRef } from '@cys-stift/domain'
import { TAG_COLORS } from '@cys-stift/domain'
import { Tag } from '@cys-stift/ui'
import { MarkdownEditor } from '@/features/card/markdown-editor'
import { typeKeyOf } from '@/lib/type-label'
import { useI18n } from '@/lib/i18n'

export interface WorkbenchPanelProps {
  card: Card
  onSave: (patch: { title: string; body: string; tags: TagRef[] }) => void
  onClose: () => void
}

export function WorkbenchPanel({ card, onSave, onClose }: WorkbenchPanelProps) {
  const { t } = useI18n()
  const [title, setTitle] = useState(card.title)
  const [body, setBody] = useState(card.body)
  const [tags, setTags] = useState<TagRef[]>(card.tags ?? [])
  const [tagInput, setTagInput] = useState('')
  // savedFlash:flush 后短暂亮「已保存」1.5s,让 autosave 可见(用户知道编辑落了)。
  const [savedFlash, setSavedFlash] = useState(false)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 最新草稿 + 最新 onSave 放 ref,避免防抖 effect 依赖函数身份。
  const draftRef = useRef({ title, body, tags })
  draftRef.current = { title, body, tags }
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

  // flush:脏才存 + 亮「已保存」。放 ref 让防抖 effect / close 共用,不进 effect deps。
  const flushRef = useRef<() => void>(() => {})
  flushRef.current = () => {
    const d = draftRef.current
    const curTags = card.tags ?? []
    const tagsChanged = JSON.stringify(d.tags) !== JSON.stringify(curTags)
    if (d.title !== card.title || d.body !== card.body || tagsChanged) {
      onSaveRef.current({ title: d.title, body: d.body, tags: d.tags })
      setSavedFlash(true)
      if (flashTimer.current) clearTimeout(flashTimer.current)
      flashTimer.current = setTimeout(() => setSavedFlash(false), 1500)
    }
  }

  // 切卡时重置草稿(card.id 变或 card 内容变)。
  useEffect(() => {
    setTitle(card.title)
    setBody(card.body)
    setTags(card.tags ?? [])
    setTagInput('')
  }, [card.id, card.title, card.body, card.tags])

  // dirty = 有未 flush 的编辑(草稿 vs card 当前值)。tags 用 JSON 比(小数组)。
  const curTags = card.tags ?? []
  const dirty =
    title !== card.title ||
    body !== card.body ||
    JSON.stringify(tags) !== JSON.stringify(curTags)

  // 防抖自动存(500ms)。脏才存。
  useEffect(() => {
    const id = setTimeout(() => flushRef.current(), 500)
    return () => clearTimeout(id)
  }, [title, body, tags, card.title, card.body, card.tags])

  // 卸载清 flash 定时器。
  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current)
    },
    [],
  )

  const handleClose = () => {
    flushRef.current() // 收起前 flush 脏编辑,防丢。
    onClose()
  }

  const addTag = (raw: string) => {
    const val = raw.trim()
    if (!val || tags.some((tg) => tg.value === val)) {
      setTagInput('')
      return
    }
    const color = TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]!
    setTags((prev) => [...prev, { value: val, color }])
    setTagInput('')
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
        <span className="wb-panel__status" aria-live="polite" data-testid="wb-status">
          {dirty ? t('workbench.saving') : savedFlash ? t('workbench.saved') : ''}
        </span>
        <button
          type="button"
          data-testid="wb-done"
          className="wb-panel__done"
          onClick={handleClose}
          aria-label={t('workbench.done')}
          title={t('workbench.done')}
        >
          {t('workbench.done')}
        </button>
      </header>
      <div className="wb-panel__tags">
        {tags.map((tag) => (
          <button
            key={tag.value}
            type="button"
            className="wb-panel__tag-chip"
            style={{ background: tag.color }}
            aria-label={t('tag.remove') + ': ' + tag.value}
            onClick={() => setTags((prev) => prev.filter((x) => x.value !== tag.value))}
          >
            {tag.value} ×
          </button>
        ))}
        <input
          className="wb-panel__tag-input"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addTag(tagInput)
            }
          }}
          placeholder={t('tag.placeholder')}
          aria-label={t('tag.add')}
        />
      </div>
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
.wb-panel__status {
  font-size: var(--font-size-xs);
  color: var(--color-gray);
  white-space: nowrap;
  min-width: 52px;
  text-align: right;
  flex-shrink: 0;
}
.wb-panel__done {
  padding: 0 var(--space-2);
  height: 28px;
  display: grid;
  place-items: center;
  border: 1.5px solid var(--color-black);
  background: var(--color-black);
  color: var(--color-white);
  cursor: pointer;
  border-radius: 1px;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: var(--font-size-xs);
  flex-shrink: 0;
}
.wb-panel__done:hover { background: var(--color-red); border-color: var(--color-red); }
.wb-panel__done:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
/* tags 编辑行:chip(× 删)+ input 回车加。复用 card-detail 范式 + TAG_COLORS 随机色。 */
.wb-panel__tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border-bottom: var(--border-hairline);
  flex-shrink: 0;
}
.wb-panel__tag-chip {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: var(--font-size-xs);
  border: 0;
  padding: var(--space-quarter) var(--space-1);
  color: var(--color-black);
  cursor: pointer;
  border-radius: 1px;
}
.wb-panel__tag-chip:hover { opacity: 0.8; }
.wb-panel__tag-input {
  flex: 1;
  min-width: 100px;
  border: 0;
  outline: 0;
  background: transparent;
  font-family: var(--font-body);
  font-size: var(--font-size-sm);
  color: var(--color-black);
  padding: var(--space-quarter) 0;
}
.wb-panel__tag-input:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
@media (max-width: 1023px) {
  .wb-panel__done { height: 40px; }
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
