'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { BauhausMotif, Button, Card as UICard, Modal, Tag, Toolbar } from '@cys-stift/ui'
import type { Card, CardId } from '@cys-stift/domain'
import { findDuplicateGroups, type DuplicateGroup } from '@cys-stift/domain'
import { CreateCardForm } from './create-card-form'
import { CardDetailModal } from '@/features/card/card-detail'
import { useGlobalEdges } from '@/features/graph/use-global-edges'
import { liveEdgesOnly } from '@/features/graph/aggregate-edges'
import { DEFAULT_CANVAS_ID } from '@/features/canvas/default-canvas'
import { useCanvases } from '@/lib/canvas-store'
import { captureSinkRegistry } from '@/features/capture/capture-sink'
import { useDb } from '@/lib/db-client'
import { useI18n } from '@/lib/i18n'
import { useIsMobile } from '@/lib/use-platform'
import { PageLoading } from '@/components/page-loading'
import { typeKeyOf } from '@/lib/type-label'
import { markdownPreview } from '@/features/card/markdown-preview'
import { getDeviceId } from '@/lib/device-id'
import { pushToast } from '@/lib/toast-store'

type View = 'inbox' | 'archived'

const DEVICE_ID = getDeviceId()

export default function InboxPage() {
  const { t } = useI18n()
  const { snap, service, ready } = useDb()
  // 跨画布 backlinks(只读):聚合全局边后过滤端点已软删的(G7 防泄露),传 CardDetailModal
  // 显示「这张卡和谁有关系」。canEditRelations 不传(默认 false=只读,无 × 删除/+ 添加钮)。
  const { edges } = useGlobalEdges()
  const liveEdges = useMemo(
    () => liveEdgesOnly(edges, service.listAll()),
    // snap 是 useSyncExternalStore 快照,数据变化才换引用(同 graph 页 liveEdges 口径)。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [edges, snap, service],
  )
  void snap // subscribe to the snapshot so the component re-renders on changes
  const [view, setView] = useState<View>('inbox')
  // Phase archive-detail: detail state simplified — modal owns view/edit
  // toggle now (was DetailState { card, mode } + page-level confirm).
  const [detail, setDetail] = useState<Card | null>(null)
  // 批量多选(P12 UX 打磨):checkbox 选中卡片,底部动作栏批量归档/移到画布/删除。
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // 批量删除确认门(与 archive.batch 一致):点删除先弹 Modal 确认,防误删多张。
  // softDelete 可从 /trash 恢复,但误删多张要逐张找回,确认门值得。
  const [confirmDeleteIds, setConfirmDeleteIds] = useState<string[] | null>(null)
  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const clearSelection = useCallback(() => setSelected(new Set()), [])
  // v0.15 follow-up: "Send to canvas" routes to the user's currently
  // active canvas (read from canvasStore), not the hardcoded default.
  const { snapshot: canvasesSnap } = useCanvases()

  // Inbox = no canvasPosition, not archived, not soft-deleted
  const inbox = pinFirst(service.listInbox())
  const archived = pinFirst(
    service
      .listAll()
      .filter((c) => c.archived && !c.deletedAt)
      .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime()),
  )
  const visible = view === 'inbox' ? inbox : archived

  // 切 view 时丢弃跨 view 的选中(避免选中当前不可见的卡)。
  useEffect(() => {
    clearSelection()
  }, [view, clearSelection])

  // CaptureHost dispatches cys-stift:open-card when the user taps "打开" on the
  // capture success toast (plan Task 8). Resolve the id to a live card and
  // open the detail modal.
  useEffect(() => {
    const onOpenCard = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id
      if (!id) return
      const card = snap.cards.find((c) => c.id === id)
      if (card) setDetail(card)
    }
    window.addEventListener('cys-stift:open-card', onOpenCard as EventListener)
    return () => window.removeEventListener('cys-stift:open-card', onOpenCard as EventListener)
  }, [snap])

  // DR2-T2: inbox 粘贴桥。inbox 没有画布 host(它是捕获入口),所以不能调
  // createCardOnCanvas(它要 host 加几何)。直接用 service.createWithId 落 DB +
  // canvasPosition,几何在用户去 /canvas 时由 loadCardsIntoEditor 从 DB 读出渲染。
  // 粘 [card #x create] 行 → 建卡落默认画布;粘非 card DSL(rect/text/arrow,含
  // `[` 但无 card create)→ toast 引导去 /canvas;普通文本(无 `[`)→ 不打扰。
  useEffect(() => {
    if (!ready) return
    const isEditable = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false
      if (el.isContentEditable) return true
      const tag = el.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
    }
    const onPaste = (e: ClipboardEvent) => {
      if (isEditable(e.target)) return
      const text = e.clipboardData?.getData('text/plain') ?? ''
      const looksLikeDsl = text.split('\n').some((ln) => /^\s*\[/.test(ln))
      if (!looksLikeDsl) return
      e.preventDefault()
      const cardLines = text.split('\n').filter((ln) => /^\s*\[card\b/i.test(ln) && /\bcreate\b/.test(ln))
      let created = 0
      for (const ln of cardLines) {
        const idMatch = ln.match(/#([a-zA-Z0-9_-]+)/)
        const posMatch = ln.match(/@pos\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/)
        const sizeMatch = ln.match(/@size\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/)
        if (!idMatch) continue
        const id = idMatch[1] as CardId
        if (service.get(id)) continue
        const x = posMatch ? Number(posMatch[1]) : 0
        const y = posMatch ? Number(posMatch[2]) : 0
        const w = sizeMatch ? Number(sizeMatch[1]) : 240
        const h = sizeMatch ? Number(sizeMatch[2]) : 120
        try {
          service.createWithId(id, {
            title: '',
            source: { kind: 'manual', deviceId: DEVICE_ID },
            canvasPosition: { canvasId: DEFAULT_CANVAS_ID, x, y, w, h, z: 0, rotation: 0 },
          })
          created++
        } catch {
          // 配额满:createWithId 内 repo.insert 已 notifyQuota 弹 toast + throw。
          // break 不续建(原无 catch 会冒泡炸 paste effect + 静默丢后续行)。
          break
        }
      }
      if (created > 0) {
        pushToast({ kind: 'success', message: t('canvas.inboxPasteCreated', { n: String(created) }) })
      } else if (cardLines.length === 0) {
        pushToast({ kind: 'info', message: t('canvas.inboxPasteGuide') })
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, service, t])

  // 批量动作(循环调单卡 service;同步,一次 re-render)。
  // Reconcile against the live/visible card ids first: a selected card may
  // have been soft-deleted / archived-out elsewhere (e.g. via the detail
  // modal opened from the same page) leaving a stale id in `selected`. We
  // drop ids that no longer exist on this view so the count and batch ops
  // only act on cards that are still here.
  const visibleIds = new Set<string>(visible.map((c) => c.id))
  const liveSelected = new Set<string>([...selected].filter((id) => visibleIds.has(id)))
  const selectedArr = [...liveSelected]
  const batchArchive = () => {
    const n = selectedArr.length
    for (const id of selectedArr) {
      if (view === 'inbox') service.archive(id as CardId)
      else service.unarchive(id as CardId)
    }
    clearSelection()
    pushToast({
      kind: 'success',
      message: t(
        view === 'inbox' ? 'inbox.batch.archivedN' : 'inbox.batch.unarchivedN',
        { n: String(n) },
      ),
    })
  }
  const requestBatchDelete = () => {
    if (selectedArr.length === 0) return
    setConfirmDeleteIds(selectedArr)
  }
  const confirmBatchDelete = () => {
    if (!confirmDeleteIds) return
    const n = confirmDeleteIds.length
    for (const id of confirmDeleteIds) service.softDelete(id as CardId)
    setConfirmDeleteIds(null)
    clearSelection()
    pushToast({
      kind: 'success',
      message: t('inbox.batch.deletedN', { n: String(n) }),
    })
  }
  const batchSendToCanvas = () => {
    const n = selectedArr.length
    const targetCanvasId = canvasesSnap.activeCanvasId ?? DEFAULT_CANVAS_ID
    // 算 baseZ = 已有卡 max(z)+1,批量卡用 baseZ+i(原 z:i 从 0 起,与已有卡 z 堆叠;
    // single 路径 onSendToCanvas 正确算 nextZ,此处对齐)。
    const existing = service.listOnCanvas(targetCanvasId)
    const baseZ = existing.length === 0 ? 0 : Math.max(...existing.map((c) => c.canvasPosition?.z ?? 0)) + 1
    selectedArr.forEach((id, i) => {
      service.moveToCanvas(id as CardId, {
        canvasId: targetCanvasId,
        x: 100 + (i % 5) * 40,
        y: 100 + (i % 5) * 40,
        w: 200,
        h: 80,
        z: baseZ + i,
      })
    })
    clearSelection()
    pushToast({
      kind: 'success',
      message: t('inbox.batch.sentToCanvasN', { n: String(n) }),
    })
  }
  const selectAll = () => setSelected(new Set(visible.map((c) => c.id)))

  // 找重复(本地精确去重,零 AI):URL/代码片段/标题归一化等值。
  // **纯提示,不替用户决定**:只报有几组重复 + 各组维度,不自动选中、不跳选。
  // 用户自己决定要不要去翻找处理(精确重复一眼能看出,工具只负责提醒"存在")。
  const dupGroups = useMemo(() => findDuplicateGroups(visible), [visible])
  const findDuplicates = () => {
    if (dupGroups.length === 0) {
      pushToast({ kind: 'info', message: t('inbox.dup.none') })
      return
    }
    const byDim = (dim: DuplicateGroup['dimension']) =>
      dupGroups.filter((g) => g.dimension === dim).length
    pushToast({
      kind: 'info',
      message: t('inbox.dup.summary', {
        n: String(dupGroups.length),
        url: String(byDim('url')),
        code: String(byDim('code')),
        title: String(byDim('title')),
      }),
    })
  }

  // Bug B fix: derive the LIVE card from the store by id during render.
  // The page re-renders on any store change (useDb subscription), but the
  // modal used to keep showing the STALE `detail` object captured when the
  // card was opened — including a ghost card that was since soft-deleted /
  // archived / edited elsewhere (another tab, a batch action, an AI append).
  // service.get returns soft-deleted cards too, so we filter on !deletedAt:
  // when the card is gone (or soft-deleted) effectiveDetail becomes null and
  // the modal unmounts. Edited-elsewhere cards show fresh data. Action
  // callbacks still read detail.id (stable across the open lifecycle).
  const liveDetail = detail ? (service.get(detail.id) ?? null) : null
  const effectiveDetail =
    liveDetail && !liveDetail.deletedAt ? liveDetail : null

  return (
    <main id="main" tabIndex={-1} className="page">
      <Toolbar region="inbox">
        <span className="crumb">{t('brand.name')}</span>
        <span className="crumb-sep">/</span>
        <h1 className="crumb crumb--here">{t('inbox.crumb')}</h1>
        <span className="crumb-spacer" />
        <div
          role="tablist"
          aria-label={t('inbox.crumb')}
          className="tablist"
        >
          <button
            type="button"
            role="tab"
            id="tab-inbox"
            aria-selected={view === 'inbox'}
            tabIndex={view === 'inbox' ? 0 : -1}
            className={`tab ${view === 'inbox' ? 'tab--active' : ''}`}
            onClick={() => setView('inbox')}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault()
                const next = view === 'inbox' ? 'archived' : 'inbox'
                setView(next)
                // Move focus to the newly active tab (roving tabindex).
                requestAnimationFrame(() => {
                  document.getElementById(`tab-${next}`)?.focus()
                })
              }
            }}
          >
            {t('inbox.tab.inbox')}
          </button>
          <button
            type="button"
            role="tab"
            id="tab-archived"
            aria-selected={view === 'archived'}
            tabIndex={view === 'archived' ? 0 : -1}
            className={`tab ${view === 'archived' ? 'tab--active' : ''}`}
            onClick={() => setView('archived')}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault()
                const next = view === 'inbox' ? 'archived' : 'inbox'
                setView(next)
                requestAnimationFrame(() => {
                  document.getElementById(`tab-${next}`)?.focus()
                })
              }
            }}
          >
            {t('inbox.tab.archived')}
          </button>
        </div>
        <Tag color={view === 'inbox' ? 'red' : 'blue'}>
          {view === 'inbox' ? inbox.length : archived.length}
        </Tag>
        <span className="crumb-spacer" />
        <button
          type="button"
          className="tb-snap"
          onClick={findDuplicates}
          disabled={visible.length < 2}
          title={t('inbox.dup.title')}
        >
          {t('inbox.dup.title')}
          {dupGroups.length > 0 && (
            <Tag color="yellow">{dupGroups.length}</Tag>
          )}
        </button>
      </Toolbar>

      <div
        className="page-content page-content--wide"
        role="tabpanel"
        id={`tabpanel-${view}`}
        aria-labelledby={`tab-${view}`}
      >
        {view === 'inbox' && (
          <CreateCardForm
            ready={ready}
            onCreate={(input) => {
              // Unified capture entry (Phase 6.5e + 6.5g): all capture
              // entry-points route through captureSinkRegistry →
              // WebCaptureSink → service.fromCapture. Same onSubmit
              // shape regardless of source.kind.
              // CaptureInput.links is `string[]`; ConvertCardForm gives
              // us LinkPreview[]; extract URL string array for the sink.
              //
              // H2/H3 fix: RETURN the promise (was `void`) so
              // CreateCardForm.handleSubmit can await it and only reset
              // the form + clear the draft on SUCCESS — on quota failure
              // the user's typed input stays put (the exact silent-loss
              // the MiniInput fix prevents). Mirrors MiniInput's
              // onSubmit contract (Promise<boolean>: true=saved,
              // false=kept-for-retry). We surface the error toast here
              // (the form has no toast wiring of its own for this path).
              return captureSinkRegistry
                .submit({
                  source: { kind: 'manual', deviceId: DEVICE_ID },
                  title: input.title,
                  body: input.body,
                  links: input.links.map((l) => l.url),
                  codeSnippets: input.codeSnippets,
                  quotes: input.quotes,
                })
                .then(() => true)
                .catch((e: unknown) => {
                  const msg = e instanceof Error ? e.message : String(e)
                  pushToast({
                    kind: 'error',
                    message: t('capture.persistFailed', { error: msg }),
                  })
                  return false
                })
            }}
          />
        )}

        {!ready ? (
          <PageLoading />
        ) : visible.length === 0 ? (
          <EmptyState view={view} />
        ) : (
          <ul className="grid">
            {visible.map((card) => (
              <li key={card.id}>
                <CardTile
                  card={card}
                  selected={selected.has(card.id)}
                  onToggleSelect={() => toggleSelect(card.id)}
                  onOpen={() => setDetail(card)}
                  onTogglePin={() =>
                    service.update(card.id, { pinned: !card.pinned })
                  }
                />
              </li>
            ))}
          </ul>
        )}

        {view === 'inbox' && (
          <p className="footnote">
            <Link href="/" className="footnote__link">← {t('common.home')}</Link>
          </p>
        )}
      </div>

      {liveSelected.size > 0 && (
        <div className="batch-bar" role="toolbar" aria-label={t('inbox.batch.title')}>
          <span className="batch-bar__count" aria-live="polite">
            {t('inbox.batch.count', { n: String(liveSelected.size) })}
          </span>
          <button type="button" className="batch-bar__btn" onClick={batchArchive}>
            {view === 'inbox' ? t('inbox.batch.archive') : t('inbox.batch.unarchive')}
          </button>
          {view === 'inbox' && (
            <button type="button" className="batch-bar__btn" onClick={batchSendToCanvas}>
              {t('inbox.batch.sendToCanvas')}
            </button>
          )}
          <button type="button" className="batch-bar__btn batch-bar__btn--danger" onClick={requestBatchDelete}>
            {t('inbox.batch.delete')}
          </button>
          <span className="batch-bar__spacer" />
          <button type="button" className="batch-bar__btn" onClick={selectAll}>
            {t('inbox.batch.selectAll')}
          </button>
          <button type="button" className="batch-bar__btn" onClick={clearSelection}>
            {t('inbox.batch.cancel')}
          </button>
        </div>
      )}

      {confirmDeleteIds && (
        <Modal
          open
          onClose={() => setConfirmDeleteIds(null)}
          title={t('inbox.batch.deleteConfirmTitle', { n: confirmDeleteIds.length })}
          closeLabel={t('common.close')}
        >
          <p className="confirm__body">
            {t('inbox.batch.deleteConfirmBody', { n: confirmDeleteIds.length })}
          </p>
          <div className="confirm__actions">
            <Button variant="ghost" onClick={() => setConfirmDeleteIds(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={confirmBatchDelete}>
              {t('inbox.batch.deleteConfirmAction', { n: confirmDeleteIds.length })}
            </Button>
          </div>
        </Modal>
      )}

      {effectiveDetail && (
        <CardDetailModal
          card={effectiveDetail}
          globalEdges={liveEdges}
          getCardTitle={(id) => service.get(id as CardId)?.title}
          actions={['archive', 'unarchive', 'sendToCanvas', 'softDelete', 'pin', 'export', 'rewrite', 'summarize', 'translate']}
          onClose={() => setDetail(null)}
          onSave={(patch) => {
            const updated = service.update(effectiveDetail.id, patch)
            if (updated) setDetail(updated)
            return updated != null
          }}
          onTogglePin={() => {
            const updated = service.update(effectiveDetail.id, { pinned: !effectiveDetail.pinned })
            if (updated) setDetail(updated)
          }}
          onArchive={() => {
            service.archive(effectiveDetail.id)
            setDetail(null)
          }}
          onUnarchive={() => {
            service.unarchive(effectiveDetail.id)
            setDetail(null)
          }}
          onSendToCanvas={() => {
            // Phase v0.15 follow-up: send to whichever canvas is
            // currently active in canvasStore (multi-canvas). Falls
            // back to DEFAULT_CANVAS_ID if the store hasn't hydrated
            // yet (first render / SSR).
            const targetCanvasId = canvasesSnap.activeCanvasId ?? DEFAULT_CANVAS_ID
            const existing = service.listOnCanvas(targetCanvasId)
            const nextZ = existing.length === 0
              ? 0
              : Math.max(...existing.map((c) => c.canvasPosition?.z ?? 0)) + 1
            service.moveToCanvas(effectiveDetail.id, {
              canvasId: targetCanvasId,
              x: 100 + (nextZ % 5) * 40,
              y: 100 + (nextZ % 5) * 40,
              w: 200,
              h: 80,
              z: nextZ,
            })
            const updated = service.get(effectiveDetail.id)
            if (updated) setDetail(updated)
          }}
          onConfirmDelete={() => {
            service.softDelete(effectiveDetail.id)
            setDetail(null)
          }}
          onAIAppendNew={(c) => {
            // M3 — AI "Append as new card". Goes through captureSinkRegistry
            // for consistency with the inbox CreateCardForm path. The popover
            // already showed an optimistic success toast, so on failure we
            // surface an error toast here. submit() ALWAYS returns a Promise
            // (converts sync throws → rejections), so a try/catch is dead —
            // we .catch the rejection instead (H2 fix: was an unhandled
            // rejection + silent loss on quota failure).
            void captureSinkRegistry
              .submit({
                source: { kind: 'manual', deviceId: DEVICE_ID },
                title: c.title,
                body: c.body,
              })
              .catch((e: unknown) => {
                const msg = e instanceof Error ? e.message : String(e)
                pushToast({
                  kind: 'error',
                  message: t('capture.persistFailed', { error: msg }),
                })
              })
          }}
        />
      )}

      <style>{styles}</style>
    </main>
  )
}

