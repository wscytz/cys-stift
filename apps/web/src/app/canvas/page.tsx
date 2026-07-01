'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { CanvasId, Card, CardId } from '@cys-stift/domain'
import { SelfBuiltAdapter, applyAlign, elementCenter, unionBounds, normalizeBox, screenToPage } from '@cys-stift/canvas-engine'
import type { AlignOp, CanvasElement } from '@cys-stift/canvas-engine'
import { Button, Modal, Toolbar } from '@cys-stift/ui'
import { useDb } from '@/lib/db-client'
import { useI18n } from '@/lib/i18n'
import { SelfCanvas, type SelfCanvasHandle } from '@/features/canvas/self-canvas'
import { CanvasIcon, CanvasBusyIcon, type CanvasIconName } from '@/features/canvas/canvas-icons'
import { CardDetailModal } from '@/features/canvas/card-detail-modal'
import { ExportDialog } from '@/features/canvas/export-dialog'
import { DslDialog } from '@/features/canvas/dsl-dialog'
import { CanvasOverviewModal } from '@/features/canvas/canvas-overview-modal'
import { ShortcutHelpDialog } from '@/features/canvas/shortcut-help-dialog'
import { DiffDialog } from '@/features/canvas/diff-dialog'
import { applyLayout } from '@/features/canvas/apply-layout'
import { summarizeMovement } from '@/features/canvas/layout-movement'
import { OrganizePopover } from '@/features/canvas/organize-popover'
import { canvasToMarkdown, markdownFileName } from '@/features/canvas/canvas-to-markdown'
import { RelationPanel } from '@/features/canvas/relation-panel'
import { FreedrawPanel } from '@/features/canvas/freedraw-panel'
import { Minimap } from '@/features/canvas/minimap-component'
import { OutlinePanel } from '@/features/canvas/outline-panel'
import { CanvasCompanionPanel } from '@/features/canvas/companion-panel'
import { autoRelate } from '@/features/canvas/auto-relate'
import { CanvasContextMenu } from '@/features/canvas/canvas-context-menu'
import { CanvasEmptyMotif } from '@/features/canvas/canvas-empty-motif'
import { syncWikiLinkArrows } from '@/features/canvas/wiki-links'
import { syncEmbedArrows, resolveCardByTitle } from '@/features/canvas/embed-links'
import { snapshotCanvas, formatCanvasSnapshot } from '@/features/ai/canvas-snapshot'
import { serializeCanvas } from '@/features/ai/canvas-dsl'
import { parseDsl, parseDslWithDiagnostics } from '@/features/ai/dsl-parser'
import { TemplatePicker, type TemplateChoice } from '@/features/canvas/template-picker'
import { allTemplates, saveCustomTemplate, addCustomTemplate } from '@/lib/canvas-templates'
import { streamText } from '@/features/ai/stream-text'
import { summarizeOutline } from '@/features/ai/workflows'
import {
  buildClusterUserPrompt,
  parseClusters,
  applyClusters,
  CLUSTER_SYSTEM_PROMPT,
} from '@/features/ai/cluster'
import { useAIEnabled } from '@/features/ai/ai-settings-provider'
import { AiSetupCard } from '@/features/ai/ai-setup-card'
import { useAIAction } from '@/features/ai/use-ai-action'
import { pushToast } from '@/lib/toast-store'
import { DEFAULT_CANVAS_ID } from '@/features/canvas/default-canvas'
import {
  addCardShape,
  removeCardShape,
  syncCardsToEditor,
  updateCardShape,
  createCardOnCanvas,
} from '@/features/canvas/canvas-binding'
import { canvasStore, useCanvases, getSnapshot as getCanvasesSnapshot } from '@/lib/canvas-store'
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
  const pathname = usePathname()
  const handle = useRef<SelfCanvasHandle>({ adapter: null })
  // adapter 就绪态抬进 state(ref 赋值不触发 re-render,否则冷启动/切画布后
  // toolbar disabled、RelationPanel/FreedrawPanel/Minimap host=null 不挂载,
  // 直到某次无关 re-render 才救活)。SelfCanvas 经 onAdapterReady 回调写它。
  const [adapter, setAdapter] = useState<SelfBuiltAdapter | null>(null)
  const adapterReady = !!adapter
  const canvasElRef = useRef<HTMLCanvasElement | null>(null)
  const [detail, setDetail] = useState<{ card: Card } | null>(null)
  const [snapMode, setSnapMode] = useState<'snap' | 'free'>('snap')
  const [tool, setTool] = useState<'select' | 'freedraw' | 'eraser' | 'text' | 'connect'>('select')
  /** 橡皮模式:text 只擦文字 / card 只擦卡片(进回收桶)/ all 擦一切。选中 eraser 时顶栏出 3 子模式切换。 */
  const [eraserMode, setEraserMode] = useState<'text' | 'card' | 'all'>('all')
  // AI loading + abort(审计 M5+M9):骨架已抽进 useAIAction(R3),它拥有 aiBusy
  // state + aiAbortRef + 卸载 abort + 统一就绪守卫/catch。三个 handler 只提供
  // 业务体。防重复点击 / AbortController / 错误 toast 全在 hook 内。
  // Task 6: when AI isn't ready, the AI-layout entry shows the AiSetupCard
  // guide overlay instead of silently no-oping. Toggled by runAI(经 onNotReady)。
  const [showAiSetup, setShowAiSetup] = useState(false)
  // 稳定引用(setShowAiSetup 本就稳定):避免内联箭头每渲染新引用 → useAIAction 的
  // runAI 因 onNotReady dep 每渲染变 → 三 handler 每渲染重建(失稳定性)。包 useCallback
  // 后 runAI 只在 aiBusy/t 变时变,handler 稳定性回到原 aiBusy-dep 语义。
  const handleAiNotReady = useCallback(() => setShowAiSetup(true), [])
  const { aiBusy, runAI } = useAIAction(handleAiNotReady)

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
  /** 新建画布 modal 选中的模板('blank' | 模板名)。null = 模态未开。 */
  const [creatingTemplate, setCreatingTemplate] = useState<TemplateChoice>('blank')
  /**
   * 待应用的模板名:canvasStore.create → setActive 切到新画布 → SelfCanvas 经
   * key=canvasId 重建 adapter → onAdapterReady 抬进 state。模板 DSL 必须在新
   * 画布的 adapter 就绪后 applyLayout(否则 host 是旧画布的/还没挂)。这里用
   * 一个 pending ref 存模板名,onAdapterReady 触发时检查并消费它。
   */
  const pendingTemplateRef = useRef<TemplateChoice | null>(null)
  // B1 — 最近编辑跳转的待定位卡 id。从 /canvas/?card=ID 读入,等 adapter 就绪 +
  // (必要时切画布后 adapter 重建)消费:居中选中 + 开详情。跨 onAdapterReady 保活。
  const pendingJumpCardRef = useRef<string | null>(null)
  const [renamingId, setRenamingId] = useState<CanvasId | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<CanvasId | null>(null)
  // 二次确认:删画布是不可撤销的破坏性操作,要求输入 "delete" 才点亮危险按钮
  // (对齐 /trash 的 hard-delete 模式)。模态关闭时清空,下次重开从干净态开始。
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [companionOpen, setCompanionOpen] = useState(false)
  // 焦点模式(Batch A / 方向 5):隐藏所有 chrome(Toolbar/SideRail/Minimap/Outline),
  // 只留画布 + 一个最小「退出」提示。整理/写作时减少干扰。⌘. 切入,Escape 退出。
  const [focusMode, setFocusMode] = useState(false)
  const [dslOpen, setDslOpen] = useState(false)
  const [shortcutOpen, setShortcutOpen] = useState(false)
  const [diffOpen, setDiffOpen] = useState(false)
  const [overviewOpen, setOverviewOpen] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; px: number; py: number } | null>(null)

  // useMemo:snap/画布变化才重算(listOnCanvas + filter 是 2 次 O(n),无 memo 每 render 重算)。
  const onCanvas = useMemo(
    () => service.listOnCanvas(activeCanvasId).filter((c) => !c.archived && !c.deletedAt).length,
    [service, activeCanvasId, snap],
  )

  const toggleSnap = useCallback(() => {
    const adapter = handle.current.adapter
    if (!adapter) return
    const next = snapMode === 'snap' ? 'free' : 'snap'
    const v = adapter.getView()
    adapter.setView({ ...v, gridMode: next })
    // snapMode 不在这里 setView —— 下方 onViewChange 订阅会回推,单一可信源。
    // (setView 总会触发 onViewChange,即便值没变。)
  }, [snapMode])

  const zoomBy = useCallback(
    (op: 'in' | 'out' | 'fit') => {
      const adapter = handle.current.adapter
      if (!adapter) return
      const v = adapter.getView()
      if (op === 'in') adapter.setView({ ...v, zoom: Math.min(8, v.zoom * 1.2) })
      else if (op === 'out') adapter.setView({ ...v, zoom: Math.max(0.1, v.zoom / 1.2) })
      else {
        // fit:算所有元素 bbox union → 缩放居中适配视口(对齐 Figma/tldraw「框选所有」语义)。
        // 此前只是重置 pan/zoom 到原点 —— 内容在右下角时点 Fit 反而看不见(假适配)。
        const els = adapter.getElements()
        const hostEl = canvasElRef.current
        const hw = hostEl?.clientWidth ?? 800
        const hh = hostEl?.clientHeight ?? 600
        if (els.length === 0) {
          adapter.setView({ ...v, panX: 0, panY: 0, zoom: 1 })
          return
        }
        const b = unionBounds(els.map((e) => normalizeBox(e)))
        if (!b) {
          adapter.setView({ ...v, panX: 0, panY: 0, zoom: 1 })
          return
        }
        const pad = 80
        const zoom = Math.max(0.1, Math.min(8, Math.min((hw - pad * 2) / b.w, (hh - pad * 2) / b.h)))
        const panX = hw / 2 - (b.x + b.w / 2) * zoom
        const panY = hh / 2 - (b.y + b.h / 2) * zoom
        adapter.setView({ ...v, zoom, panX, panY })
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

  // Frame 主题分区:选中 1+ 卡 → 算 bbox + padding 创建 frame 容器。
  // 不门控 AI(转义/结构化是核心卖点,所有用户可用)。frame 走 host.batch 单 undo 步。
  const handleFrame = useCallback(() => {
    const adapter = handle.current.adapter
    if (!adapter) return
    const cards = adapter
      .getSelectedIds()
      .map((id) => adapter.getElement(id))
      .filter((el) => !!el && el.kind === 'card')
    if (cards.length === 0) {
      pushToast({ kind: 'info', message: t('canvas.frameNeedSelection') })
      return
    }
    const minX = Math.min(...cards.map((c) => c!.x))
    const minY = Math.min(...cards.map((c) => c!.y))
    const maxX = Math.max(...cards.map((c) => c!.x + c!.w))
    const maxY = Math.max(...cards.map((c) => c!.y + c!.h))
    const pad = 40
    const id =
      'frame-' +
      (typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2))
    adapter.batch(() => {
      adapter.upsert({
        id,
        kind: 'frame',
        x: Math.round(minX - pad),
        y: Math.round(minY - pad),
        w: Math.round(maxX - minX + pad * 2),
        h: Math.round(maxY - minY + pad * 2),
        rotation: 0,
        text: t('canvas.frameDefaultTitle'),
        color: 'blue',
      })
    })
    adapter.setSelectedIds([id])
    pushToast({ kind: 'success', message: t('canvas.frameCreated') })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t])

  // card 橡皮模式命中卡片 → 进回收桶(softDelete)。adapter 随后自己 remove 几何;
  // canvas-binding 的 removed 回写因 deletedAt 已设而跳过 removeFromCanvas(不双删)。
  // undo 由 reconcileHistory 恢复:host 恢复了卡元素但 DB deletedAt → service.restore。
  // 不 toast:连续擦多张会刷屏;按钮 label 已说明"进回收桶",trash 可见可恢复。
  // 对齐工具条:选中≥2 卡 → applyAlign 算 patch → host.batch 单 undo 步 upsert。
  // distribute-h/v 仅≥3 有意义,但第一版都显示(applyAlign 内部对<3 no-op,不误伤)。
  const onAlign = useCallback((op: AlignOp) => {
    const adapter = handle.current.adapter
    if (!adapter) return
    const selected = adapter
      .getSelectedIds()
      .map((id) => adapter.getElement(id))
      .filter((el): el is CanvasElement => !!el && el.kind === 'card')
    if (selected.length < 2) return
    const patches = applyAlign(selected, op)
    if (patches.size === 0) return
    adapter.batch(() => {
      for (const [id, p] of patches) {
        const existing = adapter.getElement(id)
        if (existing) adapter.upsert({ ...existing, ...p })
      }
    })
  }, [])

  // 整理范式(Batch 6):顶栏「整理」按钮的 popover——策略×方向×间距。
  // popover 经 portal 渲染到 body(逃离 toolbar overflow),fixed 定位贴 trigger 下方。
  const [organizeOpen, setOrganizeOpen] = useState(false)
  const organizeTriggerRef = useRef<HTMLButtonElement | null>(null)
  const [organizePos, setOrganizePos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    if (!organizeOpen) {
      setOrganizePos(null)
      return
    }
    const measure = () => {
      const el = organizeTriggerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      // popover 宽 ~220;左对齐 trigger 左沿(顶栏在上方,popover 往下展开)。
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - 240))
      const top = rect.bottom + 6
      setOrganizePos((prev) => (prev && prev.left === left && prev.top === top ? prev : { left, top }))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [organizeOpen])

  const onEraseCard = useCallback((cardId: string) => {
    service.softDelete(cardId as CardId)
  }, [service])

  // eraser 模式误选提示:card/text 模式下点了非匹配元素(如 card 模式点 arrow),
  // 模式过滤导致没删 → 用户困惑"为什么擦不掉"。检测 pointerdown 未导致删除时,
  // toast 引导切「全部」(5s 去重防刷屏)。all 模式不提示(能擦一切)。
  const lastMismatchRef = useRef(0)
  useEffect(() => {
    if (!adapter || tool !== 'eraser' || eraserMode === 'all') return
    const canvas = canvasElRef.current
    if (!canvas) return
    const onDown = () => {
      const before = adapter.getElements().length
      setTimeout(() => {
        if (adapter.getElements().length === before && Date.now() - lastMismatchRef.current > 5000) {
          lastMismatchRef.current = Date.now()
          pushToast({ kind: 'info', message: t('canvas.eraserModeMismatch') })
        }
      }, 0)
    }
    canvas.addEventListener('pointerdown', onDown)
    return () => canvas.removeEventListener('pointerdown', onDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, tool, eraserMode, t])

  // undo/redo 按钮 disabled 态:onHistoryChange(upsert/undo/redo)刷新。
  // 依赖 adapter state(Bug A 修复后):adapter 就绪/切画布重建后重订阅,
  // 避免旧 [activeCanvasId] ref 读到 null/旧 adapter 导致订阅不挂。
  const [, histTick] = useState(0)
  useEffect(() => {
    if (!adapter) return
    return adapter.onHistoryChange(() => histTick((n) => n + 1))
  }, [adapter])
  const canUndo = !!adapter?.canUndo()
  const canRedo = !!adapter?.canRedo()
  const handleUndo = useCallback(() => {
    handle.current.adapter?.undo()
  }, [])
  const handleRedo = useCallback(() => {
    handle.current.adapter?.redo()
  }, [])

  const handleAILayout = useCallback(async () => {
    await runAI('layout', async (ready, signal) => {
      const adapter = handle.current.adapter
      if (!adapter) return

      const snap = snapshotCanvas(adapter, service, activeCanvasId)
      const formatted = formatCanvasSnapshot(snap)

      const systemPrompt =
        'You are an active canvas layout organizer. The user clicked "AI layout" because they WANT the canvas reorganized — do not preserve the current layout unless it is already a clean, non-overlapping arrangement. Read each card\'s current position (provided in the snapshot) and substantially REPOSITION cards into a readable, well-spaced layout: group semantically related cards (by title keywords / tags) into clusters, align cards into a clear grid or DAG flow with consistent column widths, and ELIMINATE all overlap (no two cards may overlap). Use the full canvas: spread cards out with comfortable spacing (cards ~240x120, gap ~40-60px between neighbors). It IS expected and correct to substantially move cards from their current positions. You may reposition/resize cards and change colors; refine existing arrow relation signatures (dash style + arrowhead) where appropriate. IRON RULES (never break): (1) Cards are UPDATE-only — never create or delete cards; card content comes from the inbox. Reuse each existing #id to UPDATE. (2) Output one UPDATE directive for EVERY input card (reuse its #id) — never omit a card. (3) Do NOT create new relation arrows — only refine signatures of existing arrows (from/to are kept). (4) Free arrows (no from/to) keep their bbox. (5) Colors limited to blue/red/black/grey/yellow. Output DSL directives ONLY: one per line, each starting with "[", no markdown fences (no ```), no explanations, no preamble.'

      const userPrompt = `Reorganize this canvas into a clean, non-overlapping, well-spaced layout. Group related cards into clusters, align into a readable grid/DAG flow, and spread cards out across the canvas. Substantially reposition cards that are overlapping, cramped, or scattered — do not just nudge them.

${formatted}

Output DSL (one directive per line):
[card #id] @pos(x, y) @size(w, h) @color(blue|red|black|grey|yellow)
[rect #id] @pos(x, y) @size(w, h) @color(c)
[text #id] @pos(x, y) @text("...") @color(c)
[arrow #id] from #a to #b @label("...") @color(c) @dash(solid|dashed|dotted) @arrowhead(arrow|triangle|none)
[arrow #id] @pos(x, y) @size(w, h) @color(c) @dash(...) @arrowhead(...)   (free arrow: no from/to; w/h may be negative for direction)
Rules: reuse an existing #id to UPDATE it (from/to kept for relation arrows, bbox kept for free arrows); cards are update-only — output one UPDATE per input card; colors limited to blue/red/black/grey/yellow; do NOT create new relation arrows.`

      // maxTokens 提到 4096:排版 DSL 需要完整结构化输出,默认 1024 对思考模式模型
      // (DeepSeek-v4-pro 等)不够 —— 思考吃掉大半,DSL 还没输出完就被截断 → 解析 0 条。
      // structuredOutput:对 DeepSeek 等思考端点发 thinking:disabled,省 token 防截断
      // (实测:关思考后 17 行完整输出 vs 思考下 0 行截断)。非思考端点 no-op。
      // timeoutMs:60s — 排版产出长(每卡一行 DSL,卡多时超 30s 默认会被截断)。
      const result = await streamText(ready, { system: systemPrompt, user: userPrompt, maxTokens: 4096, structuredOutput: true, timeoutMs: 60_000 }, () => {}, signal)
      if (!result?.content) {
        pushToast({ kind: 'info', message: t('canvas.aiLayoutEmpty') })
        return
      }
      // 用诊断版解析:ops 空 + 有 errors → 模型输出了「[ 开头但格式错」的行(格式偏差 /
      // 思考截断)。给用户具体反馈而非一句「未生效」(转义核心卖点的信任:不静默失败)。
      const { ops, errors } = parseDslWithDiagnostics(result.content)
      if (ops.length === 0) {
        // errors 非空 = 模型确实输出了类 DSL 行但解析失败 → 格式问题(非空输出)。
        // errors 空 = 模型根本没输出 [ 行(纯散文/空) → 用 Empty 文案。
        pushToast({
          kind: 'info',
          message: errors.length > 0
            ? t('canvas.aiLayoutParseFail', { n: String(errors.length) })
            : t('canvas.aiLayoutEmpty'),
        })
        return
      }
      // 诚实位移反馈(Fix 4c):applyLayout 的 applied/skipped 无法区分「AI 真重排」
      // vs「AI 把坐标原样吐回」(两者 applied 都 >0)。在 apply 前后快照卡的 x/y,
      // 用纯函数 summarizeMovement 算实际位移 → 三分支反馈。这是「排版从来没有改变
      // 过我的布局」投诉的根因诊断:坐标原样返回时给「AI 认为当前布局已合理」而非
      // 假成功。只对比将被 apply 的卡 id(交集),省去无关元素。
      const cardIdsInOps = new Set(
        ops
          .filter((op): op is typeof op & { type: 'card' } => op.type === 'card')
          .map((op) => String(op.cardId)),
      )
      const snapshotPositions = (): Record<string, { x: number; y: number }> => {
        const map: Record<string, { x: number; y: number }> = {}
        for (const el of adapter.getElements()) {
          if (el.kind !== 'card') continue
          if (!cardIdsInOps.has(el.id)) continue
          map[el.id] = { x: el.x, y: el.y }
        }
        return map
      }
      const before = snapshotPositions()
      const { applied } = applyLayout(adapter, ops)
      const after = snapshotPositions()
      const summary = summarizeMovement(before, after)
      // 三分支(替换旧 applied/skipped 双分支):
      //  - applied=0:卡/端点缺失(原逻辑保留)
      //  - moved>0:真重排 → success「重排了 N 张(平均 Xpx)」
      //  - moved=0 但 applied>0:AI 把坐标原样吐回 → info「认为当前布局已合理,未改动」
      //    (这才是用户感知「没变」的诚实解释;skipped 作为次要信息并入此分支)
      if (applied === 0) {
        pushToast({ kind: 'info', message: t('canvas.aiLayoutNoneApplied') })
      } else if (summary.moved > 0) {
        pushToast({
          kind: 'success',
          message: t('canvas.aiLayoutMoved', {
            moved: String(summary.moved),
            avgPx: String(summary.avgPx),
          }),
        })
      } else {
        // AI 返回了 DSL 但坐标没变 → 诚实告知未改动(而非假成功)。
        pushToast({ kind: 'info', message: t('canvas.aiLayoutUnchanged') })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCanvasId, service, t, runAI])

  // AI cluster(找重复 / 找相似):读画布上的卡 → AI 分组 → 落 related-to 关系箭头
  // 连组内成员(非破坏性:只加关系,不合并不删卡)。走 serializeCardsForAI(allowlist
  // + 软删除过滤,无 deviceId / 无 media.dataUrl),遵守 AI 隐私铁律(无 vision)。
  const handleAICluster = useCallback(async () => {
    await runAI('cluster', async (ready, signal) => {
      const adapter = handle.current.adapter
      if (!adapter) return

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
        ready,
        { system: CLUSTER_SYSTEM_PROMPT, user: userPrompt, maxTokens: 2048, temperature: 0.2, structuredOutput: true, timeoutMs: 60_000 },
        () => {},
        signal,
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
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCanvasId, service, t, runAI])

  // 总结大纲工作流(W-T4):读当前画布卡片 → AI 生成 Markdown 大纲 → 写入 inbox
  // 新卡。走 summarizeOutline(内部 serializeCardsForAI allowlist + 软删过滤,
  // 无 deviceId / 无 media.dataUrl,遵守 AI 隐私铁律,无 vision)。
  // AI 未就绪 → AiSetupCard 引导(与 handleAILayout 同门,不静默 no-op)。
  const handleAIOutline = useCallback(async () => {
    await runAI('outline', async (_ready, signal) => {
      const res = await summarizeOutline({
        service,
        canvasId: activeCanvasId,
        signal,
      })
      if (!res.ok) {
        // 卡片太少(<2):AI 已在函数内门控返回;此处给明确提示而非静默。
        pushToast({ kind: 'info', message: t('ai.workflow.outlineTooFew') })
        return
      }
      if (res.empty) {
        pushToast({ kind: 'info', message: t('ai.workflow.outlineEmpty') })
        return
      }
      pushToast({ kind: 'success', message: t('ai.workflow.outlineDone') })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCanvasId, service, t, runAI])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ⌘C / Ctrl+C 复制选中元素为 DSL(剪贴板交换格式)。必须在下面
      // `metaKey/ctrlKey/altKey return` 之前处理,否则被吞掉。
      // 编辑态(input/textarea/contentEditable)不拦——让浏览器正常复制选中文本;
      // 无选中也不拦——让浏览器正常复制。
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key === 'c') {
        const adapter = handle.current.adapter
        const tgt = e.target as HTMLElement | null
        if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return
        if (!adapter) return
        const selected = adapter
          .getSelectedIds()
          .map((id) => adapter.getElement(id))
          .filter((el): el is CanvasElement => !!el)
        if (selected.length === 0) return
        e.preventDefault()
        const dsl = serializeCanvas(selected)
        navigator.clipboard?.writeText(dsl).then(() => {
          pushToast({ kind: 'success', message: t('canvas.copyDslOk', { n: String(selected.length) }) })
        }).catch(() => {
          // 剪贴板写失败(权限拒/非安全上下文)别静默 —— 否则用户看到无 toast 以为已复制,
          // 切去粘贴才发现是旧内容(与 dsl-dialog copy() 的 catch 同范式)。
          pushToast({ kind: 'error', message: t('canvas.dslCopyFail') })
        })
        return
      }
      // 模态打开时画布快捷键全部让位(CardDetailModal/DSL/Export/Diff/Overview/Shortcut),
      // 否则模态里按 +/g/v 等会在背后偷改画布视图/工具。⌘. 焦点模式也在让位之列 ——
      // 否则 modal 里按 ⌘. 会切焦点,关闭 modal 后画布意外进入焦点模式。
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
      // ⌘. / Ctrl+. 切换焦点模式(隐藏所有 chrome,只留画布)。在 modal 守卫之后,
      // input/textarea 让位之前(编辑态按 ⌘. 不切)。
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key === '.') {
        const tgt = e.target as HTMLElement | null
        if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return
        e.preventDefault()
        setFocusMode((m) => !m)
        return
      }
      const tgt = e.target as HTMLElement | null
      if (tgt) {
        const tag = tgt.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tgt.isContentEditable) return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const key = e.key.toLowerCase()
      // 焦点模式 Escape 优先退出(否则 Escape 给引擎取消选区)。
      if (key === 'escape' && focusMode) { e.preventDefault(); setFocusMode(false); return }
      // 工具切换:v 选 / p 画 / e 擦 / t 文 / c 连
      if (key === 'v') { e.preventDefault(); setTool('select') }
      else if (key === 'p') { e.preventDefault(); setTool('freedraw') }
      else if (key === 'e') { e.preventDefault(); setTool('eraser') }
      else if (key === 't') { e.preventDefault(); setTool('text') }
      else if (key === 'c') { e.preventDefault(); setTool('connect') }
      else if (key === '+' || key === '=') { e.preventDefault(); zoomBy('in') }
      else if (key === '-' || key === '_') { e.preventDefault(); zoomBy('out') }
      else if (key === '0' || key === '1') { e.preventDefault(); zoomBy('fit') }
      else if (key === 'g') { e.preventDefault(); toggleSnap() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoomBy, toggleSnap, t, focusMode])

  // BUG-A:applyLayout 的 onCardCreate 回调——create 类 op 落库为真实 Card。
  // 走 createCardOnCanvas(service, adapter, activeCanvasId, ...),复用 createWithId,
  // cardId 来自 DSL 的 #id,坐标/尺寸来自 op。paste 监听 + DslDialog 共用。
  const onCardCreate = useCallback((p: { cardId: string; x: number; y: number; w: number; h: number; color?: string }) => {
    if (!handle.current.adapter) return
    createCardOnCanvas(service, handle.current.adapter, activeCanvasId, {
      id: p.cardId, title: '', x: p.x, y: p.y, w: p.w, h: p.h,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, activeCanvasId])

  // BUG-B + BUG-A:把"疑似 DSL 文本 → 应用"抽成组件级回调,paste 监听和右键菜单(T6)共用。
  // 放宽检测:任何含 `[` 开头的行都算疑似 DSL(不再只认 5 种 kind)。
  // 整段疑似但 parse 出 0 ops → pasteDslNoneParsed(不静默);纯文本无 `[` 行 → 不打扰。
  const applyDslFromText = useCallback((text: string) => {
    const looksLikeDsl = text.split('\n').some((ln) => /^\s*\[/.test(ln))
    if (!looksLikeDsl) return
    const { ops, errors } = parseDslWithDiagnostics(text)
    if (ops.length === 0) {
      pushToast({ kind: 'info', message: t('canvas.pasteDslNoneParsed', { errors: String(errors.length) }) })
      return
    }
    const adapter = handle.current.adapter
    if (!adapter) return
    const { applied, skipped } = applyLayout(adapter, ops, undefined, onCardCreate)
    if (applied === 0) {
      pushToast({ kind: 'info', message: t('canvas.pasteDslNone') })
    } else if (skipped > 0 || errors.length > 0) {
      pushToast({ kind: 'info', message: t('canvas.pasteDslPartial', { applied: String(applied), skipped: String(skipped + errors.length) }) })
    } else {
      pushToast({ kind: 'success', message: t('canvas.pasteDslApplied', { n: String(applied) }) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCardCreate, t])

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
      textItem.getAsString((raw) => applyDslFromText(raw ?? ''))
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapterReady, applyDslFromText])

  const switchCanvas = (id: CanvasId) => {
    if (id === activeCanvasId) return
    // 切画布显式清选择 — 不只靠 key={canvasId} 重建的隐式副作用(契约化,防 key 防线被改)。
    handle.current.adapter?.setSelectedIds([])
    setDetail(null)
    canvasStore.setActive(id)
  }

  // 路由离开 /canvas(去 /inbox、/search 等)清 selection。
  // 静态导出 + 持久 layout 下 page 实例保留,选中态会原样残留 — 这是用户实测场景。
  // 若 layout 真卸载 page,adapter ref 为 null,此 effect no-op,不破坏。
  useEffect(() => {
    if (pathname && !pathname.startsWith('/canvas')) {
      handle.current.adapter?.setSelectedIds([])
    }
  }, [pathname])

  const handleCreateCanvas = (raw: string) => {
    const name = raw.trim()
    setCreatingName(null)
    if (!name) return
    // 记下要应用的模板(非 blank),onAdapterReady 时消费。canvasStore.create 会
    // setActive 到新画布,SelfCanvas key=canvasId 重建,onAdapterReady 在新
    // adapter 就绪时触发 → 此时 applyLayout 模板 DSL。
    if (creatingTemplate !== 'blank') {
      pendingTemplateRef.current = creatingTemplate
    }
    canvasStore.create(name)
  }

  /** 存当前画布为自建模板:prompt 名字 → serializeCanvasReadable + localStorage。 */
  const handleSaveAsTemplate = () => {
    const adapter = handle.current.adapter
    if (!adapter) return
    const name = window.prompt(t('canvas.template.namePlaceholder'), activeCanvas?.name ?? '')
    if (name === null) return // 取消
    const trimmed = name.trim()
    if (!trimmed) {
      pushToast({ kind: 'info', message: t('canvas.template.needName') })
      return
    }
    const ok = saveCustomTemplate(trimmed, adapter.getElements())
    pushToast({
      kind: ok ? 'success' : 'error',
      message: ok
        ? t('canvas.template.saved', { name: trimmed })
        : t('canvas.template.saveFail'),
    })
  }

  /** 导入模板(Batch A / 方向 3):prompt 名字 + 粘贴 DSL → addCustomTemplate。
   *  DSL 应用时才解析(parseDsl 容错),这里只存文本。分享/备份模板的入口。 */
  const handleImportTemplate = () => {
    const name = window.prompt(t('canvas.template.importNamePrompt'))
    if (name === null) return
    const trimmedName = name.trim()
    if (!trimmedName) {
      pushToast({ kind: 'info', message: t('canvas.template.needName') })
      return
    }
    const dsl = window.prompt(t('canvas.template.importDslPrompt'))
    if (dsl === null) return
    if (!dsl.trim()) {
      pushToast({ kind: 'info', message: t('canvas.template.needDsl') })
      return
    }
    const ok = addCustomTemplate(trimmedName, dsl)
    pushToast({
      kind: ok ? 'success' : 'error',
      message: ok
        ? t('canvas.template.imported', { name: trimmedName })
        : t('canvas.template.saveFail'),
    })
  }

  const startRename = () => setRenamingId(activeCanvasId)
  const handleRename = (raw: string) => {
    const name = raw.trim()
    setRenamingId(null)
    if (!name) return
    canvasStore.rename(activeCanvasId, name)
  }

  const requestDelete = () => {
    // 默认画布受 store 保护(canvasStore.delete 拒绝默认 id)——按钮保持可点
    // (不再死灰),点了给明确提示告诉用户怎么走,而不是静默 no-op(原"用不了")。
    if (activeCanvasId === DEFAULT_CANVAS_ID) {
      pushToast({ kind: 'info', message: t('canvas.deleteDefaultHint') })
      return
    }
    setConfirmDeleteId(activeCanvasId)
  }

  const confirmDelete = () => {
    if (!confirmDeleteId) return
    // 先删画布(localStorage,可能配额失败),成功才把卡片移回 inbox(DB)。
    // 此前顺序反了:先 removeFromCanvas 再 delete —— 配额失败时画布回滚仍存在,
    // 但卡片已离开画布,部分失败无反馈(真 bug)。原子化:delete 失败则不动卡片,
    // 画布保留,用户可重试。notifyQuota 已弹泛化配额 toast;此处不关模态让用户知晓未删。
    const cardsToMove = service.listOnCanvas(confirmDeleteId)
    if (canvasStore.delete(confirmDeleteId)) {
      for (const c of cardsToMove) service.removeFromCanvas(c.id)
      setConfirmDeleteId(null)
      setDeleteConfirmText('')
    }
  }

  // 画布 → Markdown 导出(信念4「本地数据随时可导出开放格式」)。
  // canvasToMarkdown 是纯函数;这里只做:取 elements + 映射 card 信息 + Blob 下载。
  // try/catch:text 极大时 new Blob / createObjectURL 可抛(对齐 dsl-dialog download)。
  const handleMarkdown = () => {
    const adapter = handle.current.adapter
    if (!adapter) return
    try {
      const elements = adapter.getElements()
      const name = activeCanvas?.name ?? ''
      const md = canvasToMarkdown(elements, {
        getCardInfo: (id) => {
          const c = service.get(id as CardId)
          if (!c) return null
          return { title: c.title, body: c.body, type: c.type, pinned: c.pinned }
        },
        canvasName: name,
      })
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = markdownFileName(name)
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      pushToast({ kind: 'success', message: t('canvas.markdownDownloaded') })
    } catch {
      pushToast({ kind: 'error', message: t('canvas.markdownDownloadFail') })
    }
  }


  const activeCanvas = canvases.find((c) => c.id === activeCanvasId)
  const cardCountOnTarget = confirmDeleteId
    ? service.listOnCanvas(confirmDeleteId).filter((c) => !c.deletedAt).length
    : 0
  // 画布是否还有 freeform 元素(text/freedraw/arrow/rect/frame)—— 用于 cv-empty 判断:
  // 卡片擦完但还有 freeform 时不该显示空提示(用户在画线/手绘中途不该被打断)。
  // onUserChange 触发重算;adapter 切换(切画布)重订阅 + 初始同步。
  const [hasFreeform, setHasFreeform] = useState(false)
  useEffect(() => {
    if (!adapter) { setHasFreeform(false); return }
    const check = () => setHasFreeform(adapter.getElements().some((e) => e.kind !== 'card'))
    check()
    return adapter.onUserChange(check)
  }, [adapter])
  // Reflect the current card selection on the auto-relate button via the
  // host's onSelectionChange event (debt 收口 2026-06-23, 替原 300ms 轮询)。
  const [selectedCardCount, setSelectedCardCount] = useState(0)
  useEffect(() => {
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
  }, [adapter])
  const showAutoRelate = aiEnabled && selectedCardCount >= 2

  // adapter ready 时同步工具(切 canvas 重建 adapter 后恢复当前 tool)。
  useEffect(() => {
    handle.current.adapter?.setTool(tool)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, adapterReady])

  // snapMode 单一可信源:从 adapter 的 live view 派生(Bug C 修复)。
  // 切画布时 SelfCanvas 重建并把持久化的 per-canvas gridMode setView 进来 ——
  // 这里的 onAdapterReady 让我们拿到新 adapter,读它的当前 gridMode 重置按钮态,
  // 再订阅 onViewChange 保证后续任何 setView(toggleSnap / keyboard 'g' / fit)
  // 都让 SnapToggle 如实反映。否则切画布后 snapMode 仍是上一画布的值,按钮撒谎。
  useEffect(() => {
    if (!adapter) return
    setSnapMode(adapter.getView().gridMode)
    const unsub = adapter.onViewChange((v) => setSnapMode(v.gridMode))
    return () => unsub()
  }, [adapter])

  // B1 — 挂载时读 ?card=ID(C command palette 最近编辑跳转来的)。记入 pendingRef,
  // 清掉 query string(避免刷新重复触发)。消费见下方 adapter 就绪 effect。
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const cardId = params.get('card')
    if (cardId) {
      pendingJumpCardRef.current = cardId
      // 清 query string(replaceState 不留历史,刷新不再触发)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  // B1 — 消费 pendingJumpCardRef:adapter 就绪时,定位到目标卡。
  // 卡可能在别的画布 → 切画布(SelfCanvas 重建,adapter 重新就绪,本 effect 再跑)。
  useEffect(() => {
    const cardId = pendingJumpCardRef.current
    if (!adapter || !cardId) return
    const card = service.get(cardId as CardId)
    if (!card || card.deletedAt) {
      // 卡不存在/已删 → 清 ref 静默退出
      pendingJumpCardRef.current = null
      return
    }
    const targetCanvas = card.canvasPosition?.canvasId
    // 卡在别的画布 → 切过去(adapter 重建,本 effect 再跑消费)。
    // 但要先确认该画布存在:孤儿卡(canvasPosition 指向已删画布,老数据/导入边界)
    // 会让 canvasStore.setActive no-op → adapter 不重建 → 本 effect 不重跑 →
    // pendingJumpCardRef 永不清 → 跳转卡死。画布不存在时不切,落到下方开详情。
    if (targetCanvas && targetCanvas !== activeCanvasId) {
      const exists = getCanvasesSnapshot().canvases.some((c) => c.id === targetCanvas)
      if (exists) {
        canvasStore.setActive(targetCanvas)
        return // 切画布后 adapter 重建,本 effect 重跑
      }
      // 孤儿卡:不切画布,清掉陈旧 canvasPosition 回 inbox,继续开详情。
      service.removeFromCanvas(card.id)
    }
    // 卡在当前画布(adapter 有该元素)→ 居中选中 + 开详情
    const el = adapter.getElement(cardId)
    if (el) {
      const v = adapter.getView()
      const hostEl = document.querySelector('.cv-host canvas') as HTMLCanvasElement | null
      const cx = (hostEl?.clientWidth ?? 800) / 2
      const cy = (hostEl?.clientHeight ?? 600) / 2
      const c = elementCenter(el)
      const zoom = v.zoom || 1
      adapter.setView({ ...v, panX: cx - c.x * zoom, panY: cy - c.y * zoom })
      adapter.setSelectedIds([cardId])
    }
    setDetail({ card })
    pendingJumpCardRef.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter])

  // 模板应用:新建画布后 pendingTemplateRef 携带模板名,新 adapter 一就绪就
  // applyLayout。依赖 adapter —— canvasStore.create → setActive → SelfCanvas
  // 重建(key=canvasId)→ onAdapterReady → setAdapter → 本 effect 重跑,此刻
  // adapter 指向新画布,onCardCreate 也绑到新 activeCanvasId。消费后清 ref
  // 防重入(后续无关的 adapter 变化不再误应用)。
  useEffect(() => {
    const tplName = pendingTemplateRef.current
    if (!adapter || !tplName) return
    const adapterLocal = adapter
    const template = allTemplates().find((x) => x.name === tplName)
    pendingTemplateRef.current = null
    if (!template) return
    const ops = parseDsl(template.dsl)
    if (ops.length === 0) return
    applyLayout(adapterLocal, ops, undefined, (p) => {
      // onCardCreate 走 createCardOnCanvas:模板含 [card #id create] → 建空卡。
      // 复用 page 现有 onCardCreate 逻辑(同 activeCanvasId / service)。
      if (!handle.current.adapter) return
      createCardOnCanvas(service, handle.current.adapter, activeCanvasId, {
        id: p.cardId, title: '', x: p.x, y: p.y, w: p.w, h: p.h,
      })
    })
    pushToast({ kind: 'success', message: t('canvas.template.applied', { name: tplName === 'blank' ? '' : tplName }) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter])

  // Bug B fix: derive the LIVE card from the store by id during render.
  // The page re-renders on any store change (useDb subscription), but the
  // modal used to keep showing the STALE `detail.card` captured at open
  // time — including a ghost card since soft-deleted / archived-elsewhere
  // (another tab, the side-rail delete, a batch action). service.get returns
  // soft-deleted cards too, so we filter on !deletedAt: when the card is
  // gone (or soft-deleted) effectiveDetail becomes null and the modal
  // unmounts. Edited-elsewhere cards show fresh data. Action callbacks read
  // effectiveDetail.card.id (guaranteed non-null while modal is open).
  const liveDetailCard = detail ? (service.get(detail.card.id) ?? null) : null
  const effectiveDetail =
    liveDetailCard && !liveDetailCard.deletedAt
      ? { card: liveDetailCard }
      : null

  return (
    <main id="main" tabIndex={-1} className={`page${focusMode ? ' page--focus' : ''}`}>
      <h1 className="sr-only">{t('canvas.crumb')}</h1>
      {!focusMode && (
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
        {([
          { tk: 'select', icon: 'select' as CanvasIconName, label: 'canvas.tool.select', labelShort: 'canvas.tool.select.short' },
          { tk: 'freedraw', icon: 'pen' as CanvasIconName, label: 'canvas.tool.draw', labelShort: 'canvas.tool.draw.short' },
          { tk: 'eraser', icon: 'eraser' as CanvasIconName, label: 'canvas.tool.eraser', labelShort: 'canvas.tool.eraser.short' },
          { tk: 'text', icon: 'text' as CanvasIconName, label: 'canvas.tool.text', labelShort: 'canvas.tool.text.short' },
          { tk: 'connect', icon: 'connect' as CanvasIconName, label: 'canvas.tool.connect', labelShort: 'canvas.tool.connect.short' },
        ] as const).map(({ tk, icon, label, labelShort }) => (
          <button
            key={tk}
            type="button"
            className={`tb-tool${tool === tk ? ' tb-tool--active' : ''}`}
            onClick={() => setTool(tk)}
            disabled={!adapterReady}
            aria-pressed={tool === tk}
            title={t(label)}
            aria-label={t(label)}
          >
            <span className="tb-tool__icon"><CanvasIcon name={icon} /></span>
            <span className="tb-tool__label">{t(labelShort)}</span>
          </button>
        ))}
        {/* 橡皮子模式:选中 eraser 时显示(文字/卡片/全部),各司其职。
            全部=擦一切;卡片=只擦 card 进回收桶;文字=只擦 text 精确改字不误伤。 */}
        {tool === 'eraser' && (
          <>
            <span className="tb-divider" aria-hidden="true" />
            {([
              { em: 'all', icon: 'erase-all' as CanvasIconName },
              { em: 'card', icon: 'erase-card' as CanvasIconName },
              { em: 'text', icon: 'text' as CanvasIconName },
            ] as const).map(({ em, icon }) => (
              <button
                key={em}
                type="button"
                className={`tb-tool tb-tool--sub${eraserMode === em ? ' tb-tool--active' : ''}`}
                onClick={() => setEraserMode(em)}
                disabled={!adapterReady}
                aria-pressed={eraserMode === em}
                title={t(`canvas.eraserMode.${em}`)}
                aria-label={t(`canvas.eraserMode.${em}`)}
              >
                <span className="tb-tool__icon"><CanvasIcon name={icon} /></span>
                <span className="tb-tool__label">{t(`canvas.eraserMode.${em}.short`)}</span>
              </button>
            ))}
          </>
        )}
        <span className="tb-divider" aria-hidden="true" />
        <SnapToggle mode={snapMode} onToggle={toggleSnap} disabled={!adapterReady} />
        <span className="tb-divider" aria-hidden="true" />
        <ZoomGroup adapterReady={adapterReady} onZoom={zoomBy} />
        {/* 整理范式(Batch 6):顶栏「整理」按钮 → popover(策略×方向×间距)。
            替代旧的「自动布局」直触。popover 内应用按钮走 computeAutoLayout。 */}
        <button
          type="button"
          className="tb-btn"
          disabled={!adapterReady}
          onClick={() => setOrganizeOpen((o) => !o)}
          aria-label={t('canvas.organize.title')}
          aria-expanded={organizeOpen}
          title={t('canvas.organize.title')}
          ref={organizeTriggerRef}
        >
          <span className="tb-btn__icon" aria-hidden="true"><CanvasIcon name="auto-layout" /></span>
        </button>
        {/* 对齐工具条:选中≥2 卡时出现 9 操作(左/右/上/下/水平居中/垂直居中/
            水平等距/垂直等距/等大)。图标用 unicode 符号(包豪斯风),applyAlign 算
            patch,host.batch 单 undo 步。<2 隐藏;distribute 对<3 内部 no-op。 */}
        {selectedCardCount >= 2 && (
          <>
            <span className="tb-divider" aria-hidden="true" />
            <AlignGroup adapterReady={adapterReady} count={selectedCardCount} onAlign={onAlign} />
          </>
        )}
      </Toolbar>
      )}
      {organizeOpen && (
        <OrganizePopover
          pos={organizePos}
          host={handle.current.adapter}
          onFit={() => zoomBy('fit')}
          onClose={() => setOrganizeOpen(false)}
          toast={pushToast}
        />
      )}

      <div className={`cv-host cv-host--${tool}`} onContextMenu={(e) => {
        e.preventDefault()
        const adapter = handle.current.adapter
        if (!adapter) return
        const canvas = canvasElRef.current
        if (!canvas) return
        const rect = canvas.getBoundingClientRect()
        const view = adapter.getView()
        const p = screenToPage(view, e.clientX - rect.left, e.clientY - rect.top)
        setCtxMenu({ x: e.clientX, y: e.clientY, px: p.x, py: p.y })
      }}>
        <SelfCanvas
          key={activeCanvasId}
          canvasId={activeCanvasId}
          service={service}
          tool={tool}
          eraserMode={eraserMode}
          onEraseCard={onEraseCard}
          onOpenCard={(card) => setDetail({ card })}
          adapterRef={handle}
          canvasElRef={canvasElRef}
          onAdapterReady={setAdapter}
        />
        {!ready ? null : onCanvas === 0 && !hasFreeform && (adapter?.getElements().length ?? 0) === 0 && (
          <div className="cv-empty">
            <CanvasEmptyMotif />
            <span className="eyebrow">{t('canvas.emptyTitle')}</span>
            <span className="mono">{t('canvas.emptyHint')}</span>
            <Link href="/inbox" className="cv-empty__cta">
              {t('canvas.emptyCta')} →
            </Link>
          </div>
        )}
        <RelationPanel host={adapter} canvasEl={canvasElRef.current} />
        <FreedrawPanel host={adapter} canvasEl={canvasElRef.current} />
        {!focusMode && (
        <>
        <CanvasSideRail
          aiEnabled={aiEnabled}
          aiBusy={aiBusy}
          showAutoRelate={showAutoRelate}
          adapterReady={adapterReady}
          outlineOpen={outlineOpen}
          companionOpen={companionOpen}
          canUndo={canUndo}
          canRedo={canRedo}
          canRename={!!activeCanvas}
          canDelete={true}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onNewCanvas={() => { setCreatingTemplate('blank'); setCreatingName('') }}
          onRename={startRename}
          onDelete={requestDelete}
          onSaveAsTemplate={handleSaveAsTemplate}
          onImportTemplate={handleImportTemplate}
          onAILayout={handleAILayout}
          onAICluster={handleAICluster}
          onAutoRelate={handleAutoRelate}
          onAIOutline={handleAIOutline}
          onFrame={handleFrame}
          onOutline={() => setOutlineOpen((o) => !o)}
          onCompanion={() => setCompanionOpen((o) => !o)}
          onOverview={() => setOverviewOpen(true)}
          onDsl={() => setDslOpen(true)}
          onExport={() => setExportOpen(true)}
          onMarkdown={handleMarkdown}
          onDiff={() => setDiffOpen(true)}
          onShortcuts={() => setShortcutOpen(true)}
        />
        {outlineOpen && (
          <OutlinePanel
            host={adapter}
            canvasEl={canvasElRef.current}
            getCardTitle={(id) => service.get(id as CardId)?.title}
            getEndpointTitle={(id) => service.get(id as CardId)?.title}
          />
        )}
        {companionOpen && (
          <CanvasCompanionPanel
            host={adapter}
            cards={service.listOnCanvas(activeCanvasId).filter((c) => !c.deletedAt)}
            canvasEl={canvasElRef.current}
            getCardTitle={(id) => service.get(id as CardId)?.title}
            service={service}
            canvasId={activeCanvasId}
          />
        )}
        <Minimap host={adapter} canvasEl={canvasElRef.current} />
        </>
        )}
        {/* 焦点模式:画布占满,顶部留最小退出提示(Esc 或点)。RelationPanel/FreedrawPanel
            是选中触发的浮面板,焦点模式下保留(用户整理时仍需看关系/手绘信息)。 */}
        {focusMode && (
          <button
            type="button"
            className="cv-focus-exit"
            onClick={() => setFocusMode(false)}
            aria-label={t('canvas.exitFocus')}
            title={t('canvas.exitFocus')}
          >
            {t('canvas.exitFocus')} · Esc
          </button>
        )}
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
        <TemplatePicker selected={creatingTemplate} onSelect={setCreatingTemplate} />
        <div className="confirm__actions">
          <Button variant="ghost" onClick={() => setCreatingName(null)}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => handleCreateCanvas(creatingName ?? '')} disabled={!creatingName?.trim()}>{t('canvas.new')}</Button>
        </div>
      </Modal>

      <Modal open={confirmDeleteId !== null} onClose={() => { setConfirmDeleteId(null); setDeleteConfirmText('') }} title={t('canvas.deleteModalTitle')}>
        <p className="confirm__body">
          {cardCountOnTarget > 0
            ? t('canvas.deleteModalBodyCards', { name: canvases.find((c) => c.id === confirmDeleteId)?.name ?? '', n: cardCountOnTarget })
            : t('canvas.deleteModalBodyNoCards', { name: canvases.find((c) => c.id === confirmDeleteId)?.name ?? '' })}
        </p>
        <p className="confirm__body">{t('canvas.deleteConfirmType')}</p>
        <input
          className="confirm__type"
          type="text"
          autoFocus
          autoComplete="off"
          placeholder="delete"
          value={deleteConfirmText}
          onChange={(e) => setDeleteConfirmText(e.target.value)}
        />
        <div className="confirm__actions">
          <Button variant="ghost" onClick={() => { setConfirmDeleteId(null); setDeleteConfirmText('') }}>{t('common.cancel')}</Button>
          <Button variant="danger" disabled={deleteConfirmText !== 'delete'} onClick={confirmDelete}>{t('canvas.deleteCanvas')}</Button>
        </div>
      </Modal>

      {effectiveDetail && (
        <CardDetailModal
          card={effectiveDetail.card}
          onClose={() => setDetail(null)}
          onSave={(patch) => {
            // Bug C fix: previously only title + body were persisted, which
            // silently dropped tag edits (and would drop any other field the
            // modal collects if it grows). Spread the full patch through so
            // title/body/tags all reach service.update (mirrors inbox's onSave).
            const updated = service.update(effectiveDetail.card.id, patch)
            if (updated && handle.current.adapter) updateCardShape(handle.current.adapter, updated)
            if (updated) setDetail({ card: updated })
            // F7 双链同步:画布上编辑卡 body 保存后,解析 [[标题]] 自动建/删 references
            // wikilink 箭头。只在画布上触发(inbox 卡可能没上画布,arrow 无意义)。
            if (updated && handle.current.adapter && patch.body !== undefined) {
              const { created, removed } = syncWikiLinkArrows({
                host: handle.current.adapter,
                getCardTitle: (id) => service.get(id as CardId)?.title,
                sourceCardId: effectiveDetail.card.id,
                body: patch.body,
              })
              if (created > 0 || removed > 0) {
                pushToast({ kind: 'info', message: t('canvas.wikiLinked', { created: String(created), removed: String(removed) }) })
              }
            }
            // BR-T5 块引用同步:画布上编辑卡 body 保存后,解析 ((标题)) 自动建/删
            // embeds 箭头。与 wikilink 同分支(wikiLinks 已 toast;embeds 仅在
            // 有变更时单独 toast,口径一致)。
            if (updated && handle.current.adapter && patch.body !== undefined) {
              const emb = syncEmbedArrows({
                host: handle.current.adapter,
                getCardTitle: (id) => service.get(id as CardId)?.title,
                sourceCardId: effectiveDetail.card.id,
                body: patch.body,
              })
              if (emb.created > 0 || emb.removed > 0) {
                pushToast({ kind: 'info', message: t('canvas.embedLinked', { created: String(emb.created), removed: String(emb.removed) }) })
              }
            }
            return updated != null
          }}
          onArchive={() => {
            service.archive(effectiveDetail.card.id)
            if (handle.current.adapter) removeCardShape(handle.current.adapter, effectiveDetail.card.id)
            setDetail(null)
          }}
          onUnarchive={() => {
            service.unarchive(effectiveDetail.card.id)
            const c = service.get(effectiveDetail.card.id)
            if (c && handle.current.adapter) addCardShape(handle.current.adapter, c)
            setDetail(c ? { card: c } : null)
          }}
          onDelete={() => {
            service.softDelete(effectiveDetail.card.id)
            if (handle.current.adapter) removeCardShape(handle.current.adapter, effectiveDetail.card.id)
            setDetail(null)
          }}
          onSendToInbox={() => {
            service.removeFromCanvas(effectiveDetail.card.id)
            if (handle.current.adapter) removeCardShape(handle.current.adapter, effectiveDetail.card.id)
            setDetail(null)
          }}
          host={adapter}
          getCardTitle={(id) => service.get(id as CardId)?.title}
          onJumpToCard={(cardId) => {
            // Backlink 跳转:选中对方卡元素 + 居中视口 + 关闭本 modal。
            // 复用 OutlinePanel/Minimap 同款 centering(pan = screenCenter - pageCenter*zoom)。
            const a = adapter
            const el = a?.getElement(cardId)
            if (a && el) {
              const v = a.getView()
              const hostEl = document.querySelector('.cv-host canvas') as HTMLCanvasElement | null
              const cx = (hostEl?.clientWidth ?? 800) / 2
              const cy = (hostEl?.clientHeight ?? 600) / 2
              const c = elementCenter(el)
              const zoom = v.zoom || 1
              a.setView({ ...v, panX: cx - c.x * zoom, panY: cy - c.y * zoom })
              a.setSelectedIds([cardId])
            }
            setDetail(null)
          }}
        />
      )}

      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        host={adapter}
        service={service}
        canvasId={activeCanvasId}
        canvasName={activeCanvas?.name ?? ''}
      />

      <DslDialog
        open={dslOpen}
        onClose={() => setDslOpen(false)}
        host={adapter}
        service={service}
        canvasName={activeCanvas?.name ?? ''}
        onCardCreate={onCardCreate}
      />

      <ShortcutHelpDialog open={shortcutOpen} onClose={() => setShortcutOpen(false)} />

      <DiffDialog open={diffOpen} onClose={() => setDiffOpen(false)} host={adapter} />

      <CanvasOverviewModal
        open={overviewOpen}
        onClose={() => setOverviewOpen(false)}
        host={adapter}
        canvasEl={canvasElRef.current}
      />

      <Modal open={showAiSetup} onClose={() => setShowAiSetup(false)} title={t('canvas.aiSetupTitle')}>
        <AiSetupCard
          onGoToSettings={() => {
            setShowAiSetup(false)
            window.location.href = '/settings'
          }}
        />
        <div className="confirm__actions">
          <Button variant="ghost" onClick={() => setShowAiSetup(false)}>
            {t('card.detail.cancel')}
          </Button>
        </div>
      </Modal>

      <CanvasContextMenu
        open={ctxMenu !== null}
        x={ctxMenu?.x ?? 0}
        y={ctxMenu?.y ?? 0}
        onClose={() => setCtxMenu(null)}
        onCreateHere={(title) => {
          const adapter = handle.current.adapter
          if (!adapter || !ctxMenu) return
          const card = createCardOnCanvas(service, adapter, activeCanvasId, { title, x: ctxMenu.px, y: ctxMenu.py })
          adapter.setSelectedIds([String(card.id)])
          setCtxMenu(null)
        }}
        onPasteDsl={() => {
          navigator.clipboard?.readText().then((text) => applyDslFromText(text ?? '')).catch(() => {
            // 读取失败(权限拒/空剪贴板)给反馈 —— 否则右键粘贴 DSL 无任何提示,用户不知为何没粘。
            pushToast({ kind: 'info', message: t('canvas.pasteDslReadFail') })
          })
        }}
        onFitView={() => zoomBy('fit')}
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
      <select className="cselect" value={activeId} onChange={(e) => onSwitch(e.target.value as CanvasId)} title={t('canvas.switchTitle')} aria-label={t('canvas.switchTitle')}>
        {canvases.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
      </select>
      <button type="button" className="cselect-edit" onClick={onStartRename} title={t('canvas.renameTitle')} aria-label={t('canvas.renameTitle')}>✎</button>
    </>
  )
}

function SnapToggle({ mode, onToggle, disabled }: { mode: 'snap' | 'free'; onToggle: () => void; disabled: boolean }) {
  const { t } = useI18n()
  return (
    <button type="button" className={`tb-snap tb-snap--${mode} tb-snap--toggle`} onClick={onToggle} disabled={disabled} aria-pressed={mode === 'snap'} title={t('canvas.toggleSnap')}>
      <span className="tb-snap__label">{mode === 'snap' ? t('canvas.snap') : t('canvas.free')}</span>
      <span className="tb-snap__glyph" aria-hidden="true">{mode === 'snap' ? '▦' : '⌗'}</span>
    </button>
  )
}

function AlignGroup({ adapterReady, count, onAlign }: { adapterReady: boolean; count: number; onAlign: (op: AlignOp) => void }) {
  const { t } = useI18n()
  // 9 对齐操作 + lucide 图标。distribute-h/v 在 count<3 时 disable(无意义)。
  const items: { op: AlignOp; icon: CanvasIconName; label: string }[] = [
    { op: 'left', icon: 'align-left', label: t('canvas.align.left') },
    { op: 'center-h', icon: 'align-center-h', label: t('canvas.align.centerH') },
    { op: 'right', icon: 'align-right', label: t('canvas.align.right') },
    { op: 'top', icon: 'align-top', label: t('canvas.align.top') },
    { op: 'center-v', icon: 'align-center-v', label: t('canvas.align.centerV') },
    { op: 'bottom', icon: 'align-bottom', label: t('canvas.align.bottom') },
    { op: 'distribute-h', icon: 'distribute-h', label: t('canvas.align.distributeH') },
    { op: 'distribute-v', icon: 'distribute-v', label: t('canvas.align.distributeV') },
    { op: 'equalize', icon: 'equalize', label: t('canvas.align.equalize') },
  ]
  return (
    <span className="tb-align">
      {items.map(({ op, icon, label }) => {
        const needsThree = op === 'distribute-h' || op === 'distribute-v'
        const disabled = !adapterReady || (needsThree && count < 3)
        return (
          <button
            key={op}
            type="button"
            className="tb-icon-btn tb-align__btn"
            onClick={() => onAlign(op)}
            disabled={disabled}
            title={label}
            aria-label={label}
          >
            <span className="tb-align__icon" aria-hidden="true"><CanvasIcon name={icon} /></span>
          </button>
        )
      })}
    </span>
  )
}

function ZoomGroup({ adapterReady, onZoom }: { adapterReady: boolean; onZoom: (op: 'in' | 'out' | 'fit') => void }) {
  const { t } = useI18n()
  return (
    <span className="tb-zoom">
      <button type="button" className="tb-icon-btn" onClick={() => onZoom('out')} disabled={!adapterReady} aria-label={t('canvas.zoomOut')} title={`${t('canvas.zoomOut')} (-)`}>−</button>
      <button type="button" className="tb-icon-btn" onClick={() => onZoom('in')} disabled={!adapterReady} aria-label={t('canvas.zoomIn')} title={`${t('canvas.zoomIn')} (+)`}>+</button>
      <button type="button" className="tb-icon-btn tb-icon-btn--fit" onClick={() => onZoom('fit')} disabled={!adapterReady} aria-label={t('canvas.zoomFit')} title={`${t('canvas.zoomFit')} (0)`}>
        <span className="tb-icon-btn__label">{t('canvas.zoomFit')}</span>
      </button>
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
  outlineOpen,
  companionOpen,
  canUndo,
  canRedo,
  canRename,
  canDelete,
  onUndo,
  onRedo,
  onNewCanvas,
  onRename,
  onDelete,
  onSaveAsTemplate,
  onImportTemplate,
  onAILayout,
  onAICluster,
  onAutoRelate,
  onAIOutline,
  onFrame,
  onOutline,
  onCompanion,
  onDsl,
  onOverview,
  onExport,
  onMarkdown,
  onDiff,
  onShortcuts,
}: {
  aiEnabled: boolean
  aiBusy: null | 'layout' | 'cluster' | 'outline'
  showAutoRelate: boolean
  adapterReady: boolean
  outlineOpen: boolean
  companionOpen: boolean
  canUndo: boolean
  canRedo: boolean
  canRename: boolean
  canDelete: boolean
  onUndo: () => void
  onRedo: () => void
  onNewCanvas: () => void
  onRename: () => void
  onDelete: () => void
  onSaveAsTemplate: () => void
  onImportTemplate: () => void
  onAILayout: () => void
  onAICluster: () => void
  onAutoRelate: () => void
  onAIOutline: () => void
  onFrame: () => void
  onOutline: () => void
  onCompanion: () => void
  onOverview: () => void
  onDsl: () => void
  onExport: () => void
  onMarkdown: () => void
  onDiff: () => void
  onShortcuts: () => void
}) {
  const { t } = useI18n()
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  // AI 工作流 popover(聚类重排 / 生成关系 / 总结大纲)。复用导出菜单同款 portal
  // + fixed 定位模式(逃离 rail 的 overflow 裁剪)。
  const [wfMenuOpen, setWfMenuOpen] = useState(false)
  const wfTriggerRef = useRef<HTMLButtonElement | null>(null)
  const [wfMenuPos, setWfMenuPos] = useState<{ left: number; top: number } | null>(null)
  // P0 #1: 渲染到 body 的 portal,让导出二级菜单逃离 .cv-rail 的 overflow-y:auto
  // (overflow-y:auto 会让 overflow-x 计算成 auto,横向裁掉左侧弹出的菜单)。
  // 用 fixed 定位 + trigger 的 getBoundingClientRect;开/关 + 窗口 resize 时重测。
  const exportTriggerRef = useRef<HTMLButtonElement | null>(null)
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null)
  const measureMenu = (
    open: boolean,
    triggerRef: React.RefObject<HTMLButtonElement | null>,
    setPos: (updater: (prev: { left: number; top: number } | null) => { left: number; top: number } | null) => void,
    menuWidth = 168,
  ) => {
    if (!open) {
      setPos(() => null)
      return
    }
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    // 菜单宽 + 8 间距;左边沿 = trigger 左沿 - 菜单宽 - 间距。顶对齐 trigger 顶沿。
    const left = Math.max(8, rect.left - menuWidth - 8)
    const top = rect.top
    setPos((prev) => (prev && prev.left === left && prev.top === top ? prev : { left, top }))
  }
  useLayoutEffect(() => {
    if (!exportMenuOpen) {
      setMenuPos(null)
      return
    }
    const measure = () => measureMenu(exportMenuOpen, exportTriggerRef, setMenuPos)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportMenuOpen])
  useLayoutEffect(() => {
    if (!wfMenuOpen) {
      setWfMenuPos(null)
      return
    }
    const measure = () => measureMenu(wfMenuOpen, wfTriggerRef, setWfMenuPos)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wfMenuOpen])
  return (
    <nav className="cv-rail" aria-label={t('canvas.sideRail')}>
      <RailButton label={t('canvas.undo')} short={t('canvas.rail.undo')} onClick={onUndo} disabled={!adapterReady || !canUndo} icon="undo" />
      <RailButton label={t('canvas.redo')} short={t('canvas.rail.redo')} onClick={onRedo} disabled={!adapterReady || !canRedo} icon="redo" />
      <span className="cv-rail__sep" aria-hidden="true" />
      <RailButton label={t('canvas.newTitle')} short={t('canvas.rail.new')} onClick={onNewCanvas} icon="new-canvas" />
      <RailButton label={t('canvas.renameTitle')} short={t('canvas.rail.rename')} onClick={onRename} disabled={!canRename} icon="rename" />
      <RailButton label={t('canvas.deleteTitle')} short={t('canvas.rail.delete')} onClick={onDelete} disabled={!canDelete} icon="delete" />
      <RailButton label={t('canvas.template.saveAs')} short={t('canvas.rail.template')} disabled={!adapterReady} onClick={onSaveAsTemplate} icon="template" />
      <RailButton label={t('canvas.template.import')} short={t('canvas.rail.importTpl')} onClick={onImportTemplate} icon="import" />
      <span className="cv-rail__sep" aria-hidden="true" />
      {aiEnabled && (
        <>
          <RailButton label={t('canvas.aiLayout')} short={t('canvas.rail.aiLayout')} disabled={!adapterReady || aiBusy !== null} busy={aiBusy === 'layout'} ariaBusy={aiBusy === 'layout'} busyTitle={t('canvas.aiRunning')} onClick={onAILayout} icon="ai" />
          {/* AI 工作流 popover:聚类重排 / 生成关系 / 总结大纲。3 项分别是现有
              handler 的分组入口。菜单项 disabled 同各自前置(cluster/relate 走
              现有 handler,内含选中/卡片数门控;outline 走 summarizeOutline)。 */}
          <div className="cv-rail__group">
            <RailButton label={t('ai.workflow.title')} short={t('canvas.rail.aiWorkflow')} disabled={!adapterReady || aiBusy !== null} busy={aiBusy === 'outline'} ariaBusy={aiBusy === 'outline'} busyTitle={t('canvas.aiRunning')} onClick={() => setWfMenuOpen((o) => !o)} pressed={wfMenuOpen} icon="workflow" buttonRef={wfTriggerRef} />
          </div>
        </>
      )}
      {showAutoRelate && (
        <RailButton label={t('canvas.autoRelate')} short={t('canvas.rail.autoRelate')} onClick={onAutoRelate} icon="relation" />
      )}
      <RailButton label={t('canvas.frameSelection')} short={t('canvas.rail.frame')} disabled={!adapterReady} onClick={onFrame} icon="frame" />
      {aiEnabled && <span className="cv-rail__sep" aria-hidden="true" />}
      <RailButton label={t('canvas.outline')} short={t('canvas.rail.outline')} disabled={!adapterReady} onClick={onOutline} pressed={outlineOpen} icon="outline" />
      <RailButton label={t('canvas.companion')} short={t('canvas.rail.companion')} disabled={!adapterReady} onClick={onCompanion} pressed={companionOpen} icon="outline" />
      <RailButton label={t('canvas.overview')} short={t('canvas.rail.overview')} disabled={!adapterReady} onClick={onOverview} icon="overview" />
      {/* 转义(DSL)是核心卖点,提一级独立按钮(双向:编辑画布文本/导出 DSL)。
          导出菜单里保留同名项(作为「导出 DSL」入口),两条路都通 DslDialog。 */}
      <RailButton label={t('canvas.dslTitle')} short={t('canvas.rail.dsl')} disabled={!adapterReady} onClick={onDsl} icon="dsl" />
      {/* 导出:一个按钮 + 二级拓展(图片/Markdown/DSL)。Diff(版本对比)不是导出,留独立按钮。 */}
      <div className="cv-rail__group">
        <RailButton label={t('canvas.export')} short={t('canvas.rail.export')} disabled={!adapterReady} onClick={() => setExportMenuOpen((o) => !o)} pressed={exportMenuOpen} icon="export" buttonRef={exportTriggerRef} />
      </div>
      <RailButton label={t('canvas.diffTitle')} short={t('canvas.rail.diff')} disabled={!adapterReady} onClick={onDiff} icon="diff" />
      <span className="cv-rail__sep" aria-hidden="true" />
      <RailButton label={t('canvas.shortcuts')} short={t('canvas.rail.shortcuts')} onClick={onShortcuts} icon="shortcuts" />
      {exportMenuOpen && typeof document !== 'undefined' && createPortal(
        <>
          <div className="cv-rail__menu-backdrop" onClick={() => setExportMenuOpen(false)} aria-hidden="true" />
          <div
            className="cv-rail__menu"
            role="menu"
            aria-label={t('canvas.export')}
            style={menuPos ? { left: `${menuPos.left}px`, top: `${menuPos.top}px` } : { visibility: 'hidden' }}
          >
            <button type="button" role="menuitem" className="cv-rail__menu-item" disabled={!adapterReady} onClick={() => { setExportMenuOpen(false); onExport() }}>{t('canvas.exportImage')}</button>
            <button type="button" role="menuitem" className="cv-rail__menu-item" disabled={!adapterReady} onClick={() => { setExportMenuOpen(false); onMarkdown() }}>{t('canvas.markdown')}</button>
            <button type="button" role="menuitem" className="cv-rail__menu-item" disabled={!adapterReady} onClick={() => { setExportMenuOpen(false); onDsl() }}>{t('canvas.dslTitle')}</button>
          </div>
        </>,
        document.body,
      )}
      {wfMenuOpen && typeof document !== 'undefined' && createPortal(
        <>
          <div className="cv-rail__menu-backdrop" onClick={() => setWfMenuOpen(false)} aria-hidden="true" />
          <div
            className="cv-rail__menu"
            role="menu"
            aria-label={t('ai.workflow.title')}
            style={wfMenuPos ? { left: `${wfMenuPos.left}px`, top: `${wfMenuPos.top}px` } : { visibility: 'hidden' }}
          >
            {/* 聚类重排 / 生成关系 复用现有 handler(内含选中/卡片数门控);
                总结大纲走 summarizeOutline(AI 未就绪时 handler 弹 AiSetupCard)。 */}
            <button type="button" role="menuitem" className="cv-rail__menu-item" disabled={aiBusy !== null} onClick={() => { setWfMenuOpen(false); onAICluster() }}>{t('ai.workflow.cluster')}</button>
            <button type="button" role="menuitem" className="cv-rail__menu-item" disabled={aiBusy !== null} onClick={() => { setWfMenuOpen(false); onAutoRelate() }}>{t('ai.workflow.relate')}</button>
            <button type="button" role="menuitem" className="cv-rail__menu-item" disabled={aiBusy !== null} onClick={() => { setWfMenuOpen(false); onAIOutline() }}>{t('ai.workflow.outline')}</button>
          </div>
        </>,
        document.body,
      )}
    </nav>
  )
}

function RailButton({ label, short, icon, onClick, disabled, busy, busyTitle, ariaBusy, pressed, buttonRef }: { label: string; short?: string; icon: CanvasIconName; onClick: () => void; disabled?: boolean; busy?: boolean; busyTitle?: string; ariaBusy?: boolean; pressed?: boolean; buttonRef?: React.RefObject<HTMLButtonElement | null> }) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`cv-rail__btn${pressed ? ' cv-rail__btn--pressed' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={busy && busyTitle ? busyTitle : label}
      aria-label={label}
      aria-busy={ariaBusy ? true : undefined}
      aria-pressed={pressed ? true : undefined}
    >
      <span className="cv-rail__btn-icon" aria-hidden="true">{busy ? <CanvasBusyIcon /> : <CanvasIcon name={icon} />}</span>
      {short ? <span className="cv-rail__btn-label">{short}</span> : null}
    </button>
  )
}

const styles = `
.page { height: calc(100vh - var(--app-menu-height)); display: flex; flex-direction: column; background: var(--color-white); color: var(--color-black); }
/* 焦点模式:画布占满整个 page 高度(Toolbar 隐藏了),cv-host flex:1 撑开。 */
.page--focus { }
.page--focus .cv-host { flex: 1; }
.cv-focus-exit {
  position: absolute; top: var(--space-2); right: var(--space-2); z-index: 40;
  font-family: var(--font-mono); font-size: var(--font-size-xs);
  letter-spacing: 0.08em; text-transform: uppercase;
  padding: var(--space-1) var(--space-2);
  background: var(--color-white); color: var(--color-black);
  border: var(--border-hairline); border-radius: var(--radius-sm);
  cursor: pointer; opacity: 0.85;
}
.cv-focus-exit:hover { opacity: 1; border-color: var(--color-black); }
.cv-focus-exit:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
/* 根据当前工具显示不同光标 — 让用户知道正在用 select/freedraw/eraser/text/connect 哪种模式 */
.cv-host { position: relative; flex: 1; min-height: 0; }
/* 橡皮光标:SVG 圆圈(28px),让用户看清擦除范围。其他工具保持 crosshair/text/cell。 */
.cv-host--eraser canvas {
  cursor: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'><circle cx='14' cy='14' r='11' fill='none' stroke='black' stroke-width='2'/><circle cx='14' cy='14' r='11' fill='none' stroke='white' stroke-width='1' stroke-dasharray='2,2'/></svg>") 14 14, crosshair;
}
.cv-host--freedraw canvas { cursor: crosshair; }
.cv-host--text canvas { cursor: text; }
.cv-host--connect canvas { cursor: cell; }
.cv-empty { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: var(--space-2); pointer-events: none; user-select: none; padding-bottom: 80px; }
.cv-empty__motif { margin-bottom: var(--space-2); }
/* CTA link re-enables pointer events on itself only (parent overlay is
   pointer-events:none) so the user can act on the empty state. */
.cv-empty__cta {
  pointer-events: auto;
  margin-top: var(--space-1);
  padding: var(--space-1) var(--space-3);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  text-decoration: none;
  color: var(--color-white);
  background: var(--color-red);
  border: var(--border-hairline);
  border-color: var(--color-black);
  border-radius: var(--radius-sm);
}
.cv-empty__cta:hover { box-shadow: 2px 2px 0 0 var(--color-black); }
.cv-empty__cta:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
.tb-divider { width: 1px; height: 24px; background: var(--color-gray-soft); margin: 0 var(--space-2); flex: 0 0 auto; }
/* ── 工具按钮(选/画/擦/文/连)— Bauhaus 设计语言统一 ──
   图标+中文标签两行,44×40px 目标区;激活态黄底黑边(Bauhaus 强调色,表示「在用」);
   hover 浅灰;按下黄底+缩放触感。透明边框占位防 hover/active 布局跳动。 */
.tb-tool {
  display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
  height: 40px; min-width: 44px; padding: 2px var(--space-2);
  font-family: var(--font-mono); font-size: var(--font-size-xs);
  background: var(--color-white); color: var(--color-black);
  border: 2px solid var(--color-gray-soft); border-radius: var(--radius-sm); cursor: pointer;
  transition: background 80ms ease-out, color 80ms ease-out, border-color 80ms ease-out, transform 60ms ease-out;
}
.tb-tool__icon { font-size: var(--font-size-base); line-height: 1; }
/* 图标容器现在装 lucide SVG(非字符),让 SVG 跟随容器字号 + 居中 */
.tb-tool__icon svg, .tb-align__icon svg, .tb-btn__icon svg, .cv-rail__btn-icon svg
  { width: 1em; height: 1em; display: block; }
/* busy 旋转(AI 运行中),尊重 reduced-motion */
.cv-rail__busy-spin { animation: cys-spin 1s linear infinite; }
@keyframes cys-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .cv-rail__busy-spin { animation: none; } }
.tb-tool__label { font-size: var(--font-size-xs); letter-spacing: 0; color: var(--color-gray); line-height: 1; }
.tb-tool--active { background: var(--color-yellow); border-color: var(--color-black); color: var(--color-black); }
.tb-tool--active .tb-tool__label { color: var(--color-black); }
/* 橡皮子模式:比主工具略小(36×34),与主工具激活态同黄底黑边,视觉连贯。 */
.tb-tool--sub { height: 36px; min-width: 38px; padding: 2px var(--space-0.5); }
.tb-tool--sub .tb-tool__icon { font-size: var(--font-size-sm); }
.tb-tool--sub .tb-tool__label { font-size: var(--font-size-xs); }
.tb-tool:hover:not(:disabled):not(.tb-tool--active) { background: var(--color-gray-soft); border-color: var(--color-gray); }
.tb-tool:active:not(:disabled) { transform: scale(0.94); }
.tb-tool:disabled { opacity: 0.5; cursor: not-allowed; }
.tb-tool:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
.tb-snap { display: inline-flex; align-items: center; justify-content: center; height: 32px; padding: 0 var(--space-3); font-family: var(--font-mono); font-size: var(--font-size-xs); letter-spacing: 0.16em; text-transform: uppercase; background: var(--color-white); color: var(--color-black); border: var(--border-hairline); border-radius: var(--radius-sm); cursor: pointer; }
.tb-snap--snap { background: var(--color-black); color: var(--color-white); }
.tb-snap--free { background: var(--color-white); color: var(--color-black); }
/* P1 #6: 5 个工具按钮(↖✎⌫T⇄)补 hover,与 .tb-icon-btn 对齐;排除激活态
   (--snap 黑底)与 SnapToggle 的 --snap/--free 文字按钮,避免抢激活态视觉。 */
.tb-snap:hover:not(:disabled):not(.tb-snap--snap):not(.tb-snap--free):not(.tb-snap--toggle) { background: var(--color-gray-soft); }
.tb-snap:active:not(:disabled) { transform: scale(0.94); }
.tb-snap:disabled { opacity: 0.5; cursor: not-allowed; }
.tb-snap:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
/* SnapToggle 默认显示文字 label,glyph 隐藏;≤900px 反转(见响应式断点)。 */
.tb-snap__glyph { display: none; }
.tb-zoom { display: inline-flex; align-items: center; gap: 0; }
.tb-icon-btn { display: inline-flex; align-items: center; justify-content: center; height: 32px; min-width: 32px; padding: 0 var(--space-2); font-family: var(--font-mono); font-size: var(--font-size-xs); letter-spacing: 0.12em; text-transform: uppercase; background: transparent; color: var(--color-black); border: var(--border-hairline); border-radius: var(--radius-sm); cursor: pointer; }
.tb-icon-btn--fit { padding: 0 var(--space-3); }
.tb-icon-btn:hover { background: var(--color-black); color: var(--color-white); }
.tb-icon-btn:active:not(:disabled) { transform: scale(0.92); }
.tb-icon-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.tb-icon-btn:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
/* 对齐工具条:选中≥2 卡时出现。复用 .tb-icon-btn 视觉;组容器内联排布。 */
.tb-align { display: inline-flex; align-items: center; gap: 0; }
.tb-align__btn { min-width: 34px; padding: 0 var(--space-1); }
.tb-align__icon { font-size: var(--font-size-base); line-height: 1; letter-spacing: 0; }
.cselect {
  height: 32px; padding: 0 var(--space-6) 0 var(--space-2);
  background: var(--color-white); color: var(--color-black);
  font-family: var(--font-mono); font-size: var(--font-size-sm);
  border: var(--border-hairline); border-radius: var(--radius-sm);
  cursor: pointer; min-width: 200px;
  appearance: none; -webkit-appearance: none;
  background-image: linear-gradient(45deg, transparent 50%, var(--color-gray) 50%),
    linear-gradient(135deg, var(--color-gray) 50%, transparent 50%);
  background-position: calc(100% - 14px) calc(50% - 2px), calc(100% - 10px) calc(50% - 2px);
  background-size: 4px 4px, 4px 4px; background-repeat: no-repeat;
}
:root[data-theme='dark'] .cselect { background-color: var(--color-black); color: var(--color-white); border-color: var(--color-white); }
.cselect:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
.cselect-edit { height: 32px; width: 32px; background: transparent; color: var(--color-gray); border: 0; cursor: pointer; font-size: var(--font-size-base); }
.cselect-edit:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
.crename { height: 32px; padding: 0 var(--space-2); background: var(--color-white); color: var(--color-black); font-family: var(--font-mono); font-size: var(--font-size-sm); border: var(--border-hairline); border-radius: var(--radius-sm); outline: none; min-width: 200px; }
.cinput { display: block; width: 100%; height: 32px; margin-top: var(--space-2); padding: 0 var(--space-2); background: var(--color-white); color: var(--color-black); font-family: var(--font-mono); font-size: var(--font-size-base); border: var(--border-hairline); border-radius: var(--radius-sm); outline: none; }
.confirm__body { margin: 0; color: var(--color-black-soft); line-height: 1.5; }
.confirm__body + .confirm__body { margin-top: var(--space-1); }
.confirm__type {
  display: block; width: 100%; margin-top: var(--space-2);
  padding: var(--space-1) var(--space-2);
  font-family: var(--font-mono); font-size: var(--font-size-sm);
  border: var(--border-hairline); border-radius: var(--radius-sm);
  background: var(--color-white); color: var(--color-black); outline: none;
}
.confirm__type:focus { border-color: var(--color-red); }
.confirm__actions { display: flex; gap: var(--space-2); justify-content: flex-end; margin-top: var(--space-2); }
.cv-rail {
  /* z-index scale (canvas chrome):
     0  canvas content
     10 minimap
     20 side rail (this)  — above minimap so rail buttons stay clickable
     30 floating panels (relation/freedraw) — above rail
     100 modals / toasts  — above all canvas chrome */
  position: absolute; top: calc(var(--app-menu-height) + 3px); right: var(--space-1); z-index: 20;
  /* rail 从 top:72 往下延伸,要给右下角 minimap(高约 155px:120 canvas + 标题栏 + 边框)
     让出完整空间。rail 底部 = 72 + max-height ≤ 容器高 - 155 → max-height ≤ 容器高 - 227。
     取 calc(100% - 230px) 留余量,确保 rail 底按钮永不压在 minimap 上。内部仍可滚。 */
  max-height: calc(100% - 230px); overflow-y: auto;
  display: flex; flex-direction: column; align-items: center; gap: var(--space-1);
  padding: var(--space-1);
  background: var(--color-white);
  border: var(--border-hairline);
  border-radius: var(--radius-sm);
  box-shadow: 2px 2px 0 0 var(--color-black);
  /* P2: 底部淡出蒙版 — rail 高时可滚但无视觉提示,加一条 ~18px 渐隐让用户读出
     「下方还有」。按钮 44px(窄窗 40px),蒙版远矮于按钮,不会切掉 hover 态。 */
  mask-image: linear-gradient(to bottom, black 0, black calc(100% - 18px), transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, black 0, black calc(100% - 18px), transparent 100%);
}
.cv-rail__btn {
  width: 60px; min-height: 44px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  padding: var(--space-1) 0;
  background: var(--color-white); color: var(--color-black);
  /* 透明边框占位,hover/pressed 切换边框色时布局不跳动 */
  border: 2px solid transparent; border-radius: var(--radius-sm); cursor: pointer;
  transition: background 80ms ease-out, color 80ms ease-out, border-color 80ms ease-out, transform 60ms ease-out;
}
/* 设计语言:hover=浅灰底(轻提示),active(按下)=黄底黑边+缩放(触感),
   pressed(持续选中)=黄底黑边(Bauhaus 黄黑强调色,表示「这个开着/在用」)。 */
.cv-rail__btn:hover:not(:disabled) { background: var(--color-gray-soft); }
.cv-rail__btn:active:not(:disabled) { background: var(--color-yellow); border-color: var(--color-black); transform: scale(0.96); }
.cv-rail__btn--pressed { background: var(--color-yellow); border-color: var(--color-black); color: var(--color-black); }
.cv-rail__btn:disabled { opacity: 0.5; cursor: not-allowed; }
.cv-rail__btn:focus-visible { outline: 2px solid var(--color-red); outline-offset: -2px; }
.cv-rail__btn-icon { font-family: var(--font-mono); font-size: var(--font-size-base); line-height: 1; }
.cv-rail__btn-label { font-family: var(--font-body); font-size: var(--font-size-xs); line-height: 1; color: inherit; letter-spacing: 0; }
.cv-rail__sep { width: 44px; height: 1px; background: var(--color-gray-soft); margin: var(--space-1) 0; }
.cv-rail__group { position: relative; display: flex; flex-direction: column; align-items: center; }
/* P0 #1: 导出二级菜单经 portal 渲染到 document.body,逃离 .cv-rail 的 overflow
   裁剪。定位由 JS 写成 inline style(fixed + trigger 的 getBoundingClientRect),
   这里只给视觉样式;backdrop 覆盖整屏点外关闭。 */
.cv-rail__menu-backdrop { position: fixed; inset: 0; z-index: 25; cursor: default; }
.cv-rail__menu {
  position: fixed; z-index: 26;
  min-width: 168px; padding: var(--space-1);
  background: var(--color-white); border: 2px solid var(--color-black); border-radius: var(--radius-sm);
  box-shadow: 4px 4px 0 0 var(--color-black);
  display: flex; flex-direction: column; gap: 2px;
}
.cv-rail__menu-item {
  text-align: left; padding: var(--space-1) var(--space-2);
  background: transparent; border: 0; border-radius: var(--radius-sm);
  font-family: var(--font-body); font-size: var(--font-size-sm); color: var(--color-black);
  cursor: pointer; white-space: nowrap;
}
.cv-rail__menu-item:hover:not(:disabled) { background: var(--color-yellow); }
.cv-rail__menu-item:disabled { opacity: 0.5; cursor: not-allowed; }
.cv-rail__menu-item:focus-visible { outline: 2px solid var(--color-red); outline-offset: 1px; }
.cv-ctx-backdrop { position: fixed; inset: 0; z-index: 99; cursor: default; }
.cv-ctx-menu { position: fixed; z-index: 100; }
.cv-ctx-input { position: fixed; z-index: 100; width: 200px; }

/* ── 整理范式(Batch 6):顶栏「整理」popover ───────────────────────
   复用 cv-rail__menu 的包豪斯 chrome(2px 黑边 + 4px 硬阴影),宽 220,竖排三段。
   策略/方向用 2×2 分段按钮(active=黄),间距用 range 滑杆 + 数字读数,底应用按钮。
   z-index 与 cv-rail__menu 同层(26,backdrop 25)。 */
.cv-organize__panel { min-width: 220px; padding: var(--space-2); gap: var(--space-2); }
.cv-organize__section { display: flex; flex-direction: column; gap: var(--space-1); }
.cv-organize__label {
  font-family: var(--font-mono); font-size: var(--font-size-xs);
  color: var(--color-black-soft); letter-spacing: 0.04em; text-transform: uppercase;
  display: flex; align-items: center; justify-content: space-between;
}
.cv-organize__gap-val { font-family: var(--font-mono); color: var(--color-black); text-transform: none; }
.cv-organize__grid { display: grid; gap: 2px; }
.cv-organize__grid--2x2 { grid-template-columns: 1fr 1fr; }
.cv-organize__seg {
  padding: var(--space-1) var(--space-1); min-height: 32px;
  background: var(--color-white); border: 2px solid var(--color-black); border-radius: var(--radius-sm);
  font-family: var(--font-body); font-size: var(--font-size-xs); color: var(--color-black);
  cursor: pointer; text-align: center; line-height: 1;
}
.cv-organize__seg:hover:not(.cv-organize__seg--active) { background: var(--color-gray-soft); }
.cv-organize__seg--active { background: var(--color-yellow); border-color: var(--color-black); }
.cv-organize__seg:focus-visible { outline: 2px solid var(--color-red); outline-offset: 1px; }
.cv-organize__range {
  width: 100%; height: 4px; background: var(--color-black); border-radius: 2px;
  appearance: none; -webkit-appearance: none; cursor: pointer;
}
.cv-organize__range::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 16px; height: 16px; background: var(--color-yellow);
  border: 2px solid var(--color-black); border-radius: var(--radius-sm); cursor: pointer;
}
.cv-organize__range::-moz-range-thumb {
  width: 16px; height: 16px; background: var(--color-yellow);
  border: 2px solid var(--color-black); border-radius: var(--radius-sm); cursor: pointer;
}
.cv-organize__range:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
.cv-organize__apply {
  margin-top: 2px; padding: var(--space-1) var(--space-2); min-height: 36px;
  background: var(--color-black); color: var(--color-white);
  border: 2px solid var(--color-black); border-radius: var(--radius-sm);
  font-family: var(--font-body); font-size: var(--font-size-sm); font-weight: 600;
  cursor: pointer; line-height: 1;
}
.cv-organize__apply:hover:not(:disabled) { background: var(--color-red); border-color: var(--color-red); }
.cv-organize__apply:disabled { opacity: 0.5; cursor: not-allowed; }
.cv-organize__apply:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }

/* ── P1 响应式断点 ───────────────────────────────────────────────
   画布页此前零 @media;窄 Tauri 窗口下顶栏静默溢出、rail 占掉画布宽度。
   两条断点:
   - ≤960px:rail 收成纯图标,按钮缩到 40×40,腾回画布宽度(图标靠 tooltip 仍可辨)。
   - ≤900px:顶栏 SnapToggle 与 ZoomGroup 的 Fit 文字收掉,800px 顶栏不再横向滚。
   ─────────────────────────────────────────────────────────────── */
@media (max-width: 960px) {
  .cv-rail { padding: 4px; }
  .cv-rail__btn { width: 40px; min-height: 40px; gap: 0; padding: 4px 0; }
  .cv-rail__btn-label { display: none; }
  .cv-rail__sep { width: 32px; margin: 4px 0; }
}
@media (max-width: 900px) {
  /* SnapToggle:文字隐藏、改符号按钮,保留 aria-pressed + title。 */
  .tb-snap--toggle .tb-snap__label { display: none; }
  .tb-snap--toggle { min-width: 32px; padding: 0 var(--space-2); }
  .tb-snap--toggle .tb-snap__glyph { display: inline; }
  /* ZoomGroup Fit:文字隐藏,留按钮(仍 + / − 同列)。 */
  .tb-icon-btn--fit .tb-icon-btn__label { display: none; }
  .tb-icon-btn--fit { padding: 0 var(--space-2); }
}
/* prefers-reduced-motion:禁用所有按钮按压缩放 + transition,尊重前庭敏感用户系统偏好
   (codebase 其他处 page-loading/tooltip 已降级,画布页这一大块交互触感此前遗漏)。 */
@media (prefers-reduced-motion: reduce) {
  .tb-tool, .tb-snap, .tb-icon-btn, .cv-rail__btn { transition: none !important; }
  .tb-tool:active, .tb-snap:active, .tb-icon-btn:active, .cv-rail__btn:active { transform: none !important; }
}
`
