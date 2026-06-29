'use client'

/**
 * CardDetailModal — shared card detail / edit surface.
 *
 * Phase archive-detail (2026-06-20): extracted from inbox/page.tsx (Phase
 * 6.5b's "full 5-field editor" version) so /archive can reuse it. The
 * canvas's `card-detail-modal.tsx` is a smaller Phase 4 MVP (title +
 * body only) — intentionally NOT replaced here, it works and swapping
 * it would risk regressing tagged Phase 4.
 *
 * Consumers pick which action buttons appear via the `actions` prop:
 *   - archive context: actions=['unarchive', 'softDelete']
 *     (cannot re-archive an archived card; "Unarchive" brings it back
 *     to inbox; "Soft-delete" moves to /trash with confirm modal)
 *   - inbox context: actions=['archive','unarchive','sendToCanvas',
 *     'softDelete']. Archive/Unarchive swap based on card.archived
 *     (the same self-routing button the inbox CardDetail already used).
 *   - sendToCanvas only renders when the card has no canvasPosition
 *     (matches the inbox Phase 6.5c behaviour).
 *
 * The soft-delete confirm modal is **internal** — consumer passes
 * `onConfirmDelete` and we own the "are you sure?" dialog. This is the
 * one breaking change vs the original inbox CardDetail (which delegated
 * the confirm to the page). The page-level `confirmDelete` state + Modal
 * in inbox/page.tsx goes away as part of this phase.
 *
 * Phase M3 (2026-06-21): adds three AI action types ('rewrite' /
 * 'summarize' / 'translate'). They render inline buttons next to the
 * view-mode toolbar; their popover mounts inside the Modal so the streaming
 * output stays on-screen. The popover is only mounted when an AI action
 * is in flight — `useAIEnabled()` hides the buttons themselves if the
 * user has no AI config.
 */
import { useEffect, useRef, useState, useTransition } from 'react'
import {
  Button,
  Input,
  Modal,
  Tag,
} from '@cys-stift/ui'
import type {
  Card,
  CodeBlock,
  LinkPreview,
  MediaRef,
  Quote,
  TagRef,
} from '@cys-stift/domain'
import { TAG_COLORS } from '@cys-stift/domain'
import {
  CodeEditor,
  ListEditor,
  QuoteEditor,
  editorStyles,
  type DraftCode,
  type DraftLink,
  type DraftQuote,
  draftCodesToPayload,
  draftLinksToPayload,
  draftQuotesToPayload,
} from './editors'
import { MarkdownBody } from '@/app/inbox/markdown'
import { mediaStore } from '@/lib/media-store'
import { safeHref, isSafeImageDataUrl } from '@/lib/safe-href'
import { useI18n } from '@/lib/i18n'
import { typeKeyOf } from '@/lib/type-label'
import { downloadCardMarkdown } from '@/lib/export-card'
import { pushToast } from '@/lib/toast-store'
import { useDb } from '@/lib/db-client'
import { resolveCardByTitle } from '@/features/canvas/embed-links'
import type { GraphEdge } from '@/features/graph/aggregate-edges'
import type { MessageKey } from '@/lib/i18n/messages'
import { useAIEnabled, isAIReady, getCurrentAI } from '@/features/ai/ai-settings-provider'
import { AIPopover } from '@/features/ai/ai-popover'
import { AiSetupCard } from '@/features/ai/ai-setup-card'
import { AiActionMenu } from '@/features/ai/ai-action-menu'
// RB-T3 — 详情页建/删关系(graph 页接入):picker + builder + default canvas 常量。
import { RelationPicker } from './relation-picker'
import { addRelation, removeRelation } from '@/features/canvas/relation-builder'
import { DEFAULT_CANVAS_ID } from '@/features/canvas/default-canvas'

export type CardDetailAction =
  | 'archive'
  | 'unarchive'
  | 'sendToCanvas'
  | 'softDelete'
  | 'pin'
  | 'export'
  | 'rewrite'
  | 'summarize'
  | 'translate'

export interface CardDetailSavePatch {
  title: string
  body: string
  media: MediaRef[]
  links: LinkPreview[]
  codeSnippets: CodeBlock[]
  quotes: Quote[]
  tags: TagRef[]
}

