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
import type { Card, TagRef, UpdateCardPatch } from '@cys-stift/domain'
import { Button, Tag } from '@cys-stift/ui'
import { AiActionMenu } from '@/features/ai/ai-action-menu'
import { AiSetupCard } from '@/features/ai/ai-setup-card'
import { AIPopover } from '@/features/ai/ai-popover'
import { isAIReady, getCurrentAI } from '@/features/ai/ai-settings-provider'
import { pushToast } from '@/lib/toast-store'
import { MarkdownEditor } from '@/features/card/markdown-editor'
import { editorStyles } from '@/features/card/editors'
import { useCardDraft, isDirty } from '@/features/card/use-card-draft'
import { CARD_FIELDS } from '@/features/card/field-registry'
import { FieldEditors } from '@/features/card/field-editors'
import { solidTagChipStyle, stableTagColor } from '@/lib/tag-color'
import { typeKeyOf } from '@/lib/type-label'
import { useI18n } from '@/lib/i18n'
import type { MessageKey } from '@/lib/i18n/messages'

/** 卡片色 → CSS token 的安全映射(镜像 canvas-engine colorOf 的 6 原色 allowlist)。
 *  card.color 可能来自导入文件而未经校验;若直接进 CSS `background`,恶意值
 *  `url(https://attacker)` 会在打开工作台时发请求(对"无遥测/本地优先"是隐私外泄)。
 *  白名单之外一律回退 gray,杜绝 CSS 注入/网络外泄。 */
const CARD_BAR_COLOR: Record<string, string> = {
  blue: 'var(--color-blue)',
  red: 'var(--color-red)',
  yellow: 'var(--color-yellow)',
  gray: 'var(--color-gray)',
  grey: 'var(--color-gray)',
  white: 'var(--color-white)',
  black: 'var(--color-black)',
}

export interface WorkbenchPanelProps {
  card: Card
  onSave: (cardId: string, patch: UpdateCardPatch) => boolean | void
  onClose: () => void
  onBackToList?: () => void
  onDirtyChange?: (dirty: boolean) => void
  /** A3 — AI「存为新卡」:page 用 captureSink 建新卡。返回 promise(失败 reject,page 已推 error toast)。 */
  onAIAppendNew?: (c: { title: string; body: string }) => Promise<void>
}

/**
 * 自动保存防抖。拉到 2.5s(原 500ms 太勤 → 「完成」钮失去"立即存"意义)。安全网仍在:
 * 完成(flush+close)与切卡 cleanup flush 都会落盘,所以拉长只影响"静默自动存"的频率,
 * 不丢编辑(除非半秒内关浏览器 tab,可接受)。
 */
const AUTOSAVE_DEBOUNCE_MS = 2500

