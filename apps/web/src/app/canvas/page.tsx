'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CanvasId, Card } from '@cys-stift/domain'
import { Button, Modal, Toolbar } from '@cys-stift/ui'
import { useDb } from '@/lib/db-client'
import { useI18n } from '@/lib/i18n'
import { SelfCanvas, type SelfCanvasHandle } from '@/features/canvas/self-canvas'
import { CardDetailModal } from '@/features/canvas/card-detail-modal'
import { ExportDialog } from '@/features/canvas/export-dialog'
import { applyLayout } from '@/features/canvas/apply-layout'
import { RelationPanel } from '@/features/canvas/relation-panel'
import { autoRelate } from '@/features/canvas/auto-relate'
import { snapshotCanvas, formatCanvasSnapshot } from '@/features/ai/canvas-snapshot'
import { parseDsl } from '@/features/ai/dsl-parser'
import { streamText } from '@/features/ai/stream-text'
import { useAIEnabled, getCurrentAI } from '@/features/ai/ai-settings-provider'
import { pushToast } from '@/lib/toast-store'
import { DEFAULT_CANVAS_ID } from '@/features/canvas/default-canvas'
import {
  addCardShape,
  removeCardShape,
  syncCardsToEditor,
  updateCardShape,
} from '@/features/canvas/canvas-binding'
import { canvasStore, useCanvases } from '@/lib/canvas-store'
import { canvasViewStore } from '@/lib/canvas-view-store'

/**
 * /canvas — Phase 2 子项目 1:切 SelfBuiltAdapter(自研 Canvas 2D),移除 tldraw。
 * tldraw 代码文件暂留(子项目 5 删)。canvas 管理 UI(switcher/rename/delete)+ CardDetailModal 保留。
 * 暂无 toolbar/导出/关系(子项目 2/3/4 接回)。卡片简化渲染(只 title)——完整渲染留子项目 2。
 */