export interface CardDetailModalProps {
  card: Card
  /** Open in edit mode for fresh-with-no-title cards (canvas dblclick
   *  path). Defaults to 'view'. */
  initialMode?: 'view' | 'edit'
  /** Which action buttons to render in the view-mode toolbar. The
   *  Archive/Unarchive button is rendered as a single self-routing
   *  toggle (whichever is in the set, the rendered one depends on
   *  card.archived). The sendToCanvas button only shows when the card
   *  has no canvasPosition. softDelete shows the built-in confirm. */
  actions: CardDetailAction[]
  onClose: () => void
  onSave: (patch: CardDetailSavePatch) => void
  onArchive?: () => void
  onUnarchive?: () => void
  onSendToCanvas?: () => void
  /** Phase A (v0.24.0): toggle pinned state. Rendered as a Pin/Unpin
   *  button in the view toolbar when 'pin' is in `actions`. */
  onTogglePin?: () => void
  /** Confirmed soft-delete (modal already asked). */
  onConfirmDelete: () => void
  /** M3 — AI "Append as new card" handler. The popover doesn't know how
   *  to create cards (that needs the active CardService), so the consumer
   *  wires it. Optional — if omitted the button is disabled. */
  onAIAppendNew?: (card: { title: string; body: string }) => void
  /** BR-T5 — 全局关系边(跨所有画布聚合)。有传才显示 backlinks 区。
   *  由 graph/inbox 等页用 useGlobalEdges() 注入;不传 = 向后兼容,
   *  backlinks 区不渲染。 */
  globalEdges?: GraphEdge[]
  /** 查对方卡 title(从 CardService)。globalEdges 非空时用。 */
  getCardTitle?: (id: string) => string | undefined
  /** 点 backlink 跳转到对方卡(由调用方决定行为:关闭 modal / 选中节点等)。 */
  onJumpToCard?: (cardId: string) => void
  /** RB-T3 — 全部卡(含已删;picker 内部过滤)。canEditRelations 时 picker 用。
   *  不传 = 无「添加关系」入口,向后兼容(inbox/archive 等原行为)。 */
  allCards?: Card[]
  /** RB-T3 — 是否允许在详情页建/删关系。默认 false。仅 graph 页传 true
   *  (它有 useGlobalEdges + service.listAll)。为 false 时:
   *  - backlinks 区只读(无 × 删除按钮、无 notOnDefaultCanvas 提示);
   *  - 无「添加关系」按钮。 */
  canEditRelations?: boolean
}

