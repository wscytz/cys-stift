'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Button, Card as UICard, Tag, Toolbar } from '@cys-stift/ui'
import type { Card, CardId } from '@cys-stift/domain'
import { CreateCardForm } from './create-card-form'
import { CardDetailModal } from '@/features/card/card-detail'
import { DEFAULT_CANVAS_ID } from '@/features/canvas/default-canvas'
import { useCanvases } from '@/lib/canvas-store'
import { captureSinkRegistry } from '@/features/capture/capture-sink'
import { useDb } from '@/lib/db-client'
import { useI18n } from '@/lib/i18n'
import { PageLoading } from '@/components/page-loading'
import { typeKeyOf } from '@/lib/type-label'
import { getDeviceId } from '@/lib/device-id'
import { pushToast } from '@/lib/toast-store'

type View = 'inbox' | 'archived'

const DEVICE_ID = getDeviceId()

export default function InboxPage() {
  const { t } = useI18n()
  const { snap, service, ready } = useDb()
  void snap // subscribe to the snapshot so the component re-renders on changes
  const [view, setView] = useState<View>('inbox')
  // Phase archive-detail: detail state simplified — modal owns view/edit
  // toggle now (was DetailState { card, mode } + page-level confirm).
  const [detail, setDetail] = useState<Card | null>(null)
  // 批量多选(P12 UX 打磨):checkbox 选中卡片,底部动作栏批量归档/移到画布/删除。
  const [selected, setSelected] = useState<Set<string>>(new Set())
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

  // Register the manual sink so CreateCardForm onCreate goes through
  // captureSinkRegistry → consistent with shortcut + menubar paths.
  // Guard against the dynamic import resolving after unmount, which
  // would otherwise register a phantom sink nobody ever unregisters.
  useEffect(() => {
    let cancelled = false
    void import('@/features/capture/capture-sink').then(({ WebCaptureSink }) => {
      if (cancelled) return
      captureSinkRegistry.register('manual', new WebCaptureSink(service))
    })
    return () => {
      cancelled = true
      captureSinkRegistry.unregister('manual')
    }
  }, [service])

  // Inbox = no canvasPosition, not archived, not soft-deleted
  const inbox = pinFirst(service.listInbox())
  const archived = pinFirst(
    service
      .listAll()
      .filter((c) => c.archived && !c.deletedAt),
  )
  const visible = view === 'inbox' ? inbox : archived

  // 切 view 时丢弃跨 view 的选中(避免选中当前不可见的卡)。
  useEffect(() => {
    clearSelection()
  }, [view, clearSelection])

  // 批量动作(循环调单卡 service;同步,一次 re-render)。
  const selectedArr = [...selected]
  const batchArchive = () => {
    for (const id of selectedArr) {
      if (view === 'inbox') service.archive(id as CardId)
      else service.unarchive(id as CardId)
    }
    clearSelection()
  }
  const batchDelete = () => {
    for (const id of selectedArr) service.softDelete(id as CardId)
    clearSelection()
  }
  const batchSendToCanvas = () => {
    const targetCanvasId = canvasesSnap.activeCanvasId ?? DEFAULT_CANVAS_ID
    selectedArr.forEach((id, i) => {
      service.moveToCanvas(id as CardId, {
        canvasId: targetCanvasId,
        x: 100 + (i % 5) * 40,
        y: 100 + (i % 5) * 40,
        w: 200,
        h: 80,
        z: i,
      })
    })
    clearSelection()
  }
  const selectAll = () => setSelected(new Set(visible.map((c) => c.id)))

  return (
    <main className="page">
      <Toolbar region="inbox">
        <span className="crumb">{t('brand.name')}</span>
        <span className="crumb-sep">/</span>
        <span className="crumb crumb--here">{t('inbox.crumb')}</span>
        <span className="crumb-spacer" />
        <button
          type="button"
          className={`tab ${view === 'inbox' ? 'tab--active' : ''}`}
          onClick={() => setView('inbox')}
        >
          {t('inbox.tab.inbox')}
        </button>
        <button
          type="button"
          className={`tab ${view === 'archived' ? 'tab--active' : ''}`}
          onClick={() => setView('archived')}
        >
          {t('inbox.tab.archived')}
        </button>
        <Tag color={view === 'inbox' ? 'red' : 'blue'}>
          {view === 'inbox' ? inbox.length : archived.length}
        </Tag>
      </Toolbar>

      <div className="page-content page-content--wide">
        {view === 'inbox' && (
          <CreateCardForm
            onCreate={(input) => {
              // Unified capture entry (Phase 6.5e + 6.5g): all capture
              // entry-points route through captureSinkRegistry →
              // WebCaptureSink → service.fromCapture. Same onSubmit
              // shape regardless of source.kind.
              // CaptureInput.links is `string[]`; ConvertCardForm gives
              // us LinkPreview[]; extract URL string array for the sink.
              void captureSinkRegistry.submit({
                source: { kind: 'manual', deviceId: DEVICE_ID },
                title: input.title,
                body: input.body,
                links: input.links.map((l) => l.url),
                codeSnippets: input.codeSnippets,
                quotes: input.quotes,
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

      {selected.size > 0 && (
        <div className="batch-bar" role="toolbar" aria-label={t('inbox.batch.title')}>
          <span className="batch-bar__count">
            {t('inbox.batch.count', { n: String(selected.size) })}
          </span>
          <button type="button" className="batch-bar__btn" onClick={batchArchive}>
            {view === 'inbox' ? t('inbox.batch.archive') : t('inbox.batch.unarchive')}
          </button>
          {view === 'inbox' && (
            <button type="button" className="batch-bar__btn" onClick={batchSendToCanvas}>
              {t('inbox.batch.sendToCanvas')}
            </button>
          )}
          <button type="button" className="batch-bar__btn batch-bar__btn--danger" onClick={batchDelete}>
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

      {detail && (
        <CardDetailModal
          card={detail}
          actions={['archive', 'unarchive', 'sendToCanvas', 'softDelete', 'pin', 'export', 'rewrite', 'summarize', 'translate']}
          onClose={() => setDetail(null)}
          onSave={(patch) => {
            const updated = service.update(detail.id, patch)
            if (updated) setDetail(updated)
          }}
          onTogglePin={() => {
            const updated = service.update(detail.id, { pinned: !detail.pinned })
            if (updated) setDetail(updated)
          }}
          onArchive={() => {
            service.archive(detail.id)
            setDetail(null)
          }}
          onUnarchive={() => {
            service.unarchive(detail.id)
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
            service.moveToCanvas(detail.id, {
              canvasId: targetCanvasId,
              x: 100 + (nextZ % 5) * 40,
              y: 100 + (nextZ % 5) * 40,
              w: 200,
              h: 80,
              z: nextZ,
            })
            const updated = service.get(detail.id)
            if (updated) setDetail(updated)
          }}
          onConfirmDelete={() => {
            service.softDelete(detail.id)
            setDetail(null)
          }}
          onAIAppendNew={(c) => {
            // M3 — AI "Append as new card". Goes through captureSinkRegistry
            // for consistency with the inbox CreateCardForm path. Toast
            // (success / fail) is surfaced by the consumer (we don't push
            // here — the popover already showed an optimistic toast).
            try {
              captureSinkRegistry.submit({
                source: { kind: 'manual', deviceId: DEVICE_ID },
                title: c.title,
                body: c.body,
              })
            } catch (e) {
              pushToast({
                kind: 'error',
                message: 'AI append failed: ' + (e as Error).message,
              })
            }
          }}
        />
      )}

      <style>{styles}</style>
    </main>
  )
}

const styles = `
.page { min-height: 100vh; background: var(--color-white); color: var(--color-black); }
.tab {
  height: 32px;
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
.tab--active { color: var(--color-black); border-bottom-color: var(--color-red); font-weight: 600; }

.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--space-3) var(--space-4);
}

.tile {
  position: relative;
  display: flex;
  text-align: left;
  background: var(--color-white);
  border: var(--border-hairline);
  border-radius: var(--radius-sm);
  overflow: hidden;
  min-height: 160px;
  transition: transform 80ms ease-out, box-shadow 80ms ease-out, border-color 80ms ease-out;
  box-shadow: var(--shadow-sm);
  font-family: var(--font-body);
  color: var(--color-black);
}
.tile:hover { box-shadow: var(--shadow-md); }
.tile--pinned { outline: 2px solid var(--color-yellow); outline-offset: -1px; }
.tile--pinned .tile__bar { background: var(--color-yellow); }
.tile--selected { outline: 2px solid var(--color-blue); outline-offset: -1px; }
.tile__pin {
  position: absolute; top: var(--space-1); right: var(--space-1); z-index: 2;
  width: 28px; height: 28px;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--color-white); border: var(--border-hairline); border-radius: var(--radius-sm);
  font-size: var(--font-size-base); line-height: 1; color: var(--color-gray);
  cursor: pointer; padding: 0;
}
.tile__pin:hover { color: var(--color-yellow); }
.tile__select {
  position: absolute; top: var(--space-1); left: var(--space-1); z-index: 2;
  width: 28px; height: 28px;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--color-white); border: var(--border-hairline); border-radius: var(--radius-sm);
  font-family: var(--font-mono); font-size: var(--font-size-base); line-height: 1;
  color: var(--color-white); cursor: pointer; padding: 0;
}
.tile__select[aria-pressed="true"] { background: var(--color-blue); border-color: var(--color-blue); color: var(--color-white); }
.tile__select:hover:not([aria-pressed="true"]) { border-color: var(--color-blue); color: var(--color-blue); }
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
  height: 30px; padding: 0 var(--space-2);
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
.tile__main {
  flex: 1; display: flex; width: 100%;
  background: transparent; border: 0; padding: 0; text-align: left;
  cursor: pointer; color: inherit; font: inherit;
}
.tile__main:active { transform: translate(2px, 2px); box-shadow: none; }
.tile__bar { width: 8px; flex-shrink: 0; background: var(--color-red); }
.tile__body { flex: 1; padding: var(--space-3); display: flex; flex-direction: column; gap: var(--space-2); }
.tile__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--font-size-lg);
  font-weight: 500;
  line-height: 1.25;
  letter-spacing: -0.01em;
}
.tile__preview { margin: 0; color: var(--color-black-soft); font-size: var(--font-size-sm); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.tile__meta { display: flex; gap: var(--space-1); align-items: center; margin-top: auto; flex-wrap: wrap; }
.tile__time { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-gray); margin-left: auto; }

.empty { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-2); padding: var(--space-3) 0; }
.empty__bar { width: 64px; height: 8px; background: var(--color-red); }
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
  const preview = card.body.slice(0, 120)
  const totalMedia =
    card.links.length + card.codeSnippets.length + card.quotes.length
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
              {card.capturedAt.toISOString().slice(0, 10)}
            </span>
          </div>
        </div>
      </button>
    </div>
  )
}

function EmptyState({ view }: { view: View }) {
  const { t } = useI18n()
  return (
    <UICard>
      <div className="empty">
        <div className="empty__bar" aria-hidden="true" />
        <p className="eyebrow">{t('inbox.crumb')}</p>
        <h2 className="display-title display-title--lg">
          {view === 'inbox' ? t('inbox.empty.title') : t('inbox.empty.titleArchived')}
        </h2>
        <p className="empty__lede">
          {view === 'inbox' ? t('inbox.empty.lede') : t('inbox.empty.ledeArchived')}
        </p>
      </div>
    </UICard>
  )
}

<style>{styles}</style>