const styles = `
.page { min-height: 100vh; background: var(--color-white); color: var(--color-black); }
.tablist { display: inline-flex; }
.tab {
  min-height: 44px;
  padding: 0 var(--space-2);
  background: transparent;
  border: 0;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--color-gray);
  cursor: pointer;
  border-bottom: 2px solid transparent;
}
.tb-snap {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  min-height: 44px;
  padding: 0 var(--space-2);
  border: var(--border-hairline);
  border-radius: var(--radius-sm);
  background: var(--color-white);
  color: var(--color-black);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  cursor: pointer;
}
.tb-snap:disabled { opacity: 0.5; cursor: not-allowed; }
.tb-snap:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
.tab--active { color: var(--color-black); border-bottom-color: var(--color-red); font-weight: 600; }
.tab:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }

.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--space-3) var(--space-4);
}

/* tile 共享视觉 chrome 在 shared.css §15(2026-07-03 合并:原 inbox 红条 +
   archive 蓝条同构,~85% 重合;inbox 走默认 red bar,archive 加 .tile--bar-blue,
   pinned 走 yellow 赢;状态优先级统一:pinned 赢;active 统一到 .tile__main)。 */
.batch-bar {
  position: fixed; left: 50%; bottom: var(--space-4); transform: translateX(-50%);
  z-index: 30;
  display: inline-flex; align-items: center; gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-white); border: 2px solid var(--color-black); border-radius: var(--radius-sm);
  box-shadow: 4px 4px 0 0 var(--color-black);
  font-family: var(--font-mono); white-space: nowrap;
}
.batch-bar__count {
  font-size: var(--font-size-xs); letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--color-black); padding: 0 var(--space-1);
}
.batch-bar__btn {
  min-height: 44px; padding: 0 var(--space-2);
  display: inline-flex; align-items: center;
  background: transparent; border: 1px solid var(--color-black); border-radius: var(--radius-sm);
  color: var(--color-black); font-family: var(--font-mono);
  font-size: var(--font-size-xs); letter-spacing: 0.1em; text-transform: uppercase;
  cursor: pointer; transition: background 80ms ease-out, color 80ms ease-out;
}
.batch-bar__btn:hover { background: var(--color-black); color: var(--color-white); }
.batch-bar__btn--danger:hover { background: var(--color-red); border-color: var(--color-red); }
.batch-bar__spacer { width: var(--space-3); }
.batch-bar__btn:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
@media (max-width: 767px) {
  .batch-bar {
    left: var(--space-2);
    right: var(--space-2);
    bottom: calc(var(--space-2) + env(safe-area-inset-bottom));
    transform: none;
    justify-content: center;
    flex-wrap: wrap;
    white-space: normal;
    box-sizing: border-box;
  }
  .batch-bar__spacer { display: none; }
}
`