export function CardDetailModal({
  card,
  initialMode = 'view',
  actions,
  onClose,
  onSave,
  onArchive,
  onUnarchive,
  onSendToCanvas,
  onTogglePin,
  onConfirmDelete,
  onAIAppendNew,
  globalEdges,
  getCardTitle,
  onJumpToCard,
  allCards,
  canEditRelations = false,
}: CardDetailModalProps) {
  const { t } = useI18n()
  // BR-T5 — 共享版自动支持块引用嵌入:resolveEmbed 从 useDb 的 service 解析
  // ((标题)) → 目标卡 body/title。所有用 CardDetailModal 的地方都免费拿到嵌入,
  // 无需调用方传。useDb 在 SSR 返回稳定空快照,client 端拿到真实 service。
  const { service } = useDb()
  const resolveEmbed = (title: string): { body: string; title: string } | null => {
    const id = resolveCardByTitle(service.listAll(), title)
    if (!id) return null
    const c = service.get(id)
    // CRITICAL-2 fix: 软删卡(deletedAt 非空)的内容不通过 ((标题)) 嵌入到活卡详情,
    // 与 AI 隐私 R2 铁律对齐(prompts.ts 已守,embed 路径必须同样守)。
    if (!c || c.deletedAt) return null
    return { body: c.body, title: c.title }
  }
  const [mode, setMode] = useState<'view' | 'edit'>(initialMode)
  const [title, setTitle] = useState(card.title)
  const [body, setBody] = useState(card.body)
  const [media, setMedia] = useState<MediaRef[]>(card.media ?? [])
  const [links, setLinks] = useState<DraftLink[]>(() =>
    (card.links ?? []).map((l) => ({ url: l.url })),
  )
  const [codes, setCodes] = useState<DraftCode[]>(() =>
    (card.codeSnippets ?? []).map((c) => ({ language: c.language, code: c.code })),
  )
  const [quotes, setQuotes] = useState<DraftQuote[]>(() =>
    (card.quotes ?? []).map((q) => ({ text: q.text, attribution: q.attribution ?? '' })),
  )
  const [tags, setTags] = useState<TagRef[]>(card.tags ?? [])
  const [tagInput, setTagInput] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  // RB-T3 — 关系建/删的乐观更新:backlinks 区渲染用 localEdges(不是 globalEdges),
  // 这样建/删后立刻可见,无需等 useGlobalEdges 重新聚合。globalEdges 变化时同步。
  const [localEdges, setLocalEdges] = useState<GraphEdge[]>(globalEdges ?? [])
  useEffect(() => {
    setLocalEdges(globalEdges ?? [])
  }, [globalEdges])
  // RB-T3 — 「添加关系」picker 弹层(用 Modal 包)。
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  // M3 — AI entry state. The single ✨ AI button toggles:
  //   null           → entry closed
  //   'setup'        → AI not ready, show AiSetupCard
  //   'menu'         → AI ready, show AiActionMenu
  //   'summarize' | 'rewrite' | 'translate' → action chosen, AIPopover open
  const [aiView, setAiView] = useState<
    null | 'setup' | 'menu' | 'summarize' | 'rewrite' | 'translate'
  >(null)
  const [translateTo, setTranslateTo] = useState<'zh' | 'en'>('en')
  const aiEnabled = useAIEnabled()
  void aiEnabled // kept for future "configured but disabled" affordances; the
  // ✨ AI entry is ALWAYS visible per spec §3.2 (the barrier fix).
  const dialogRef = useRef<HTMLDivElement>(null)

  const has = (a: CardDetailAction) => actions.includes(a)

  // Re-sync when the consumer hands us a different card (modal re-opened
  // on a sibling without unmounting, or external update).
  //
  // Bug D fix: this used to fire on every field-array identity change
  // (card.media / links / codeSnippets / quotes / tags) and reset mode to
  // 'view' + overwrite all draft fields — which THREW AWAY in-progress
  // edits whenever the parent re-rendered with a freshly-built Card (e.g.
  // right after a save returned a new object, or an external update landed
  // while the user was typing). We now skip the resync entirely while the
  // user is in edit mode: their draft is the source of truth and will be
  // written by save. In view mode the resync still runs (covers the
  // intended post-save reset — handleSave flips mode to 'view' inside the
  // transition before the new prop arrives — and external updates the user
  // isn't actively editing through).
  useEffect(() => {
    if (mode === 'edit') return
    setTitle(card.title)
    setBody(card.body)
    setMedia(card.media ?? [])
    setLinks((card.links ?? []).map((l) => ({ url: l.url })))
    setCodes((card.codeSnippets ?? []).map((c) => ({ language: c.language, code: c.code })))
    setQuotes((card.quotes ?? []).map((q) => ({ text: q.text, attribution: q.attribution ?? '' })))
    setTags(card.tags ?? [])
    setTagInput('')
    setMode(initialMode)
    setConfirmDelete(false)
  }, [
    mode,
    card.id,
    card.title,
    card.body,
    card.media,
    card.links,
    card.codeSnippets,
    card.quotes,
    initialMode,
  ])

  // Escape closes — works whether in main modal or in confirm-delete modal.
  // Guard: when a nested Escape-consuming overlay is open, dismiss THAT inner
  // UI instead of clobbering the whole CardDetailModal.
  // Nested consumers: AI popover, confirm-delete sub-modal, tag input focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // AI popover 在前面:Escape 关掉 popover(而不是整个 CardDetail)。
      if (aiView) {
        setAiView(null)
        return
      }
      // 标签输入框正聚焦时:Escape 留给输入框(清空/失焦),不关模态。
      const active = typeof document !== 'undefined' ? document.activeElement : null
      if (active instanceof HTMLElement && active.classList.contains('cd__tag-input')) return
      if (confirmDelete) setConfirmDelete(false)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, confirmDelete, aiView])

  // Focus the title input on entering edit mode
  useEffect(() => {
    if (mode === 'edit') {
      const el = dialogRef.current?.querySelector<HTMLInputElement>(
        'input[name="edit-title"]',
      )
      el?.focus()
      el?.select()
    }
  }, [mode])

  const handleSave = () => {
    if (!title.trim()) return
    startTransition(() => {
      onSave({
        title: title.trim(),
        body,
        media: media,
        links: draftLinksToPayload(links),
        codeSnippets: draftCodesToPayload(codes),
        quotes: draftQuotesToPayload(quotes),
        tags,
      })
      setMode('view')
    })
  }

  const handleFiles = async (files: FileList | null) => {
    if (!files) return
    for (const file of Array.from(files)) {
      try {
        const ref = await mediaStore.attach(file)
        setMedia((prev) => [...prev, ref])
      } catch (err) {
        console.error('[CardDetailModal] attach failed', err)
        pushToast({ kind: 'error', message: t('card.mediaAttachFail', { name: file.name }) })
      }
    }
  }

  // Action visibility — single self-routing toggle for archive/unarchive
  // (matches inbox's existing behaviour). The sendToCanvas button only
  // appears for cards not yet on a canvas (Phase 6.5c).
  const showArchive = has('archive') && !card.archived
  const showUnarchive = has('unarchive') && card.archived
  const showSendToCanvas =
    has('sendToCanvas') && !card.canvasPosition && Boolean(onSendToCanvas)
  const showPin =
    has('pin') && Boolean(onTogglePin) && !card.canvasPosition

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={mode === 'edit' ? t('card.detail.title') : card.title || t('card.untitled')}
      >
        <div className="cd" ref={dialogRef}>
          {mode === 'view' ? (
            <>
              <div className="cd__meta">
                <Tag color="red">{t(typeKeyOf(card.type))}</Tag>
                {(card.tags ?? []).map((tag) => (
                  <span key={tag.value} className="cd__tag-chip" style={{ background: tag.color }}>
                    {tag.value}
                  </span>
                ))}
                <span className="cd__time">
                  {card.capturedAt.toISOString().slice(0, 19).replace('T', ' ')}
                </span>
              </div>
              <MarkdownBody source={card.body} resolveEmbed={resolveEmbed} />
              {/* BR-T5 / RB-T3 — 全局 backlinks 区:有传 globalEdges 才显示。按
                  card.id 过滤出/入边,复用 cd__backlink 样式(与 canvas 版一致)。
                  RB-T3:canEditRelations 时每条 default-canvas 上的边带 × 删除按钮
                  (→ removeRelation → 乐观从 localEdges 移除);非 default 画布上的
                  边显示 notOnDefaultCanvas 提示(删要回画布,这里删不掉)。区底部
                  canEditRelations && allCards 时有「添加关系」按钮 → 打开 picker。
                  渲染用 localEdges(globalEdges 的本地副本),让乐观更新可见。 */}
              {globalEdges && getCardTitle && (() => {
                const incoming = localEdges.filter((e) => e.to === card.id)
                const outgoing = localEdges.filter((e) => e.from === card.id)
                const total = incoming.length + outgoing.length
                // 没边且不允许添加 → 整个区不渲染(canEditRelations=false 的只读页保持原行为)。
                if (total === 0 && !(canEditRelations && allCards)) return null
                const handleRemove = async (edge: GraphEdge) => {
                  // 乐观:先从 localEdges 移除,再异步落库。失败不回滚(graph 页
                  // 会重新聚合 globalEdges 同步回来;失败时 store 已 save 抛错,
                  // 这里的乐观视觉与 store 实际一致 —— removeRelation 内部按 id
                  // filter,no-op 也不报错)。
                  setLocalEdges((prev) => prev.filter((e) => e.arrowId !== edge.arrowId))
                  try {
                    await removeRelation(edge.arrowId)
                  } catch (err) {
                    console.error('[CardDetailModal] removeRelation failed', err)
                    // 落库失败:回滚乐观移除,让 globalEdges 下次同步纠正。
                    setLocalEdges(globalEdges ?? [])
                  }
                }
                const renderEdge = (e: GraphEdge, dir: 'in' | 'out') => {
                  const otherId = dir === 'in' ? e.from : e.to
                  const title = getCardTitle(otherId) ?? t('card.detail.untitledCard')
                  const relLabel = e.relationType
                    ? t(e.relationType.labelKey as MessageKey)
                    : t('card.detail.relatedUntyped')
                  // RB-T3 — 只 default canvas 上的边能在详情页删(关系活在 default
                  // canvas 的 freeform store,见 relation-builder)。其它画布上的边
                  // 显示提示,删要回对应画布。
                  const removable = canEditRelations && e.canvasId === DEFAULT_CANVAS_ID
                  return (
                    <li key={e.arrowId} className="cd__backlink">
                      <button
                        type="button"
                        className="cd__backlink-btn"
                        onClick={() => onJumpToCard?.(otherId)}
                        title={t(dir === 'in' ? 'card.detail.backlinkJumpIn' : 'card.detail.backlinkJumpOut')}
                      >
                        <span className="cd__backlink-dir" aria-hidden="true">{dir === 'in' ? '←' : '→'}</span>
                        <span className="cd__backlink-title">{title}</span>
                        <span className="cd__backlink-rel">{relLabel}</span>
                      </button>
                      {removable ? (
                        <button
                          type="button"
                          className="cd__backlink-remove"
                          onClick={() => { void handleRemove(e) }}
                          aria-label={t('relation.remove')}
                          title={t('relation.remove')}
                        >
                          ×
                        </button>
                      ) : canEditRelations ? (
                        <span className="cd__backlink-hint" title={t('relation.notOnDefaultCanvas')}>
                          {t('relation.notOnDefaultCanvas')}
                        </span>
                      ) : null}
                    </li>
                  )
                }
                return (
                  <Section label={t('card.detail.backlinks')}>
                    <ul className="cd__backlinks">
                      {incoming.map((e) => renderEdge(e, 'in'))}
                      {outgoing.map((e) => renderEdge(e, 'out'))}
                    </ul>
                    {canEditRelations && allCards && (
                      <Button variant="secondary" onClick={() => setPickerOpen(true)}>
                        + {t('relation.add')}
                      </Button>
                    )}
                  </Section>
                )
              })()}
              {(card.media ?? []).length > 0 && (
                <Section label={t('card.detail.media')}>
                  <ul className="cd__media-list">
                    {(card.media ?? []).map((m, i) => {
                      const asset = mediaStore.getAsset(m.assetId)
                      if (!asset) return null
                      if (asset.kind === 'image') {
                        // Only render data URLs that pass the image allowlist
                        // (no SVG/script vectors, size-bounded). Imported
                        // assets are untrusted; a non-image or oversized data
                        // URL renders a fallback label instead of an <img>.
                        return isSafeImageDataUrl(asset.dataUrl) ? (
                          <li
                            key={String(m.assetId)}
                            className="cd__media-item"
                          >
                            <img
                              src={asset.dataUrl}
                              alt={t('card.detail.mediaAlt', { n: i + 1 })}
                              className="cd__media-img"
                            />
                          </li>
                        ) : (
                          <li
                            key={String(m.assetId)}
                            className="cd__media-item"
                          >
                            <a
                              href={safeHref(asset.dataUrl)}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {asset.mimeType} ({(asset.byteSize / 1024).toFixed(1)} KB)
                            </a>
                          </li>
                        )
                      }
                      return (
                        <li
                          key={String(m.assetId)}
                          className="cd__media-item"
                        >
                          <a
                            href={asset.dataUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {asset.mimeType} ({(asset.byteSize / 1024).toFixed(1)} KB)
                          </a>
                        </li>
                      )
                    })}
                  </ul>
                </Section>
              )}
              {(card.links ?? []).length > 0 && (
                <Section label={t('card.detail.links')}>
                  <ul className="cd__links">
                    {(card.links ?? []).map((l, i) => (
                      <li key={i}>
                        <a
                          href={safeHref(l.url)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {l.url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
              {(card.codeSnippets ?? []).length > 0 && (
                <Section label={t('card.detail.code')}>
                  {(card.codeSnippets ?? []).map((c, i) => (
                    <div key={i} className="cd__code">
                      <div className="cd__code-lang">{c.language}</div>
                      <pre className="cd__code-pre">
                        <code>{c.code}</code>
                      </pre>
                    </div>
                  ))}
                </Section>
              )}
              {(card.quotes ?? []).length > 0 && (
                <Section label={t('card.detail.quotes')}>
                  {(card.quotes ?? []).map((q, i) => (
                    <blockquote key={i} className="cd__quote">
                      <p>{q.text}</p>
                      {q.attribution && (
                        <cite className="cd__cite">— {q.attribution}</cite>
                      )}
                    </blockquote>
                  ))}
                </Section>
              )}
            </>
          ) : (
            <>
              <Input
                name="edit-title"
                label={t('card.detail.fieldTitle')}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
              />
              <label className="cd__field">
                <span className="cd__label">{t('card.detail.bodyLabel')}</span>
                <textarea
                  className="cd__textarea"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={6}
                />
              </label>
              <div className="cd__field">
                <span className="cd__label">{t('card.detail.mediaFiles')}</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    void handleFiles(e.target.files)
                    e.target.value = ''
                  }}
                  className="cd__file"
                />
                {media.length > 0 && (
                  <ul className="cd__media-list cd__media-list--edit">
                    {media.map((m, i) => {
                      const asset = mediaStore.getAsset(m.assetId)
                      if (!asset) return null
                      return (
                        <li
                          key={String(m.assetId)}
                          className="cd__media-item cd__media-item--edit"
                        >
                          {asset.kind === 'image' && (
                            <img
                              src={asset.dataUrl}
                              alt={t('card.detail.mediaAlt', { n: i + 1 })}
                              className="cd__media-img cd__media-img--thumb"
                            />
                          )}
                          <button
                            type="button"
                            className="le__remove"
                            onClick={() => {
                              mediaStore.remove(m.assetId)
                              setMedia((prev) =>
                                prev.filter((x) => x.assetId !== m.assetId),
                              )
                            }}
                            aria-label={t('card.detail.removeMediaAria')}
                          >
                            ×
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
              <ListEditor
                items={links}
                onChange={setLinks}
                make={() => ({ url: '' })}
                label={t('card.detail.linkLabel')}
                placeholder="https://…"
                fieldKey="url"
              />
              <CodeEditor items={codes} onChange={setCodes} />
              <QuoteEditor items={quotes} onChange={setQuotes} />
              <div className="cd__field">
                <span className="cd__label">{t('tag.add')}</span>
                <div className="cd__tags">
                  {tags.map((tag) => (
                    <button
                      key={tag.value}
                      type="button"
                      className="cd__tag-chip"
                      style={{ background: tag.color }}
                      aria-label={t('tag.remove') + ': ' + tag.value}
                      onClick={() =>
                        setTags((prev) => prev.filter((x) => x.value !== tag.value))
                      }
                    >
                      {tag.value} ×
                    </button>
                  ))}
                  <input
                    className="cd__tag-input"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && tagInput.trim()) {
                        e.preventDefault()
                        const val = tagInput.trim()
                        if (!tags.some((tag) => tag.value === val)) {
                          const color =
                            TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]!
                          setTags((prev) => [...prev, { value: val, color }])
                        }
                        setTagInput('')
                      }
                    }}
                    placeholder={t('tag.placeholder')}
                  />
                </div>
              </div>
            </>
          )}

          <div className="cd__actions">
            {mode === 'view' ? (
              <>
                <Button onClick={() => setMode('edit')}>{t('card.detail.edit')}</Button>
                {showPin && (
                  <Button variant="secondary" onClick={onTogglePin}>
                    {card.pinned ? t('card.detail.unpin') : t('card.detail.pin')}
                  </Button>
                )}
                {showArchive && (
                  <Button variant="secondary" onClick={onArchive}>
                    {t('card.detail.archive')}
                  </Button>
                )}
                {showUnarchive && (
                  <Button variant="secondary" onClick={onUnarchive}>
                    {t('card.detail.unarchive')}
                  </Button>
                )}
                {card.canvasPosition && has('sendToCanvas') ? (
                  <Button variant="secondary" disabled>
                    <Tag color="blue">{t('card.detail.onCanvas')}</Tag>
                  </Button>
                ) : showSendToCanvas ? (
                  <Button variant="primary" onClick={onSendToCanvas}>
                    {t('card.detail.sendToCanvas')}
                  </Button>
                ) : null}
                <span className="cd__spacer" />
                {has('summarize') && (
                  <Button
                    variant="secondary"
                    data-testid="card-ai-entry"
                    onClick={() =>
                      setAiView(isAIReady(getCurrentAI()) ? 'menu' : 'setup')
                    }
                    aria-expanded={aiView !== null}
                    aria-controls={aiView ? 'ai-entry-panel' : undefined}
                  >
                    <span className="cd__ai-mark" aria-hidden="true">»</span> {t('card.ai')}
                  </Button>
                )}
                {has('export') && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      try {
                        const size = downloadCardMarkdown(card)
                        pushToast({
                          kind: 'success',
                          message: t('card.exportSuccess', { n: size }),
                        })
                      } catch (e) {
                        pushToast({
                          kind: 'error',
                          message: t('card.exportFailed', {
                            error: (e as Error).message,
                          }),
                        })
                      }
                    }}
                  >
                    {t('card.export')}
                  </Button>
                )}
                {has('softDelete') && (
                  <Button
                    variant="danger"
                    onClick={() => setConfirmDelete(true)}
                  >
                    {t('card.detail.delete')}
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setMode('view')}>
                  {t('card.detail.cancel')}
                </Button>
                <Button variant="primary" onClick={handleSave} disabled={pending || !title.trim()}>
                  {pending ? t('card.detail.saving') : t('card.detail.save')}
                </Button>
              </>
            )}
          </div>

          {aiView === 'setup' && (
            <div id="ai-entry-panel">
              <AiSetupCard onGoToSettings={() => { window.location.href = '/settings' }} />
              <Button variant="ghost" onClick={() => setAiView(null)}>{t('card.detail.cancel')}</Button>
            </div>
          )}
          {aiView === 'menu' && (
            <div id="ai-entry-panel">
              <AiActionMenu
                onPick={(action, targetLang) => {
                  if (action === 'translate' && targetLang) setTranslateTo(targetLang)
                  // AiActionMenu emits the canonical AIAction ('improveWriting'),
                  // but aiView tracks the local 'rewrite' alias (kept for
                  // parity with the original card-detail action names). Map
                  // back so the popover mount + action prop line up.
                  setAiView(action === 'improveWriting' ? 'rewrite' : action)
                }}
              />
              <Button variant="ghost" onClick={() => setAiView(null)}>{t('card.detail.cancel')}</Button>
            </div>
          )}
          {(aiView === 'summarize' || aiView === 'rewrite' || aiView === 'translate') && (
            <AIPopover
              card={card}
              action={aiView === 'rewrite' ? 'improveWriting' : aiView}
              targetLang={aiView === 'translate' ? translateTo : undefined}
              onClose={() => setAiView(null)}
              onReplace={(body) => {
                // Bug A fix (preserved): AI replaces only the BODY. Every
                // other field comes from the COMPONENT's current edit state,
                // NOT the card prop snapshot. Payload converters
                // (draftLinksToPayload etc.) are existing helpers in this file.
                onSave({
                  title: title.trim() || card.title,
                  body,
                  media,
                  links: draftLinksToPayload(links),
                  codeSnippets: draftCodesToPayload(codes),
                  quotes: draftQuotesToPayload(quotes),
                  tags,
                })
                setBody(body)
                setAiView(null)
              }}
              onAppendNew={(c) => {
                if (onAIAppendNew) {
                  onAIAppendNew(c)
                  pushToast({ kind: 'success', message: t('ai.appendedAsNew') })
                }
                setAiView(null)
              }}
            />
          )}
        </div>
        <style>{editorStyles}</style>
        <style>{styles}</style>
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('card.detail.deleteConfirmTitle')}
      >
        <p className="cd__confirm">
          {t('card.detail.deleteConfirmBody')}
        </p>
        <div className="cd__confirm-actions">
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
            {t('card.detail.cancel')}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setConfirmDelete(false)
              onConfirmDelete()
            }}
          >
            {t('card.detail.deleteConfirmAction')}
          </Button>
        </div>
      </Modal>

      {/* RB-T3 — 「添加关系」picker 弹层。onConfirm 把 {targetId, type} 交给
          addRelation(写 default canvas 的 freeform store)→ 拿回 arrow id →
          构造乐观 GraphEdge push 到 localEdges(立刻可见)→ 关 picker。 */}
      {pickerOpen && allCards && (
        <Modal
          open
          onClose={() => setPickerOpen(false)}
          title={t('relation.add')}
        >
          <RelationPicker
            currentCardId={String(card.id)}
            allCards={allCards}
            onCancel={() => setPickerOpen(false)}
            onConfirm={async ({ targetId, type }) => {
              try {
                const arrowId = await addRelation(String(card.id), String(targetId), type)
                // 乐观 push:构造 GraphEdge,签名取自选中的 RelationType
                // (color/dash/arrowhead),与 aggregateEdges 从箭头反推的签名一致,
                // 画布打开后 inferRelationType 能正确反推。from=当前卡,to=目标卡。
                const optimisticEdge: GraphEdge = {
                  from: String(card.id),
                  to: String(targetId),
                  canvasId: DEFAULT_CANVAS_ID,
                  relationType: type,
                  isWikilink: false,
                  arrowId,
                  signature: {
                    color: type.color,
                    dash: type.dash,
                    arrowhead: type.arrowhead,
                  },
                }
                setLocalEdges((prev) => [...prev, optimisticEdge])
              } catch (err) {
                console.error('[CardDetailModal] addRelation failed', err)
                pushToast({ kind: 'error', message: t('relation.add') })
              }
              setPickerOpen(false)
            }}
          />
        </Modal>
      )}
    </>
  )
}

function Section({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <section className="cd__sec">
      <h3 className="cd__sec-h">{label}</h3>
      <div className="cd__sec-body">{children}</div>
    </section>
  )
}

const styles = `
.cd { display: flex; flex-direction: column; gap: var(--space-3); }
/* v0.22.0-ux-bugfix parity with canvas modal: tighten the gap between
   modal title and first body field. The .cd flex container's gap of
   space-3 (24px) plus the Modal component's body padding makes the
   first child feel detached; pulling it up by space-2 (16px) hugs
   the title. */
.cd > :first-child { margin-top: calc(-1 * var(--space-2)); }
.cd__meta { display: flex; align-items: center; gap: var(--space-2); }
.cd__time { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-gray); }
.cd__field { display: flex; flex-direction: column; gap: var(--space-1); }
.cd__label { font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.12em; color: var(--color-gray); }
.cd__textarea {
  appearance: none; background: transparent; border: 0; border-bottom: var(--border-hairline);
  padding: var(--space-1) 0; font-family: var(--font-body); font-size: var(--font-size-base);
  color: var(--color-black); outline: none; resize: vertical; min-height: 120px; line-height: 1.5;
}
.cd__textarea:focus { border-bottom-color: var(--color-red); }
.cd__file { font-family: var(--font-mono); font-size: var(--font-size-sm); margin-top: var(--space-1); }
.cd__actions { display: flex; gap: var(--space-2); flex-wrap: wrap; align-items: center; }
.cd__spacer { flex: 1; }
/* AI action marker: mono » glyph replacing the ✨ emoji (Bauhaus type
   system has no emoji; the » renders consistently across OSes). */
.cd__ai-mark { font-family: var(--font-mono); }
.cd__translate { display: inline-flex; gap: var(--space-1); align-items: center; }
.cd__translate-select {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: var(--space-1) var(--space-2);
  background: var(--color-white);
  color: var(--color-black);
  border: var(--border-hairline);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.cd__translate-select:disabled { opacity: 0.5; cursor: not-allowed; }
.cd__sec { display: flex; flex-direction: column; gap: var(--space-2); }
.cd__sec-h { margin: 0; font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.16em; color: var(--color-gray); }
.cd__sec-body { display: flex; flex-direction: column; gap: var(--space-2); }

.cd__media-list { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-2); }
.cd__media-item { display: inline-flex; }
.cd__media-img { max-width: 100%; border: var(--border-hairline); display: block; }
.cd__media-list--edit { margin-top: var(--space-2); }
.cd__media-item--edit { position: relative; }
.cd__media-img--thumb { width: 96px; height: 96px; object-fit: cover; }
.cd__media-item--edit .le__remove { position: absolute; top: 0; right: 0; background: var(--color-white); }

.cd__links { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-1); }
.cd__links a { color: var(--color-blue); text-decoration: underline; text-underline-offset: 2px; word-break: break-all; }
.cd__links a:hover { color: var(--color-black); }
/* BR-T5 — backlinks 区(与 canvas 版 card-detail-modal.tsx 对齐)。 */
.cd__backlinks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-1); }
.cd__backlink-btn { display: flex; align-items: center; gap: var(--space-1); width: 100%; text-align: left; padding: 4px var(--space-1); background: transparent; border: 1px solid transparent; border-radius: var(--radius-sm); cursor: pointer; font-family: var(--font-body); font-size: var(--font-size-sm); color: var(--color-black); transition: background 80ms ease-out, border-color 80ms ease-out; }
.cd__backlink-btn:hover { background: var(--color-gray-soft); border-color: var(--color-gray-soft); }
.cd__backlink-btn:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
.cd__backlink-dir { color: var(--color-gray); font-family: var(--font-mono); flex: 0 0 auto; }
.cd__backlink-title { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cd__backlink-rel { flex: 0 0 auto; font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-gray); }
/* RB-T3 — backlinks 区的 × 删除按钮(default canvas 上的边可删)与「在画布上删除」
   提示(其它画布上的边不能在详情删)。× 复用 le__remove 的硬偏移风格,贴在 row 右侧。 */
.cd__backlink-remove {
  appearance: none; -webkit-appearance: none;
  flex: 0 0 auto;
  width: 24px; height: 24px;
  background: transparent; color: var(--color-black);
  border: 1px solid transparent;
  font-family: var(--font-mono); font-size: var(--font-size-sm);
  line-height: 1; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
}
.cd__backlink-remove:hover { background: var(--color-red); color: var(--color-white); border-color: var(--color-red); }
.cd__backlink-remove:focus-visible { outline: 2px solid var(--color-red); outline-offset: 1px; }
.cd__backlink-hint {
  flex: 0 0 auto;
  font-family: var(--font-mono); font-size: var(--font-size-xs);
  color: var(--color-gray); text-transform: none; letter-spacing: 0;
}

.cd__code { border: var(--border-hairline); }
.cd__code-lang { background: var(--color-gray-soft); padding: 2px var(--space-1); font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-black-soft); border-bottom: var(--border-hairline); }
.cd__code-pre { margin: 0; padding: var(--space-2); background: var(--color-black); color: var(--color-white); font-family: var(--font-mono); font-size: var(--font-size-sm); overflow-x: auto; line-height: 1.5; }

.cd__quote { margin: 0; padding: var(--space-2) var(--space-3); border-left: 4px solid var(--color-red); background: var(--color-red-soft); }
.cd__quote p { margin: 0 0 var(--space-1); }
.cd__cite { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-black-soft); font-style: normal; }

.cd__confirm { margin: 0; color: var(--color-black-soft); line-height: 1.5; }
.cd__confirm-link { color: var(--color-blue); text-decoration: underline; text-underline-offset: 2px; }
.cd__confirm-actions { display: flex; gap: var(--space-2); justify-content: flex-end; margin-top: var(--space-2); }

.cd__tags { display: flex; flex-wrap: wrap; gap: var(--space-1); align-items: center; }
.cd__tag-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px var(--space-1); border-radius: var(--radius-sm);
  font-family: var(--font-mono); font-size: var(--font-size-xs);
  color: var(--color-black); border: 2px solid var(--color-black);
  cursor: pointer; user-select: none; line-height: 1.3;
}
/* Reset native <button> defaults so the removable tag chip renders
   identically to the old <span> (the edit-mode chip is a button so it's
   keyboard-operable + announced as remove). Inline background from the
   tag color wins over the button's UA background; we still neutralize
   appearance, font, and text-align so only .cd__tag-chip rules apply. */
button.cd__tag-chip {
  appearance: none; -webkit-appearance: none;
  font: inherit; text-align: center;
  background: var(--color-gray-soft);
}
button.cd__tag-chip:focus-visible { outline: 2px solid var(--color-red); outline-offset: 1px; }
.cd__tag-chip:hover { opacity: 0.8; }
.cd__tag-input {
  appearance: none; border: var(--border-hairline); background: transparent;
  padding: 2px var(--space-1); font-family: var(--font-mono);
  font-size: var(--font-size-xs); color: var(--color-black);
  min-width: 120px; line-height: 1.3;
}
.cd__tag-input:focus { outline: none; border-color: var(--color-red); }
`