export function WorkbenchPanel({
  card,
  onSave,
  onClose,
  onBackToList,
  onDirtyChange,
  onAIAppendNew,
}: WorkbenchPanelProps) {
  const { t } = useI18n()
  const { draft, setField, dirty, toPatch, reset } = useCardDraft(card, CARD_FIELDS)
  const [tagInput, setTagInput] = useState('')
  // savedFlash:flush 后短暂亮「已保存」1.5s,让 autosave 可见(用户知道编辑落了)。
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // A3 — 工作台 AI:复用 card-detail 的 aiView 状态机(menu/setup/popover/edit)。
  type AiView = null | 'menu' | 'setup' | 'summarize' | 'rewrite' | 'translate' | 'edit'
  const [aiView, setAiView] = useState<AiView>(null)
  const [translateTo, setTranslateTo] = useState<'zh' | 'en'>('en')
  const [editInstruction, setEditInstruction] = useState('')

  // toPatch/onSave/draft 放 ref:避免防抖 effect 依赖函数身份 + 切卡 cleanup 读最新 draft
  // (cleanup 闭包的 draft 是 stale —— effect deps [card.id],编辑时 draft 变不重跑 effect,
  //  闭包还停在 card.id 变时的旧 draft;切卡 flush 上一卡脏编辑要靠 draftRef.current 读最新)。
  const toPatchRef = useRef(toPatch)
  toPatchRef.current = toPatch
  const draftRef = useRef(draft)
  draftRef.current = draft
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

  // flush:脏才存 + 亮「已保存」。放 ref 让防抖 effect / close 共用,不进 effect deps。
  const flushRef = useRef<() => void>(() => {})
  flushRef.current = () => {
    if (!dirty) return
    setSaveState('saving')
    const ok = onSaveRef.current(card.id, toPatchRef.current())
    setSaveState(ok === false ? 'failed' : 'saved')
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setSaveState('idle'), 3000)
  }

  // 切卡时重置草稿(card.id 变或 card 引用变 → reset deps [card])。
  useEffect(() => {
    reset()
    setTagInput('')
    setAiView(null) // 切卡收起 AI 浮层
  }, [card.id, reset])

  // 切卡防丢编辑(bug 1 修):card.id 变时,上一张的脏 draft 在 cleanup flush。
  // cleanup 跑在所有 effect setup 前(React 顺序),此时 draft 还是上一卡(本卡 reset
  // 在上面的 reset effect setup 里),isDirty(prev, draft) 显式比上一卡 draft vs 上一卡 card。
  // close 场景 handleClose 已 flush,这里幂等再 flush(service.update 同 patch 无副作用)。
  useEffect(() => {
    const prev = card
    return () => {
      if (isDirty(prev, draftRef.current, CARD_FIELDS)) {
        onSaveRef.current(prev.id, toPatchRef.current())
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id])

  // dirty 来自 useCardDraft(草稿 vs card,聚合所有 field)。

  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])

  // 防抖自动存。脏才存。draft 变(编辑或 reset)→ timer 重置。
  useEffect(() => {
    const id = setTimeout(() => flushRef.current(), AUTOSAVE_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [draft])

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
    const cur = draft.tags as TagRef[]
    if (!val || cur.some((tg) => tg.value === val)) {
      setTagInput('')
      return
    }
    setField('tags', [...cur, { value: val, color: stableTagColor(val) }])
    setTagInput('')
  }

  return (
    <aside className="wb-panel" aria-label={t('card.detail.title')}>
      <style>{editorStyles}</style>
      <style>{styles}</style>
      <header className="wb-panel__head">
        <span className="wb-panel__bar" style={{ background: CARD_BAR_COLOR[card.color ?? 'gray'] ?? 'var(--color-gray)' }} aria-hidden="true" />
        <input
          className="wb-panel__title"
          value={draft.title as string}
          onChange={(e) => setField('title', e.target.value)}
          placeholder={t('card.untitled')}
          maxLength={200}
          aria-label={t('card.detail.fieldTitle')}
        />
        <Tag color="black">{t(typeKeyOf(card.type))}</Tag>
        <span className="wb-panel__status" aria-live="polite" data-testid="wb-status">
          {saveState === 'saving'
            ? t('workbench.saving')
            : saveState === 'failed'
              ? t('workbench.saveFailed')
              : saveState === 'saved'
                ? t('workbench.savedAt', {
                    time: new Date().toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    }),
                  })
                : dirty
                  ? t('workbench.saving')
                  : ''}
        </span>
        {onBackToList && (
          <button
            type="button"
            className="wb-panel__back"
            onClick={onBackToList}
          >
            {t('workbench.backToList')}
          </button>
        )}
        <button
          type="button"
          data-testid="wb-ai-entry"
          className="wb-panel__ai-btn"
          onClick={() => setAiView(isAIReady(getCurrentAI()) ? 'menu' : 'setup')}
          aria-expanded={aiView !== null}
          aria-label={t('card.ai')}
          title={t('card.ai')}
        >
          ✨
        </button>
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
        {(draft.tags as TagRef[]).map((tag) => (
          <span key={tag.value} className="wb-panel__tag-chip" style={solidTagChipStyle(tag.color)}>
            {tag.value}
            <button
              type="button"
              className="wb-panel__tag-remove"
              aria-label={t('tag.remove') + ': ' + tag.value}
              onClick={() =>
                setField('tags', (draft.tags as TagRef[]).filter((x) => x.value !== tag.value))
              }
            >
              ×
            </button>
          </span>
        ))}
        <input
          className="wb-panel__tag-input"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              addTag(tagInput)
            }
          }}
          onBlur={() => addTag(tagInput)}
          placeholder={t('tag.placeholder')}
          aria-label={t('tag.add')}
        />
      </div>
      <div className="wb-panel__provenance" aria-label={t('card.detail.provenance')}>
        <span>{t('card.detail.source')}: {t(workbenchSourceKey(card.source?.kind))}</span>
        <span>{t('card.detail.capturedAt')}: {workbenchCapturedAt(card.capturedAt)}</span>
        <span>
          {card.canvasPosition
            ? `${t('card.detail.canvas')}: ${String(card.canvasPosition.canvasId)} · ${t('card.detail.canvasPosition', { x: String(Math.round(card.canvasPosition.x)), y: String(Math.round(card.canvasPosition.y)) })}`
            : `${t('card.detail.canvas')}: ${t('card.detail.inbox')}`}
        </span>
      </div>
      <div className="wb-panel__fields">
        <FieldEditors fields={CARD_FIELDS} draft={draft} setField={setField} />
      </div>
      <div className="wb-panel__body">
        <MarkdownEditor value={draft.body as string} onChange={(v) => setField('body', v)} />
      </div>
      {aiView && (
        <div className="wb-panel__ai" role="dialog" aria-label={t('card.ai')}>
          {aiView === 'setup' && (
            <>
              <AiSetupCard onGoToSettings={() => { window.location.href = '/settings' }} />
              <Button variant="ghost" onClick={() => setAiView(null)}>{t('common.cancel')}</Button>
            </>
          )}
          {aiView === 'menu' && (
            <>
              <AiActionMenu
                onPick={(action, targetLang, instruction) => {
                  if (action === 'translate' && targetLang) setTranslateTo(targetLang)
                  if (action === 'editWithInstruction') {
                    setEditInstruction(instruction ?? '')
                    setAiView('edit')
                    return
                  }
                  setAiView(action === 'improveWriting' ? 'rewrite' : action)
                }}
              />
              <Button variant="ghost" onClick={() => setAiView(null)}>{t('common.cancel')}</Button>
            </>
          )}
          {(aiView === 'summarize' || aiView === 'rewrite' || aiView === 'translate' || aiView === 'edit') && (
            <AIPopover
              card={card}
              action={aiView === 'rewrite' ? 'improveWriting' : aiView === 'edit' ? 'editWithInstruction' : aiView}
              targetLang={aiView === 'translate' ? translateTo : undefined}
              instruction={aiView === 'edit' ? editInstruction : undefined}
              onClose={() => setAiView(null)}
              onReplace={(newBody) => {
                // AI 替换正文:落脏字段 patch(未改字段不进 patch,AI 只改 body)+ 更新草稿 body。
                onSave(card.id, { ...toPatch(), body: newBody })
                setField('body', newBody)
                setAiView(null)
              }}
              onAppendNew={async (c) => {
                if (onAIAppendNew) {
                  try {
                    await onAIAppendNew(c)
                    pushToast({ kind: 'success', message: t('ai.appendedAsNew') })
                  } catch {
                    // page 的 onAIAppendNew 已在 .catch 推 error toast,这里不重复
                  }
                }
                setAiView(null)
              }}
            />
          )}
        </div>
      )}
    </aside>
  )
}

