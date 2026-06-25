'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CanvasId, Card } from '@cys-stift/domain'
import { Button, Modal, Toolbar } from '@cys-stift/ui'
import { useDb } from '@/lib/db-client'
import { useI18n } from '@/lib/i18n'
import { SelfCanvas, type SelfCanvasHandle } from '@/features/canvas/self-canvas'
import { CardDetailModal } from '@/features/canvas/card-detail-modal'
import { ExportDialog } from '@/features/canvas/export-dialog'
import { DslDialog } from '@/features/canvas/dsl-dialog'
import { ShortcutHelpDialog } from '@/features/canvas/shortcut-help-dialog'
import { DiffDialog } from '@/features/canvas/diff-dialog'
import { applyLayout } from '@/features/canvas/apply-layout'
import { RelationPanel } from '@/features/canvas/relation-panel'
import { FreedrawPanel } from '@/features/canvas/freedraw-panel'
import { Minimap } from '@/features/canvas/minimap-component'
import { autoRelate } from '@/features/canvas/auto-relate'
import { snapshotCanvas, formatCanvasSnapshot } from '@/features/ai/canvas-snapshot'
import { parseDsl, parseDslWithDiagnostics } from '@/features/ai/dsl-parser'
import { streamText } from '@/features/ai/stream-text'
import {
  buildClusterUserPrompt,
  parseClusters,
  applyClusters,
  CLUSTER_SYSTEM_PROMPT,
} from '@/features/ai/cluster'
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
  const { snap, service, ready } = useDb()
  void snap
  const handle = useRef<SelfCanvasHandle>({ adapter: null })
  const adapterReady = !!handle.current.adapter
  const canvasElRef = useRef<HTMLCanvasElement | null>(null)
  const [detail, setDetail] = useState<{ card: Card } | null>(null)
  const [snapMode, setSnapMode] = useState<'snap' | 'free'>('snap')
  const [tool, setTool] = useState<'select' | 'freedraw' | 'text' | 'connect'>('select')
  // AI loading + abort(审计 M5+M9):async 调用期间禁用按钮防重复点击,
  // AbortController 在卸载/取消时 abort,省 API 费 + 防 unmounted setState。
  const [aiBusy, setAiBusy] = useState<null | 'layout' | 'cluster'>(null)
  const aiAbortRef = useRef<AbortController | null>(null)

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
  const [dslOpen, setDslOpen] = useState(false)
  const [shortcutOpen, setShortcutOpen] = useState(false)
  const [diffOpen, setDiffOpen] = useState(false)

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

  // undo/redo 按钮 disabled 态:onHistoryChange(upsert/undo/redo)刷新。
  // 依赖 activeCanvasId:切画布时 SelfCanvas 重建新 adapter,需重订阅。
  const [, histTick] = useState(0)
  useEffect(() => {
    const adapter = handle.current.adapter
    if (!adapter) return
    return adapter.onHistoryChange(() => histTick((n) => n + 1))
  }, [activeCanvasId])
  const canUndo = !!handle.current.adapter?.canUndo()
  const canRedo = !!handle.current.adapter?.canRedo()
  const handleUndo = useCallback(() => {
    handle.current.adapter?.undo()
  }, [])
  const handleRedo = useCallback(() => {
    handle.current.adapter?.redo()
  }, [])

  const handleAILayout = useCallback(async () => {
    // 防重复点击:已在跑则忽略(审计 M5)。
    if (aiBusy) return
    setAiBusy('layout')
    const ac = new AbortController()
    aiAbortRef.current = ac
    try {
      const adapter = handle.current.adapter
      if (!adapter) return
      const cfg = getCurrentAI()
      if (!cfg) return

      const snap = snapshotCanvas(adapter, service, activeCanvasId)
      const formatted = formatCanvasSnapshot(snap)

      const systemPrompt =
        'You are a canvas editing assistant. Given the current canvas (cards, shapes, arrows with their relation signatures), output DSL directives to improve it. You may reposition/resize cards, change colors, create/update rect and text shapes, and rewrite arrow relation signatures (dash line style + arrowhead shape). Reuse an existing element #id to UPDATE it (relation arrow endpoints are kept; free arrow bbox is kept); omit the id to CREATE new. Cards can only be UPDATEd — never created (card content comes from the inbox, not the canvas). Free arrows (arrows with no from/to) encode their line as @pos + @size (w/h may be negative for direction). Output DSL directives only — no explanations.'

      const userPrompt = `Improve this canvas. Reorganize positions, adjust sizes/colors, and refine arrow relation signatures where appropriate. Do NOT change items that are already well-placed.

${formatted}

Output DSL (one directive per line):
[card #id] @pos(x, y) @size(w, h) @color(blue|red|black|grey|yellow)
[rect #id] @pos(x, y) @size(w, h) @color(c)
[text #id] @pos(x, y) @text("...") @color(c)
[arrow #id] from #a to #b @label("...") @color(c) @dash(solid|dashed|dotted) @arrowhead(arrow|triangle|none)
[arrow #id] @pos(x, y) @size(w, h) @color(c) @dash(...) @arrowhead(...)   (free arrow: no from/to; w/h may be negative for direction)
Rules: reuse an existing #id to UPDATE it (from/to kept for relation arrows, bbox kept for free arrows); omit #id to CREATE new — except cards, which are update-only; colors limited to blue/red/black/grey/yellow.`

      const result = await streamText(cfg, { system: systemPrompt, user: userPrompt }, () => {}, ac.signal)
      if (!result?.content) {
        pushToast({ kind: 'info', message: t('canvas.aiLayoutEmpty') })
        return
      }
      const ops = parseDsl(result.content)
      if (ops.length === 0) {
        pushToast({ kind: 'info', message: t('canvas.aiLayoutEmpty') })
        return
      }
      const { applied, skipped } = applyLayout(adapter, ops)
      // 诚实 toast(保留此前修复):applied=0 / skipped>0 / 全成功三分支。
      if (applied === 0) {
        pushToast({ kind: 'info', message: t('canvas.aiLayoutNoneApplied') })
      } else if (skipped > 0) {
        pushToast({ kind: 'info', message: t('canvas.aiLayoutAppliedSkipped', { applied: String(applied), skipped: String(skipped) }) })
      } else {
        pushToast({ kind: 'success', message: t('canvas.aiLayoutDone') })
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        pushToast({ kind: 'info', message: t('canvas.aiCancelled') })
      } else {
        pushToast({ kind: 'error', message: t('ai.error', { error: (e as Error).message }) })
      }
    } finally {
      setAiBusy(null)
      aiAbortRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCanvasId, service, t, aiBusy])

  // AI cluster(找重复 / 找相似):读画布上的卡 → AI 分组 → 落 related-to 关系箭头
  // 连组内成员(非破坏性:只加关系,不合并不删卡)。走 serializeCardsForAI(allowlist
  // + 软删除过滤,无 deviceId / 无 media.dataUrl),遵守 AI 隐私铁律(无 vision)。
  const handleAICluster = useCallback(async () => {
    // 防重复点击:已在跑则忽略(审计 M5)。
    if (aiBusy) return
    setAiBusy('cluster')
    const ac = new AbortController()
    aiAbortRef.current = ac
    try {
      const adapter = handle.current.adapter
      if (!adapter) return
      const cfg = getCurrentAI()
      if (!cfg) return

      const cards = service
        .listOnCanvas(activeCanvasId)
        .filter((c) => !c.archived && !c.deletedAt)
      if (cards.length < 2) {
        pushToast({ kind: 'info', message: t('canvas.aiClusterTooFew') })
        return
      }
      const knownIds = new Set(cards.map((c) => String(c.id)))
      // A 方向闭环:把画布快照(含 freedraw shape 行)喂给 cluster,让 AI 看到手绘
      // 形状作为空间分组提示。snapshotCanvas 守 R2(freedraw 只发 shape 标签不发点坐标)。
      const canvasSnapshot = formatCanvasSnapshot(snapshotCanvas(adapter, service, activeCanvasId))
      const userPrompt = buildClusterUserPrompt(cards, canvasSnapshot)
      if (!userPrompt) {
        pushToast({ kind: 'info', message: t('canvas.aiClusterTooFew') })
        return
      }

      const result = await streamText(
        cfg,
        { system: CLUSTER_SYSTEM_PROMPT, user: userPrompt, maxTokens: 1024, temperature: 0.2 },
        () => {},
        ac.signal,
      )
      if (!result?.content) {
        pushToast({ kind: 'info', message: t('canvas.aiClusterEmpty') })
        return
      }
      const clusters = parseClusters(result.content, knownIds)
      if (clusters.length === 0) {
        pushToast({ kind: 'info', message: t('canvas.aiClusterNone') })
        return
      }
      const res = applyClusters(adapter, clusters, service, activeCanvasId)
      pushToast({
        kind: res.arrowsCreated > 0 ? 'success' : 'info',
        message:
          res.arrowsCreated > 0
            ? t('canvas.aiClusterDone', { n: String(res.arrowsCreated) })
            : t('canvas.aiClusterNone'),
      })
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        pushToast({ kind: 'info', message: t('canvas.aiCancelled') })
      } else {
        pushToast({ kind: 'error', message: t('ai.error', { error: (e as Error).message }) })
      }
    } finally {
      setAiBusy(null)
      aiAbortRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCanvasId, service, t, aiBusy])

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

  // 转义双向桥入口:画布页粘贴纯文本 DSL → 直接应用(不必打开 DSL 模态)。
  // 与全局 FileDropHandler 并存:它只处理文件项,纯文本 early-return;本监听
  // 只对 DSL 文本 preventDefault。input/textarea/contentEditable 时跳过。
  useEffect(() => {
    if (!adapterReady) return
    const isEditable = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false
      if (el.isContentEditable) return true
      const tag = el.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
    }
    const onPaste = (e: ClipboardEvent) => {
      if (isEditable(e.target)) return
      const items = e.clipboardData?.items
      if (!items) return
      let textItem: DataTransferItem | null = null
      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        if (it && it.kind === 'string' && (it.type === 'text/plain' || it.type === 'text')) {
          textItem = it
          break
        }
      }
      if (!textItem) return
      // 同步 preventDefault(避免浏览器把文本塞进聚焦元素),再异步判断+应用。
      e.preventDefault()
      textItem.getAsString((raw) => {
        const text = raw ?? ''
        const looksLikeDsl = text.split('\n').some((ln) =>
          /^\s*\[(card|arrow|rect|text|freedraw)\b/i.test(ln),
        )
        if (!looksLikeDsl) return
        const { ops, errors } = parseDslWithDiagnostics(text)
        if (ops.length === 0) {
          pushToast({ kind: 'info', message: t('canvas.pasteDslNone') })
          return
        }
        const adapter = handle.current.adapter
        if (!adapter) return
        const { applied, skipped } = applyLayout(adapter, ops)
        if (applied === 0) {
          pushToast({ kind: 'info', message: t('canvas.pasteDslNone') })
        } else if (skipped > 0 || errors.length > 0) {
          pushToast({ kind: 'info', message: t('canvas.pasteDslPartial', { applied: String(applied), skipped: String(skipped + errors.length) }) })
        } else {
          pushToast({ kind: 'success', message: t('canvas.pasteDslApplied', { n: String(applied) }) })
        }
      })
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapterReady, t])

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

  // 卸载时 abort 进行中的 AI 请求(审计 M9:防切走后请求继续跑浪费
  // API 费 + 可能 unmounted setState)。
  useEffect(() => {
    return () => {
      aiAbortRef.current?.abort()
    }
  }, [])

  return (
    <main className="page">
      <Toolbar region="canvas">
        <CanvasSwitcher
          canvases={canvases}
          activeId={activeCanvasId}
          renamingId={renamingId}
          onStartRename={startRename}
          onCommitRename={handleRename}
          onCancelRename={() => setRenamingId(null)}
          onSwitch={switchCanvas}
        />
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
            {tk === 'select' ? t('canvas.tool.select') : tk === 'freedraw' ? t('canvas.tool.draw') : tk === 'text' ? t('canvas.tool.text') : t('canvas.tool.connect')}
          </button>
        ))}
        <span className="tb-divider" aria-hidden="true" />
        <SnapToggle mode={snapMode} onToggle={toggleSnap} disabled={!adapterReady} />
        <span className="tb-divider" aria-hidden="true" />
        <ZoomGroup adapterReady={adapterReady} onZoom={zoomBy} />
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
        {!ready ? null : onCanvas === 0 && (
          <div className="cv-empty" aria-hidden="true">
            <span className="eyebrow">{t('canvas.emptyTitle')}</span>
            <span className="mono">{t('canvas.emptyHint')}</span>
          </div>
        )}
        <RelationPanel host={handle.current.adapter} canvasEl={canvasElRef.current} />
        <FreedrawPanel host={handle.current.adapter} canvasEl={canvasElRef.current} />
        <CanvasSideRail
          aiEnabled={aiEnabled}
          aiBusy={aiBusy}
          showAutoRelate={showAutoRelate}
          adapterReady={adapterReady}
          canUndo={canUndo}
          canRedo={canRedo}
          canRename={!!activeCanvas}
          canDelete={activeCanvasId !== DEFAULT_CANVAS_ID}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onNewCanvas={() => setCreatingName('')}
          onRename={startRename}
          onDelete={requestDelete}
          onAILayout={handleAILayout}
          onAICluster={handleAICluster}
          onAutoRelate={handleAutoRelate}
          onDsl={() => setDslOpen(true)}
          onExport={() => setExportOpen(true)}
          onDiff={() => setDiffOpen(true)}
          onShortcuts={() => setShortcutOpen(true)}
        />
        <Minimap host={handle.current.adapter} canvasEl={canvasElRef.current} />
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

      <DslDialog
        open={dslOpen}
        onClose={() => setDslOpen(false)}
        host={handle.current.adapter}
        service={service}
        canvasName={activeCanvas?.name ?? ''}
      />

      <ShortcutHelpDialog open={shortcutOpen} onClose={() => setShortcutOpen(false)} />

      <DiffDialog open={diffOpen} onClose={() => setDiffOpen(false)} host={handle.current.adapter} />

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