// ── Subcomponents ──────────────────────────────────────────────────────────

/** Phase A (v0.24.0): stable partition that lifts pinned cards to the
 * front without reordering the rest. sort() isn't stable across engines,
 * so we partition instead — preserves the underlying list order within
 * each group. */
function pinFirst<T extends { pinned: boolean }>(cards: T[]): T[] {
  const pinned = cards.filter((c) => c.pinned)
  const rest = cards.filter((c) => !c.pinned)
  return [...pinned, ...rest]
}

function CardTile({
  card,
  selected,
  onToggleSelect,
  onOpen,
  onTogglePin,
}: {
  card: Card
  selected: boolean
  onToggleSelect: () => void
  onOpen: () => void
  onTogglePin: () => void
}) {
  const { t } = useI18n()
  const preview = markdownPreview(card.body)
  const totalMedia =
    (card.links ?? []).length + (card.codeSnippets ?? []).length + (card.quotes ?? []).length
  return (
    <div className={`tile ${card.pinned ? 'tile--pinned' : ''} ${selected ? 'tile--selected' : ''}`}>
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
      <button
        type="button"
        className="tile__select"
        onClick={(e) => {
          e.stopPropagation()
          onToggleSelect()
        }}
        aria-label={t('inbox.batch.select')}
        aria-pressed={selected}
      >
        {selected ? '✓' : ''}
      </button>
      <button type="button" className="tile__main" onClick={onOpen}>
        <div className="tile__bar" aria-hidden="true" />
        <div className="tile__body">
          <h3 className="tile__title">{card.title || t('card.untitled')}</h3>
          {preview && <p className="tile__preview">{preview}</p>}
          <div className="tile__meta">
            <Tag color="red">{t(typeKeyOf(card.type))}</Tag>
            {totalMedia > 0 && <Tag color="blue">{t('card.mediaCount', { n: totalMedia })}</Tag>}
            <span className="tile__time">
              {card.capturedAt.toLocaleDateString()}
            </span>
          </div>
        </div>
      </button>
    </div>
  )
}

function EmptyState({ view }: { view: View }) {
  const { t } = useI18n()
  // 移动端无系统全局热键;inbox.empty.hint 文案写死 ⌘⇧E,触屏设备上误导 → 隐藏。
  const isMobile = useIsMobile()
  return (
    <UICard>
      <div className="page-empty">
        <BauhausMotif variant="overlap" size={160} />
        <p className="eyebrow">{t('inbox.crumb')}</p>
        <h2 className="display-title display-title--lg">
          {view === 'inbox' ? t('inbox.empty.title') : t('inbox.empty.titleArchived')}
        </h2>
        <p className="empty__lede">
          {view === 'inbox' ? t('inbox.empty.lede') : t('inbox.empty.ledeArchived')}
        </p>
        {view === 'inbox' && !isMobile && (
          <p className="empty__lede">{t('inbox.empty.hint')}</p>
        )}
      </div>
    </UICard>
  )
}