function workbenchSourceKey(kind: string | undefined): MessageKey {
  switch (kind) {
    case 'shortcut': return 'card.detail.source.shortcut'
    case 'menubar': return 'card.detail.source.menubar'
    case 'paste': return 'card.detail.source.paste'
    case 'drag-drop': return 'card.detail.source.drag-drop'
    case 'webhook': return 'card.detail.source.webhook'
    case 'manual': return 'card.detail.source.manual'
    default: return 'card.detail.source.unknown'
  }
}

function workbenchCapturedAt(value: Date): string {
  return value instanceof Date && Number.isFinite(value.getTime())
    ? value.toISOString().slice(0, 19).replace('T', ' ')
    : '—'
}

const styles = `
.wb-panel {
  position: relative;
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
  min-height: 44px;
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
/* tags 编辑行:chip(× 删)+ input 回车加。色用 stableTagColor(同 value 同色,与建卡/详情统一)。 */
.wb-panel__tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border-bottom: var(--border-hairline);
  flex-shrink: 0;
}
.wb-panel__provenance {
  display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-2);
  padding: var(--space-1) var(--space-2); border-bottom: var(--border-hairline);
  color: var(--color-gray); font-family: var(--font-mono); font-size: var(--font-size-xs); line-height: 1.45;
}
.wb-panel__tag-chip {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: var(--font-size-xs);
  border: 0;
  padding: var(--space-quarter) var(--space-1);
  cursor: pointer;
  border-radius: 1px;
}
.wb-panel__tag-remove { border: 0; background: transparent; cursor: pointer; font-size: inherit; padding: 0 var(--space-1); min-width: 44px; min-height: 44px; }
.wb-panel__back { border: 1px solid var(--color-black); background: var(--color-white); min-height: 44px; padding: 0 var(--space-2); cursor: pointer; }
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
  .wb-panel__head { flex-wrap: wrap; padding-top: var(--space-2); }
  .wb-panel__title { flex: 1 0 100%; width: 100%; padding: var(--space-1) 0; }
  .wb-panel__done { min-height: 44px; }
}
.wb-panel__fields {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  border-bottom: var(--border-hairline);
  background: var(--color-white-soft);
  max-height: 40vh;
  overflow: auto;
}
.wb-panel__field { display: flex; flex-direction: column; gap: var(--space-1); }
.wb-panel__field-label {
  font-family: var(--font-mono); font-size: var(--font-size-xs);
  text-transform: uppercase; letter-spacing: 0.12em; color: var(--color-black-soft);
}
.wb-panel__body {
  flex: 1;
  min-height: 0;
  padding: var(--space-1);
  display: flex;
  flex-direction: column;
}
.wb-panel__body .md-editor { flex: 1; min-height: 0; }
/* A3 — 工作台 AI 入口 + 浮层(absolute,不挤编辑器布局)。 */
.wb-panel__ai-btn {
  min-height: 44px; padding: 0 var(--space-2);
  border: 1.5px solid var(--color-black); background: var(--color-white);
  cursor: pointer; border-radius: 1px; font-size: var(--font-size-base); line-height: 1;
  flex-shrink: 0;
}
.wb-panel__ai-btn:hover { background: var(--color-yellow); }
.wb-panel__ai-btn:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
.wb-panel__ai {
  position: absolute; right: var(--space-2); bottom: var(--space-2); z-index: 20;
  width: min(440px, calc(100% - var(--space-4)));
  max-height: calc(100% - var(--space-4)); overflow: auto;
  background: var(--color-white); border: 2px solid var(--color-black);
  box-shadow: 4px 4px 0 var(--color-black); padding: var(--space-2);
  display: flex; flex-direction: column; gap: var(--space-2);
}
`