/** 画布右侧浮动工具条 — 低频操作(AI/导出/DSL/版本对比/快捷键)收纳于此,
 *  顶栏只留高频(导航/画布管理/工具/吸附/缩放)。Figma/Excalidraw 风格,
 *  避免顶栏 18 元素平铺溢出。 */
function CanvasSideRail({
  aiEnabled,
  aiBusy,
  showAutoRelate,
  adapterReady,
  canUndo,
  canRedo,
  canRename,
  canDelete,
  onUndo,
  onRedo,
  onNewCanvas,
  onRename,
  onDelete,
  onAILayout,
  onAICluster,
  onAutoRelate,
  onDsl,
  onExport,
  onDiff,
  onShortcuts,
}: {
  aiEnabled: boolean
  aiBusy: null | 'layout' | 'cluster'
  showAutoRelate: boolean
  adapterReady: boolean
  canUndo: boolean
  canRedo: boolean
  canRename: boolean
  canDelete: boolean
  onUndo: () => void
  onRedo: () => void
  onNewCanvas: () => void
  onRename: () => void
  onDelete: () => void
  onAILayout: () => void
  onAICluster: () => void
  onAutoRelate: () => void
  onDsl: () => void
  onExport: () => void
  onDiff: () => void
  onShortcuts: () => void
}) {
  const { t } = useI18n()
  return (
    <nav className="cv-rail" aria-label={t('canvas.sideRail')}>
      <RailButton label={t('canvas.undo')} onClick={onUndo} disabled={!adapterReady || !canUndo} icon="↶" />
      <RailButton label={t('canvas.redo')} onClick={onRedo} disabled={!adapterReady || !canRedo} icon="↷" />
      <span className="cv-rail__sep" aria-hidden="true" />
      <RailButton label={t('canvas.newTitle')} onClick={onNewCanvas} icon="+" />
      <RailButton label={t('canvas.renameTitle')} onClick={onRename} disabled={!canRename} icon="✎" />
      <RailButton label={t('canvas.deleteTitle')} onClick={onDelete} disabled={!canDelete} icon="🗑" />
      <span className="cv-rail__sep" aria-hidden="true" />
      {aiEnabled && (
        <>
          <RailButton label={t('canvas.aiLayout')} disabled={!adapterReady || aiBusy !== null} busy={aiBusy === 'layout'} ariaBusy={aiBusy === 'layout'} busyTitle={t('canvas.aiRunning')} onClick={onAILayout} icon="AI" />
          <RailButton label={t('canvas.aiCluster')} disabled={!adapterReady || aiBusy !== null} busy={aiBusy === 'cluster'} onClick={onAICluster} icon="AC" />
        </>
      )}
      {showAutoRelate && (
        <RailButton label={t('canvas.autoRelate')} onClick={onAutoRelate} icon="→" />
      )}
      {aiEnabled && <span className="cv-rail__sep" aria-hidden="true" />}
      <RailButton label={t('canvas.dslTitle')} disabled={!adapterReady} onClick={onDsl} icon="DSL" />
      <RailButton label={t('canvas.export')} disabled={!adapterReady} onClick={onExport} icon="⤓" />
      <RailButton label={t('canvas.diffTitle')} disabled={!adapterReady} onClick={onDiff} icon="±" />
      <span className="cv-rail__sep" aria-hidden="true" />
      <RailButton label={t('canvas.shortcuts')} onClick={onShortcuts} icon="?" />
    </nav>
  )
}