export default function CanvasPage() {
  const { t } = useI18n()
  const { snap, service } = useDb()
  void snap
  const handle = useRef<SelfCanvasHandle>({ adapter: null })
  const canvasElRef = useRef<HTMLCanvasElement | null>(null)
  const [detail, setDetail] = useState<{ card: Card } | null>(null)
  const [snapMode, setSnapMode] = useState<'snap' | 'free'>('snap')
  const [tool, setTool] = useState<'select' | 'freedraw' | 'text' | 'connect'>('select')

  const { snapshot: canvasesSnap } = useCanvases()
  const activeCanvasId = canvasesSnap.activeCanvasId
  const canvases = canvasesSnap.canvases

  // Sync CardService → adapter on DB change(inbox→canvas / unarchive)。
  // handle.current.adapter 是 ref.current 读,不放 deps(否则 lint 报 ref identity 不稳定);
  // effect 在 snap/activeCanvasId/service 变时重跑,内里读 ref 当前值即可。
  useEffect(() => {
    const adapter = handle.current.adapter
    if (!adapter) return
    syncCardsToEditor(adapter, service, activeCanvasId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, activeCanvasId, service])

  const [creatingName, setCreatingName] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<CanvasId | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<CanvasId | null>(null)
  const [exportOpen, setExportOpen] = useState(false)

  const onCanvas = service
    .listOnCanvas(activeCanvasId)
    .filter((c) => !c.archived && !c.deletedAt).length

  const toggleSnap = useCallback(() => {
    const adapter = handle.current.adapter
    if (!adapter) return
    const next = snapMode === 'snap' ? 'free' : 'snap'
    const v = adapter.getView()
    adapter.setView({ ...v, gridMode: next })
    setSnapMode(next)
  }, [snapMode])

  const zoomBy = useCallback(
    (op: 'in' | 'out' | 'fit') => {
      const adapter = handle.current.adapter
      if (!adapter) return
      const v = adapter.getView()
      if (op === 'in') adapter.setView({ ...v, zoom: Math.min(8, v.zoom * 1.2) })
      else if (op === 'out') adapter.setView({ ...v, zoom: Math.max(0.1, v.zoom / 1.2) })
      else {
        // fit:重置 pan/zoom
        adapter.setView({ ...v, panX: 0, panY: 0, zoom: 1 })
      }
    },
    [],
  )

  const aiEnabled = useAIEnabled()

  const handleAutoRelate = useCallback(() => {
    const adapter = handle.current.adapter
    if (!adapter) return
    const ids = adapter
      .getSelectedIds()
      .map((id) => adapter.getElement(id))
      .filter((el) => !!el && el.kind === 'card')
      .map((el) => el!.id)
    if (ids.length < 2) return
    const { arrowsCreated } = autoRelate(adapter, ids, service)
    pushToast({
      kind: arrowsCreated > 0 ? 'success' : 'info',
      message:
        arrowsCreated > 0
          ? t('canvas.autoRelateDone', { n: String(arrowsCreated) })
          : t('canvas.autoRelateNone'),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, t])

  const handleAILayout = useCallback(async () => {
    const adapter = handle.current.adapter
    if (!adapter) return
    const cfg = getCurrentAI()
    if (!cfg) return

    const snap = snapshotCanvas(adapter, service, activeCanvasId)
    const formatted = formatCanvasSnapshot(snap)

    const systemPrompt =
      'You are a canvas layout assistant. Given a list of cards and shapes with positions, suggest new positions to organize them better. Group related items together. Output DSL directives only — no explanations.'

    const userPrompt = `Organize these items into a clean layout. Keep items within reasonable proximity. Do NOT move items that are already well-placed.

${formatted}

Output DSL like:
[card #id] @pos(x, y)
[rect #id] @pos(x, y) @size(w, h)`

    try {
      const result = await streamText(cfg, { system: systemPrompt, user: userPrompt }, () => {})
      if (!result?.content) {
        pushToast({ kind: 'info', message: t('canvas.aiLayoutEmpty') })
        return
      }
      const ops = parseDsl(result.content)
      if (ops.length === 0) {
        pushToast({ kind: 'info', message: t('canvas.aiLayoutEmpty') })
        return
      }
      applyLayout(adapter, ops)
      pushToast({ kind: 'success', message: t('canvas.aiLayoutDone') })
    } catch (e) {
      pushToast({ kind: 'error', message: t('ai.error', { error: (e as Error).message }) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCanvasId, service, t])

  // 键盘:+ - 0 1 g(同 tldraw 版,改用 adapter)。input/textarea 时跳过。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null
      if (tgt) {
        const tag = tgt.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tgt.isContentEditable) return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const key = e.key
      if (key === '+' || key === '=') { e.preventDefault(); zoomBy('in') }
      else if (key === '-' || key === '_') { e.preventDefault(); zoomBy('out') }
      else if (key === '0' || key === '1') { e.preventDefault(); zoomBy('fit') }
      else if (key === 'g' || key === 'G') { e.preventDefault(); toggleSnap() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoomBy, toggleSnap])

  const switchCanvas = (id: CanvasId) => {
    if (id === activeCanvasId) return
    setDetail(null)
    canvasStore.setActive(id)
  }

  const handleCreateCanvas = (raw: string) => {
    const name = raw.trim()
    setCreatingName(null)
    if (!name) return
    canvasStore.create(name)
  }

  const startRename = () => setRenamingId(activeCanvasId)
  const handleRename = (raw: string) => {
    const name = raw.trim()
    setRenamingId(null)
    if (!name) return
    canvasStore.rename(activeCanvasId, name)
  }

  const requestDelete = () => {
    if (activeCanvasId === DEFAULT_CANVAS_ID) return
    setConfirmDeleteId(activeCanvasId)
  }

  const confirmDelete = () => {
    if (!confirmDeleteId) return
    for (const c of service.listOnCanvas(confirmDeleteId)) service.removeFromCanvas(c.id)
    canvasStore.delete(confirmDeleteId)
    setConfirmDeleteId(null)
  }

  const activeCanvas = canvases.find((c) => c.id === activeCanvasId)
  const cardCountOnTarget = confirmDeleteId
    ? service.listOnCanvas(confirmDeleteId).filter((c) => !c.deletedAt).length
    : 0
  const adapterReady = !!handle.current.adapter
  // Reflect the current card selection on the auto-relate button via the
  // host's onSelectionChange event (debt 收口 2026-06-23, 替原 300ms 轮询)。
  const [selectedCardCount, setSelectedCardCount] = useState(0)
  useEffect(() => {
    const adapter = handle.current.adapter
    if (!adapter) {
      setSelectedCardCount(0)
      return
    }
    const recount = (ids: string[]) => {
      const n = ids
        .map((sid) => adapter.getElement(sid))
        .filter((el) => !!el && el.kind === 'card').length
      setSelectedCardCount((prev) => (prev !== n ? n : prev))
    }
    recount(adapter.getSelectedIds()) // 初始同步(adapter 刚就绪/切画布重建)
    const unsub = adapter.onSelectionChange(recount)
    return () => unsub()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapterReady, activeCanvasId])
  const showAutoRelate = aiEnabled && selectedCardCount >= 2

  // adapter ready 时同步工具(切 canvas 重建 adapter 后恢复当前 tool)。
  useEffect(() => {
    handle.current.adapter?.setTool(tool)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, adapterReady])

  return (
    <main className="page">
      <Toolbar region="canvas">
        <span className="crumb">cy&rsquo;s stift</span>
        <span className="crumb-sep">/</span>
        <span className="crumb crumb--here">{t('canvas.crumb')}</span>
        <span className="crumb-sep">/</span>
        <CanvasSwitcher
          canvases={canvases}
          activeId={activeCanvasId}
          renamingId={renamingId}
          onStartRename={startRename}
          onCommitRename={handleRename}
          onCancelRename={() => setRenamingId(null)}
          onSwitch={switchCanvas}
        />
        <Button variant="ghost" onClick={() => setCreatingName('')} title={t('canvas.newTitle')}>{t('canvas.new')}</Button>
        <Button variant="ghost" onClick={startRename} title={t('canvas.renameTitle')} disabled={!activeCanvas}>{t('canvas.rename')}</Button>
        <Button variant="ghost" onClick={requestDelete} title={t('canvas.deleteTitle')} disabled={activeCanvasId === DEFAULT_CANVAS_ID}>{t('canvas.delete')}</Button>
        <span className="crumb-spacer" />
        <span className="tb-divider" aria-hidden="true" />
        {aiEnabled && (
          <Button variant="ghost" onClick={handleAILayout} disabled={!adapterReady} title="AI layout">AI</Button>
        )}
        {showAutoRelate && (
          <Button variant="ghost" onClick={handleAutoRelate} title={t('canvas.autoRelate')}>{t('canvas.autoRelate')}</Button>
        )}
        <span className="tb-divider" aria-hidden="true" />
        {(['select', 'freedraw', 'text', 'connect'] as const).map((tk) => (
          <button
            key={tk}
            type="button"
            className={`tb-snap${tool === tk ? ' tb-snap--snap' : ''}`}
            onClick={() => setTool(tk)}
            disabled={!adapterReady}
            aria-pressed={tool === tk}
            style={{ textTransform: 'none', letterSpacing: 0 }}
          >
            {tk === 'select' ? 'Select' : tk === 'freedraw' ? 'Draw' : tk === 'text' ? 'Text' : 'Connect'}
          </button>
        ))}
        <span className="tb-divider" aria-hidden="true" />
        <SnapToggle mode={snapMode} onToggle={toggleSnap} disabled={!adapterReady} />
        <span className="tb-divider" aria-hidden="true" />
        <ZoomGroup adapterReady={adapterReady} onZoom={zoomBy} />
        <span className="tb-divider" aria-hidden="true" />
        <Button variant="ghost" onClick={() => setExportOpen(true)} disabled={!adapterReady} title={t('canvas.export')}>{t('canvas.export')}</Button>
      </Toolbar>

      <div className="cv-host">
        <SelfCanvas
          key={activeCanvasId}
          canvasId={activeCanvasId}
          service={service}
          tool={tool}
          onOpenCard={(card) => setDetail({ card })}
          adapterRef={handle}
          canvasElRef={canvasElRef}
        />
        {onCanvas === 0 && (
          <div className="cv-empty" aria-hidden="true">
            <span className="cv-empty__eyebrow">{t('canvas.emptyTitle')}</span>
            <span className="cv-empty__hint">{t('canvas.emptyHint')}</span>
          </div>
        )}
        <RelationPanel host={handle.current.adapter} canvasEl={canvasElRef.current} />
      </div>

      <Modal open={creatingName !== null} onClose={() => setCreatingName(null)} title={t('canvas.newModalTitle')}>
        <p className="confirm__body">{t('canvas.newModalBody')}</p>
        <input
          autoFocus className="cinput" value={creatingName ?? ''}
          onChange={(e) => setCreatingName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreateCanvas((e.target as HTMLInputElement).value)
            else if (e.key === 'Escape') setCreatingName(null)
          }}
          placeholder={t('canvas.namePlaceholder')} maxLength={60}
        />
        <div className="confirm__actions">
          <Button variant="ghost" onClick={() => setCreatingName(null)}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => handleCreateCanvas(creatingName ?? '')} disabled={!creatingName?.trim()}>{t('canvas.new')}</Button>
        </div>
      </Modal>

      <Modal open={confirmDeleteId !== null} onClose={() => setConfirmDeleteId(null)} title={t('canvas.deleteModalTitle')}>
        <p className="confirm__body">
          {cardCountOnTarget > 0
            ? t('canvas.deleteModalBodyCards', { name: canvases.find((c) => c.id === confirmDeleteId)?.name ?? '', n: cardCountOnTarget })
            : t('canvas.deleteModalBodyNoCards', { name: canvases.find((c) => c.id === confirmDeleteId)?.name ?? '' })}
        </p>
        <div className="confirm__actions">
          <Button variant="ghost" onClick={() => setConfirmDeleteId(null)}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={confirmDelete}>{t('canvas.deleteCanvas')}</Button>
        </div>
      </Modal>

      {detail && (
        <CardDetailModal
          card={detail.card}
          onClose={() => setDetail(null)}
          onSave={(patch) => {
            const updated = service.update(detail.card.id, { title: patch.title, body: patch.body })
            if (updated && handle.current.adapter) updateCardShape(handle.current.adapter, updated)
            if (updated) setDetail({ card: updated })
          }}
          onArchive={() => {
            service.archive(detail.card.id)
            if (handle.current.adapter) removeCardShape(handle.current.adapter, detail.card.id)
            setDetail(null)
          }}
          onUnarchive={() => {
            service.unarchive(detail.card.id)
            const c = service.get(detail.card.id)
            if (c && handle.current.adapter) addCardShape(handle.current.adapter, c)
            setDetail(c ? { card: c } : null)
          }}
          onDelete={() => {
            service.softDelete(detail.card.id)
            if (handle.current.adapter) removeCardShape(handle.current.adapter, detail.card.id)
            setDetail(null)
          }}
          onSendToInbox={() => {
            service.removeFromCanvas(detail.card.id)
            if (handle.current.adapter) removeCardShape(handle.current.adapter, detail.card.id)
            setDetail(null)
          }}
        />
      )}

      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        host={handle.current.adapter}
        service={service}
        canvasId={activeCanvasId}
        canvasName={activeCanvas?.name ?? ''}
      />

      <style>{styles}</style>
    </main>
  )
}

function CanvasSwitcher({
  canvases, activeId, renamingId, onStartRename, onCommitRename, onCancelRename, onSwitch,
}: {
  canvases: { id: CanvasId; name: string }[]
  activeId: CanvasId
  renamingId: CanvasId | null
  onStartRename: () => void
  onCommitRename: (name: string) => void
  onCancelRename: () => void
  onSwitch: (id: CanvasId) => void
}) {
  const { t } = useI18n()
  if (renamingId !== null) {
    return (
      <input
        autoFocus className="crename"
        defaultValue={canvases.find((c) => c.id === renamingId)?.name ?? ''}
        onBlur={(e) => onCommitRename(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCommitRename((e.target as HTMLInputElement).value)
          else if (e.key === 'Escape') onCancelRename()
        }}
        maxLength={60} onClick={(e) => e.stopPropagation()}
      />
    )
  }
  return (
    <>
      <select className="cselect" value={activeId} onChange={(e) => onSwitch(e.target.value as CanvasId)} title={t('canvas.switchTitle')}>
        {canvases.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
      </select>
      <button type="button" className="cselect-edit" onClick={onStartRename} title={t('canvas.renameTitle')} aria-label={t('canvas.renameTitle')}>✎</button>
    </>
  )
}

function SnapToggle({ mode, onToggle, disabled }: { mode: 'snap' | 'free'; onToggle: () => void; disabled: boolean }) {
  const { t } = useI18n()
  return (
    <button type="button" className={`tb-snap tb-snap--${mode}`} onClick={onToggle} disabled={disabled} aria-pressed={mode === 'snap'} title={t('canvas.toggleSnap')}>
      {mode === 'snap' ? t('canvas.snap') : t('canvas.free')}
    </button>
  )
}

function ZoomGroup({ adapterReady, onZoom }: { adapterReady: boolean; onZoom: (op: 'in' | 'out' | 'fit') => void }) {
  const { t } = useI18n()
  return (
    <span className="tb-zoom">
      <button type="button" className="tb-icon-btn" onClick={() => onZoom('out')} disabled={!adapterReady} aria-label={t('canvas.zoomOut')} title={`${t('canvas.zoomOut')} (-)`}>−</button>
      <button type="button" className="tb-icon-btn" onClick={() => onZoom('in')} disabled={!adapterReady} aria-label={t('canvas.zoomIn')} title={`${t('canvas.zoomIn')} (+)`}>+</button>
      <button type="button" className="tb-icon-btn tb-icon-btn--fit" onClick={() => onZoom('fit')} disabled={!adapterReady} aria-label={t('canvas.zoomFit')} title={`${t('canvas.zoomFit')} (0)`}>{t('canvas.zoomFit')}</button>
    </span>
  )
}

const styles = `
.page { height: calc(100vh - var(--app-menu-height)); display: flex; flex-direction: column; background: var(--color-white); color: var(--color-black); }
.crumb { font-family: var(--font-mono); font-size: var(--font-size-sm); text-transform: uppercase; letter-spacing: 0.12em; color: var(--color-gray); }
.crumb--here { color: var(--color-black); }
.crumb-sep { color: var(--color-gray); }
.crumb-spacer { flex: 1; }
.cv-host { position: relative; flex: 1; min-height: 0; }
.cv-empty { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: var(--space-2); pointer-events: none; user-select: none; padding-bottom: 80px; }
.cv-empty__eyebrow { font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.16em; color: var(--color-gray); }
.cv-empty__hint { font-family: var(--font-mono); font-size: var(--font-size-sm); color: var(--color-black-soft); }
.tb-divider { width: 1px; height: 24px; background: var(--color-gray); margin: 0 var(--space-2); flex: 0 0 auto; }
.tb-snap { display: inline-flex; align-items: center; justify-content: center; height: 32px; padding: 0 var(--space-3); font-family: var(--font-mono); font-size: var(--font-size-xs); letter-spacing: 0.16em; text-transform: uppercase; background: var(--color-white); color: var(--color-black); border: var(--border-hairline); border-radius: var(--radius-sm); cursor: pointer; }
.tb-snap--snap { background: var(--color-black); color: var(--color-white); }
.tb-snap--free { background: var(--color-white); color: var(--color-black); }
.tb-snap:disabled { opacity: 0.4; cursor: not-allowed; }
.tb-zoom { display: inline-flex; align-items: center; gap: 0; }
.tb-icon-btn { display: inline-flex; align-items: center; justify-content: center; height: 32px; min-width: 32px; padding: 0 var(--space-2); font-family: var(--font-mono); font-size: var(--font-size-xs); letter-spacing: 0.12em; text-transform: uppercase; background: transparent; color: var(--color-black); border: var(--border-hairline); border-radius: var(--radius-sm); cursor: pointer; }
.tb-icon-btn--fit { padding: 0 var(--space-3); }
.tb-icon-btn:hover { background: var(--color-black); color: var(--color-white); }
.tb-icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.cselect { height: 32px; padding: 0 var(--space-2); background: var(--color-white); color: var(--color-black); font-family: var(--font-mono); font-size: var(--font-size-sm); border: var(--border-hairline); border-radius: var(--radius-sm); cursor: pointer; }
.cselect-edit { height: 32px; width: 32px; background: transparent; color: var(--color-gray); border: 0; cursor: pointer; font-size: var(--font-size-base); }
.crename { height: 32px; padding: 0 var(--space-2); background: var(--color-white); color: var(--color-black); font-family: var(--font-mono); font-size: var(--font-size-sm); border: var(--border-hairline); border-radius: var(--radius-sm); outline: none; min-width: 200px; }
.cinput { display: block; width: 100%; height: 32px; margin-top: var(--space-2); padding: 0 var(--space-2); background: var(--color-white); color: var(--color-black); font-family: var(--font-mono); font-size: var(--font-size-base); border: var(--border-hairline); border-radius: var(--radius-sm); outline: none; }
.confirm__body { margin: 0; color: var(--color-black-soft); line-height: 1.5; }
.confirm__actions { display: flex; gap: var(--space-2); justify-content: flex-end; margin-top: var(--space-2); }
`