function RailButton({ label, icon, onClick, disabled, busy, busyTitle, ariaBusy }: { label: string; icon: string; onClick: () => void; disabled?: boolean; busy?: boolean; busyTitle?: string; ariaBusy?: boolean }) {
  return (
    <button type="button" className="cv-rail__btn" onClick={onClick} disabled={disabled} title={busy && busyTitle ? busyTitle : label} aria-label={label} aria-busy={ariaBusy ? true : undefined}>
      {busy ? '…' : icon}
    </button>
  )
}

const styles = `
.page { height: calc(100vh - var(--app-menu-height)); display: flex; flex-direction: column; background: var(--color-white); color: var(--color-black); }
.cv-host { position: relative; flex: 1; min-height: 0; }
.cv-empty { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: var(--space-2); pointer-events: none; user-select: none; padding-bottom: 80px; }
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
.cv-rail {
  position: absolute; top: 72px; right: var(--space-1); z-index: 5;
  display: flex; flex-direction: column; align-items: center; gap: var(--space-1);
  padding: var(--space-1);
  background: var(--color-white);
  border: var(--border-hairline);
  border-radius: var(--radius-sm);
  box-shadow: 2px 2px 0 0 var(--color-black);
}
.cv-rail__btn {
  width: 36px; height: 36px;
  display: flex; align-items: center; justify-content: center;
  background: var(--color-white); color: var(--color-black);
  font-family: var(--font-mono); font-size: var(--font-size-xs);
  letter-spacing: 0.04em;
  border: 0; border-radius: var(--radius-sm); cursor: pointer;
  transition: background 80ms ease-out, color 80ms ease-out;
}
.cv-rail__btn:hover:not(:disabled) { background: var(--color-black); color: var(--color-white); }
.cv-rail__btn:disabled { opacity: 0.35; cursor: not-allowed; }
.cv-rail__btn:focus-visible { outline: 2px solid var(--color-red); outline-offset: -2px; }
.cv-rail__sep { width: 24px; height: 1px; background: var(--color-gray-soft); margin: var(--space-1) 0; }
`
