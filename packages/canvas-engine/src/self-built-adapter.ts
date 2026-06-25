
/**
 * SelfBuiltAdapter — CanvasHost 的自研 Canvas 2D 实现(Phase 1)。
 *
 * 和 TldrawAdapter 是同一接口(CanvasHost)的两个实现;canvas-binding 只依赖
 * CanvasHost,所以卡片加载/回写/同步逻辑完全复用。本文件先实现数据 + 事件语义
 * (与 InMemoryCanvasHost 一致,过同一套契约测试);渲染/交互在后续 Task 加。
 *
 * 零 tldraw import。jsdom 下 ctx===null,渲染相关调用静默跳过(host 语义照常)。
 */
import type {
  CanvasElement,
  CanvasHost,
  CanvasView,
  UserChange,
} from './canvas-host'
import { sortByLayer, sanitizeView, ZOOM_MIN, ZOOM_MAX } from './canvas-host'
import { renderElements, drawSelectionOutlines, drawMarquee, domTokenResolver, type CardInfo, type TokenResolver } from './self-built-render'
import { hitTest, screenToPage } from './self-built-hittest'
import { commitFreedraw, translateFreedraw, scaleFreedrawToBox } from './self-built-freedraw'
import { handleAtPoint, resizeGeometry, type Handle } from './self-built-resize'
import { marqueeSelect } from './self-built-marquee'
import { arrowPreviewEndpoints, arrowEndpoints, arrowRoute } from './self-built-arrow'
import { arrowKeyDelta, selectAllIds, parseKeyboardAction } from './self-built-keyboard'
import { intersectsBounds, viewportBounds, normalizeBox } from './bounds'

export class SelfBuiltAdapter implements CanvasHost {
  private elements = new Map<string, CanvasElement>()
  private view: CanvasView = { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }
  private userListeners = new Set<(c: UserChange) => void>()
  private viewListeners = new Set<(v: CanvasView) => void>()
  private selectionListeners = new Set<(ids: string[]) => void>()
  protected echoing = true
  protected ctx: CanvasRenderingContext2D | null
  private getCardInfo: (id: string) => CardInfo | null
  private tokenResolver: TokenResolver
  private rafId: number | null = null
  private panning: {
    startSx: number
    startSy: number
    fromPanX: number
    fromPanY: number
  } | null = null
  private pointerHandlers: {
    down: (e: PointerEvent) => void
    move: (e: PointerEvent) => void
    up: (e: PointerEvent) => void
  } | null = null
  private wheelHandler: ((e: WheelEvent) => void) | null = null
  private activeTool: 'select' | 'freedraw' | 'text' | 'connect' = 'select'
  private currentStroke: { points: [number, number][] } | null = null
  private selectedIds = new Set<string>()
  private resizing: { id: string; handle: Handle; start: { x: number; y: number; w: number; h: number } } | null = null
  private dragGroup: { ids: string[]; offsets: Map<string, { x: number; y: number }> } | null = null
  private marquee: { startX: number; startY: number; curX: number; curY: number } | null = null
  private connecting: { fromId: string; pointer: { x: number; y: number } } | null = null
  /** 拖动箭头弯曲手柄(设 curve 控制点)。null=未在拖。 */
  private curveDragging: { id: string } | null = null
  /** 拖动折线箭头折点手柄(改 elbow[index] 位置)。null=未在拖。 */
  private elbowDragging: { id: string; index: number } | null = null
  private keyHandler: ((e: KeyboardEvent) => void) | null = null
  private undoStack: CanvasElement[][] = []
  private redoStack: CanvasElement[][] = []
  private static readonly UNDO_LIMIT = 50
  /** coalescing=true 期间,echo 的 upsert/remove 不推快照(连续操作合并为 1 undo 步)。
   *  drag / resize 开始时置 true(批前已 pushUndo 一次),onUp 置 false。
   *  batch() 也用此门控实现分组。 */
  private coalescing = false

  constructor(
    private canvas: HTMLCanvasElement,
    opts?: { getCardInfo?: (id: string) => CardInfo | null; tokenResolver?: TokenResolver },
  ) {
    this.ctx = canvas.getContext('2d')
    this.getCardInfo = opts?.getCardInfo ?? (() => null)
    this.tokenResolver = opts?.tokenResolver ?? domTokenResolver
    this.attachPointer()
    this.attachKeyboard()
  }

  protected scheduleRender(): void {
    if (!this.ctx) return // jsdom / 无 ctx — 跳过(host 语义照常)
    if (this.rafId !== null) return
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null
      this.renderNow()
    })
  }

  protected renderNow(): void {
    const ctx = this.ctx
    if (!ctx) return
    const w = this.canvas.clientWidth || 800
    const h = this.canvas.clientHeight || 600
    const dpr = window.devicePixelRatio || 1
    if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
      this.canvas.width = w * dpr
      this.canvas.height = h * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0) // 抵消 DPR,renderElements 用 CSS px
    const preview =
      this.currentStroke && this.currentStroke.points.length > 0
        ? [commitFreedraw('__preview', this.currentStroke.points)]
        : []
    // 视锥剔除(viewport culling):只渲染与可见页矩形相交的元素。大画布(5k 元素)
    // zoom/pan 后多数离屏,这里一次 filter 省掉它们进 drawElement 的开销(文本测量/路径)。
    //
    // 例外:关系箭头(arrow 且 from/to 非空)的 bbox w=h=0——几何来自端点引用,不是 bbox。
    // 零尺寸 box 永不与任何视口 AABB 相交 → 会被误剔除。但其两端点可能在屏上,故这类
    // arrow 无条件保留(不过滤)。自由箭头(无 from/to、bbox 非零)走正常剔除。
    // freedraw 预览(__preview,用户正画的)也无条件保留。
    const vp = viewportBounds(this.view, w, h)
    const all = this.getElements()
    const visible = all.filter(
      (el) => (el.kind === 'arrow' && el.from && el.to) || intersectsBounds(normalizeBox(el), vp),
    )
    renderElements(
      ctx,
      [...visible, ...preview],
      this.view,
      w,
      h,
      this.getCardInfo,
      this.tokenResolver('--color-canvas', '#f8fafc'),
      this.tokenResolver,
    )
    drawSelectionOutlines(ctx, this.getSelectedIds(), this.getElements(), this.view, this.tokenResolver)
    if (this.marquee) {
      drawMarquee(ctx, {
        x: Math.min(this.marquee.startX, this.marquee.curX),
        y: Math.min(this.marquee.startY, this.marquee.curY),
        w: Math.abs(this.marquee.curX - this.marquee.startX),
        h: Math.abs(this.marquee.curY - this.marquee.startY),
      }, this.view, this.tokenResolver)
    }
    if (this.connecting) {
      const fromEl = this.getElement(this.connecting.fromId)
      if (fromEl) {
        const { from, to } = arrowPreviewEndpoints(fromEl, this.connecting.pointer)
        // 预览只画线(不带 V 箭头头,简化;真 arrow commit 后有箭头头)。颜色走 token。
        ctx.save()
        ctx.translate(this.view.panX, this.view.panY)
        ctx.scale(this.view.zoom, this.view.zoom)
        ctx.strokeStyle = this.tokenResolver('--color-blue', '#1d4ed8')
        ctx.lineWidth = 2 / this.view.zoom
        ctx.beginPath()
        ctx.moveTo(from.x, from.y)
        ctx.lineTo(to.x, to.y)
        ctx.stroke()
        ctx.restore()
      }
    }
  }

  getElements(): CanvasElement[] {
    // 确定性 z 序:按 KIND_LAYER 稳定排序(见 canvas-host)。渲染 / hitTest / SVG /
    // 快照 / DSL / .cystift 全读这个顺序,五视图一致,reload 视觉不变。
    return sortByLayer([...this.elements.values()])
  }

  getElement(id: string): CanvasElement | undefined {
    return this.elements.get(id)
  }

  upsert(el: CanvasElement): void {
    if (this.echoing && !this.coalescing) this.pushUndo() // 变更前快照(供 undo 恢复到本次 upsert 前);coalescing 期间不推(由 drag/resize/batch 批前推一次)
    this.elements.set(el.id, el)
    if (this.echoing) this.emitUser({ updated: [el], removed: [] })
    this.scheduleRender()
  }

  remove(id: string): void {
    if (!this.elements.has(id)) return
    if (this.echoing && !this.coalescing) this.pushUndo() // 变更前快照;coalescing 期间不推
    this.elements.delete(id)
    // 级联删:所有 from===id 或 to===id 的关系箭头一并删(drawio/tldraw 惯例)。
    // 关系箭头 bbox w=h=0、端点靠 from/to 引用;删端点后箭头变悬空 → 从画布消失但
    // 残留 this.elements(占 id、进 SVG/DSL/快照、reload 仍悬空)= 幽灵元素。
    // 级联删发生在同一 remove 调用内,与 id 共享上面那一次 pushUndo → 1 步 undo,
    // undo 能把 card + 悬空 arrow 一起恢复。自由箭头(无 from/to,bbox 非零)不引用 id → 不受影响。
    const cascade: string[] = []
    for (const [aid, el] of this.elements) {
      if (el.kind === 'arrow' && (el.from === id || el.to === id)) {
        cascade.push(aid)
        this.elements.delete(aid)
      }
    }
    if (this.echoing) this.emitUser({ updated: [], removed: [id, ...cascade] })
    this.scheduleRender()
  }

  batch(fn: () => void): void {
    // undo 分组:批前推一次快照(批内所有变更合并为 1 undo 步)。嵌套 batch 不重复推。
    const wasCoalescing = this.coalescing
    if (!wasCoalescing) this.pushUndo()
    this.coalescing = true
    try {
      fn()
    } finally {
      this.coalescing = wasCoalescing
    }
  }

  applyWithoutEcho(fn: () => void): void {
    const prev = this.echoing
    this.echoing = false
    try {
      fn()
    } finally {
      this.echoing = prev
    }
  }

  onUserChange(cb: (c: UserChange) => void): () => void {
    this.userListeners.add(cb)
    return () => {
      this.userListeners.delete(cb)
    }
  }

  /** 订阅视图(pan/zoom/grid)变更。返回取消订阅(同 onUserChange 模式)。 */
  onViewChange(cb: (v: CanvasView) => void): () => void {
    this.viewListeners.add(cb)
    return () => {
      this.viewListeners.delete(cb)
    }
  }

  /** 切换工具(渲染器自身方法,不上 CanvasHost 接口)。 */
  setTool(t: 'select' | 'freedraw' | 'text' | 'connect'): void {
    this.activeTool = t
    // R1.5:切工具时清掉一切进行中的交互状态,否则 connect/drag 中的 connecting/dragGroup
    // 残留 → 切回 select 后一个无谓的 pointermove 会用陈旧状态造幽灵 arrow / 移动元素。
    // 之前只清 currentStroke,不够。
    this.clearInteractionState()
    this.scheduleRender()
  }

  getTool(): 'select' | 'freedraw' | 'text' | 'connect' {
    return this.activeTool
  }

  /**
   * 双击箭头交互(选中箭头 + 双击点命中该箭头时):
   *  - route=elbow 且折点 < 2:在双击点加折点(按沿 from→to 投影排序,保持路径顺序)。
   *  - 否则(curve/straight,或 elbow 已满):重置 route=straight(保留 curve/elbow 数据)。
   * 非 arrow / 未命中 / 多选 → false(no-op)。单步 undo。命中用 hitTest(线段/曲线/折线)。
   */
  doubleClickArrowAt(p: { x: number; y: number }): boolean {
    if (this.selectedIds.size !== 1) return false
    const selId = [...this.selectedIds][0]!
    const el = this.getElement(selId)
    if (!el || el.kind !== 'arrow') return false
    if (hitTest(this.getElements(), p.x, p.y, this.view.zoom) !== selId) return false
    const { from, to } = arrowEndpoints(el, this.getElements())
    if (!from || !to) return false
    const route = arrowRoute(el)
    this.pushUndo()
    this.coalescing = true
    try {
      if (route === 'elbow' && (!el.elbow || el.elbow.length < 2)) {
        // 加折点:按沿 from→to 方向的投影排序(保持路径顺序,避免交叉)。
        const dir = { x: to.x - from.x, y: to.y - from.y }
        const len2 = dir.x * dir.x + dir.y * dir.y || 1
        const proj = (pt: { x: number; y: number }) =>
          (pt.x - from.x) * dir.x + (pt.y - from.y) * dir.y
        const elbows = [...(el.elbow ?? []), { x: Math.round(p.x), y: Math.round(p.y) }]
          .sort((a, b) => proj(a) - proj(b))
          .slice(0, 2)
        this.upsert({ ...el, route: 'elbow', elbow: elbows })
      } else {
        // 重置:route=straight(保留 curve/elbow 数据,便于切回)。
        this.upsert({ ...el, route: 'straight' })
      }
    } finally {
      this.coalescing = false
    }
    return true
  }

  /** 当前选中元素 id(渲染器自身状态,不上 CanvasHost)。 */
  getSelectedIds(): string[] {
    return [...this.selectedIds]
  }

  setSelectedIds(ids: string[]): void {
    // 仅在选区实际变化时 emit(去抖)——避免拖拽/点击重复设同一选区刷爆订阅者。
    const next = new Set(ids)
    const changed =
      next.size !== this.selectedIds.size ||
      [...next].some((id) => !this.selectedIds.has(id))
    this.selectedIds = next
    this.scheduleRender()
    if (changed) {
      const snapshot = [...this.selectedIds]
      for (const l of this.selectionListeners) l(snapshot)
    }
  }

  /** 订阅选区变更(setSelectedIds 实际改变时触发)。返回取消订阅。 */
  onSelectionChange(cb: (ids: string[]) => void): () => void {
    this.selectionListeners.add(cb)
    return () => {
      this.selectionListeners.delete(cb)
    }
  }

  getView(): CanvasView {
    return { ...this.view }
  }

  setView(v: CanvasView): void {
    // 引擎自我防御:净化脏 view(zoom 钳 [0.1,8] + 非有限值兜底)——不信任调用方
    // (.cystift / localStorage / AI 可能传 zoom=0/NaN,会让 screenToPage 除 0 失真)。
    this.view = sanitizeView(v)
    this.scheduleRender()
    for (const l of this.viewListeners) l(this.view)
  }

  protected emitUser(c: UserChange): void {
    // pushUndo 已在 upsert/remove 的 echo 分支(变更前)调过;此处只广播。
    for (const l of this.userListeners) l(c)
  }

  private pushUndo(): void {
    this.undoStack.push(this.snapshot())
    if (this.undoStack.length > SelfBuiltAdapter.UNDO_LIMIT) this.undoStack.shift()
    this.redoStack = [] // 新 user-change 清 redo
  }

  private snapshot(): CanvasElement[] {
    // meta 深拷贝 points:freedraw 的 points 是 [number,number][] 嵌套数组,
    // 浅拷贝({ ...e.meta })会让快照与 live 元素共享同一内层数组 ——
    // 之后 live 元素的原地改动会污染快照,undo 回滚恢复的是被改过的点序列。
    return this.getElements().map((e) => {
      if (!e.meta) return { ...e, meta: undefined }
      const m = e.meta as { points?: unknown }
      if (Array.isArray(m.points)) {
        return {
          ...e,
          meta: {
            ...e.meta,
            points: (m.points as [number, number][]).map((p) => [...p] as [number, number]),
          },
        }
      }
      return { ...e, meta: { ...e.meta } }
    })
  }

  canUndo(): boolean {
    return this.undoStack.length > 0
  }

  canRedo(): boolean {
    return this.redoStack.length > 0
  }

  /** 返回 undo 历史(只读副本,oldest→newest;不含当前状态)。供画布版本 diff。
   *  深拷贝每个快照(含 freedraw points)防外部篡改引擎内部状态。 */
  getHistory(): CanvasElement[][] {
    return this.undoStack.map((snap) => snap.map((el) => ({ ...el })))
  }

  undo(): void {
    const prev = this.undoStack.pop()
    if (!prev) return
    this.redoStack.push(this.snapshot())
    this.restore(prev)
  }

  redo(): void {
    const next = this.redoStack.pop()
    if (!next) return
    this.undoStack.push(this.snapshot())
    this.restore(next)
  }

  /**
   * 清空所有进行中的交互状态(drag/connect/resize/pan/marquee/freedraw 笔画)+ coalescing。
   *
   * R1.4/R1.5:undo/redo 的 restore() 和 setTool() 都调它。否则:
   * - restore 替换 elements 后 dragGroup 仍持陈旧 offset → 下次 pointermove 移动已恢复
   *   的元素到错坐标(数据错乱)。
   * - setTool 后 connecting/dragGroup 残留 → 幽灵 arrow / 误移动。
   * currentStroke 在切工具时放弃笔画(画到一半切工具 = 不该 commit 半截)。
   */
  private clearInteractionState(): void {
    this.dragGroup = null
    this.connecting = null
    this.resizing = null
    this.panning = null
    this.marquee = null
    this.currentStroke = null
    this.curveDragging = null
    this.elbowDragging = null
    this.coalescing = false
  }

  /** 用快照替换所有元素(不进栈、不触发 onUserChange)。 */
  private restore(snapshot: CanvasElement[]): void {
    // R1.4:恢复元素前先清交互状态——undo/redo 可能在 drag/connect 中途触发,残留的
    // dragGroup/connecting 指向的 offset/fromId 会与恢复后的元素错配,导致下次 pointermove
    // 用陈旧状态移动/造箭头。
    this.clearInteractionState()
    this.applyWithoutEcho(() => {
      this.elements.clear()
      for (const el of snapshot) this.elements.set(el.id, el)
    })
    // 选区同步:undo/redo 可能让被选中的元素消失(撤掉 upsert),残留的幽灵 id 会让
    // 后续 Delete/方向键/resize handle 取到 undefined → 静默失效、选中框画空。过滤掉
    // 快照里不存在的 id;若选区实际变了才 emit(跟 setSelectedIds 一致,避免多余事件)。
    const live = new Set(snapshot.map((e) => e.id))
    const before = this.selectedIds
    const filtered = new Set([...this.selectedIds].filter((id) => live.has(id)))
    if (filtered.size !== before.size || [...filtered].some((id) => !before.has(id))) {
      this.selectedIds = filtered
      const selSnapshot = [...this.selectedIds]
      for (const l of this.selectionListeners) l(selSnapshot)
    }
    this.scheduleRender()
  }

  private attachPointer(): void {
    if (this.pointerHandlers) return
    const onDown = (e: PointerEvent) => {
      if (this.activeTool === 'text') return // text 模式:不 drag/pan/freedraw,让页面 onClick 放 textarea
      const rect = this.canvas.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const p = screenToPage(this.view, sx, sy)
      if (this.activeTool === 'freedraw') {
        this.currentStroke = { points: [[Math.round(p.x), Math.round(p.y)]] }
        try {
          this.canvas.setPointerCapture(e.pointerId)
        } catch {
          /* jsdom 无 setPointerCapture / 已捕获 */
        }
        this.scheduleRender()
        return
      }
      // connect 模式:命中元素 → 开连接;空白 → 不开;都不进 drag/pan
      if (this.activeTool === 'connect') {
        const id = hitTest(this.getElements(), p.x, p.y, this.view.zoom)
        if (id) {
          this.connecting = { fromId: id, pointer: { x: p.x, y: p.y } }
          try {
            this.canvas.setPointerCapture(e.pointerId)
          } catch {
            /* jsdom 无 setPointerCapture / 已捕获 */
          }
          this.scheduleRender()
        }
        return
      }
      // shift + 空白 → 框选(优先,在 resize-hit 之前)
      if (this.activeTool === 'select' && e.shiftKey) {
        const hitId = hitTest(this.getElements(), p.x, p.y, this.view.zoom)
        if (!hitId) {
          this.marquee = { startX: p.x, startY: p.y, curX: p.x, curY: p.y }
          try {
            this.canvas.setPointerCapture(e.pointerId)
          } catch {
            /* jsdom 无 setPointerCapture / 已捕获 */
          }
          this.scheduleRender()
          return
        }
      }
      // resize handle 优先:选中元素的四角(仅 select 模式,单选)。
      // 多选(size>1)时禁用 resize handle——只允许组移动,避免「拖角只缩一个」的
      // 误导(组缩放需等比缩放 + freedraw 点序列组变换,是复杂功能,留后)。
      if (this.activeTool === 'select' && this.selectedIds.size === 1) {
        const selId = [...this.selectedIds][0]!
        const sel = this.getElement(selId)
        // 箭头手柄:按 route 分支命中。
        //  - elbow:每个折点方块手柄,点中 → 拖动改折点位置。
        //  - straight/curve:中点圆点,点中 → 拖动设/改 curve(弯曲箭头)。
        //    straight 拖出后会变 curve(route + curve 一起设)。
        if (sel && sel.kind === 'arrow') {
          const route = arrowRoute(sel)
          if (route === 'elbow' && sel.elbow && sel.elbow.length > 0) {
            // 折点手柄命中(方块,6px 容差)
            const idx = sel.elbow.findIndex(
              (ep) => Math.hypot(p.x - ep.x, p.y - ep.y) <= 8 / this.view.zoom,
            )
            if (idx >= 0) {
              this.elbowDragging = { id: selId, index: idx }
              this.pushUndo()
              this.coalescing = true
              try { this.canvas.setPointerCapture(e.pointerId) } catch { /* jsdom */ }
              return
            }
          } else {
            // 中点手柄命中(圆点,8px 容差)
            const { from, to } = arrowEndpoints(sel, this.getElements())
            if (from && to) {
              let mx: number, my: number
              if (route === 'curve' && sel.curve) {
                mx = 0.25 * from.x + 0.5 * sel.curve.cx + 0.25 * to.x
                my = 0.25 * from.y + 0.5 * sel.curve.cy + 0.25 * to.y
              } else {
                mx = (from.x + to.x) / 2
                my = (from.y + to.y) / 2
              }
              if (Math.hypot(p.x - mx, p.y - my) <= 8 / this.view.zoom) {
                this.curveDragging = { id: selId }
                this.pushUndo()
                this.coalescing = true
                try { this.canvas.setPointerCapture(e.pointerId) } catch { /* jsdom */ }
                return
              }
            }
          }
        }
        if (sel) {
          const handle = handleAtPoint(sel, p, this.view.zoom)
          if (handle) {
            this.resizing = { id: selId, handle, start: { x: sel.x, y: sel.y, w: sel.w, h: sel.h } }
            // resize 开始:批前推一次快照,后续 onMove 的连续 upsert 合并为这一步。
            this.pushUndo()
            this.coalescing = true
            try {
              this.canvas.setPointerCapture(e.pointerId)
            } catch {
              /* jsdom 无 setPointerCapture */
            }
            return
          }
        }
      }
      const id = hitTest(this.getElements(), p.x, p.y, this.view.zoom)
      if (id) {
        const el = this.getElement(id)!
        if (e.shiftKey) {
          // shift-toggle:在则移除,不在则累加
          const next = new Set(this.selectedIds)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          this.setSelectedIds([...next])
        } else {
          // 普通点:该元素已选中 → 保留组(准备组移动);否则单选替换
          if (!this.selectedIds.has(id)) this.setSelectedIds([id])
        }
        // 组移动:拖动所有选中元素(记录每个的 offset)
        const offsets = new Map<string, { x: number; y: number }>()
        for (const sid of this.selectedIds) {
          const sel = this.getElement(sid)
          if (sel) offsets.set(sid, { x: p.x - sel.x, y: p.y - sel.y })
        }
        this.dragGroup = { ids: [...this.selectedIds], offsets }
        // drag 开始:批前推一次快照,后续 onMove 的连续 upsert 合并为这一步(coalescing)。
        this.pushUndo()
        this.coalescing = true
      } else if (!e.shiftKey) {
        // 空白 + 无 shift → pan + 清选择(现有)
        this.setSelectedIds([])
        this.panning = {
          startSx: sx,
          startSy: sy,
          fromPanX: this.view.panX,
          fromPanY: this.view.panY,
        }
      }
      try {
        this.canvas.setPointerCapture(e.pointerId)
      } catch {
        /* jsdom 无 setPointerCapture / 已捕获 */
      }
    }
    const onMove = (e: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      if (this.connecting) {
        const p = screenToPage(this.view, sx, sy)
        this.connecting.pointer = { x: p.x, y: p.y }
        this.scheduleRender()
        return
      }
      if (this.marquee) {
        const p = screenToPage(this.view, sx, sy)
        this.marquee.curX = p.x
        this.marquee.curY = p.y
        this.scheduleRender()
        return
      }
      if (this.currentStroke) {
        const p = screenToPage(this.view, sx, sy)
        this.currentStroke.points.push([Math.round(p.x), Math.round(p.y)])
        this.scheduleRender()
        return
      }
      if (this.resizing) {
        const p = screenToPage(this.view, sx, sy)
        const el = this.getElement(this.resizing.id)
        if (el) {
          const g = resizeGeometry(this.resizing.handle, this.resizing.start, p)
          if (el.kind === 'freedraw') {
            // freedraw 真身=点序列:把点序列从旧 bbox 线性映射到新 box(不只改 bbox)。
            const scaled = scaleFreedrawToBox(el, g)
            if (scaled) this.upsert(scaled)
          } else {
            this.upsert({ ...el, x: g.x, y: g.y, w: g.w, h: g.h })
          }
        }
        return
      }
      if (this.dragGroup) {
        const p = screenToPage(this.view, sx, sy)
        for (const sid of this.dragGroup.ids) {
          const el = this.getElement(sid)
          const off = this.dragGroup.offsets.get(sid)
          if (!el || !off) continue
          const nx = Math.round(p.x - off.x)
          const ny = Math.round(p.y - off.y)
          if (el.kind === 'freedraw') {
            // freedraw 真身=点序列:按位移平移点序列(不只改 bbox)。
            const moved = translateFreedraw(el, nx - el.x, ny - el.y)
            if (moved) this.upsert(moved)
          } else {
            this.upsert({ ...el, x: nx, y: ny })
          }
        }
        return
      }
      if (this.curveDragging) {
        // 拖动弯曲手柄:指针 = 想要的曲线中点。反算控制点 C = 2*M - (P0+P1)/2。
        // 从 straight 拉出曲线时一并设 route='curve'(否则渲染仍看 route=straight 不画曲线)。
        const p = screenToPage(this.view, sx, sy)
        const el = this.getElement(this.curveDragging.id)
        if (el && el.kind === 'arrow') {
          const { from, to } = arrowEndpoints(el, this.getElements())
          if (from && to) {
            const cx = 2 * p.x - (from.x + to.x) / 2
            const cy = 2 * p.y - (from.y + to.y) / 2
            this.upsert({
              ...el,
              route: el.route ?? 'curve',
              curve: { cx: Math.round(cx), cy: Math.round(cy) },
            })
          }
        }
        return
      }
      if (this.elbowDragging) {
        // 拖动折点手柄:指针位置 = 折点新位置(改 elbow[index])。
        const p = screenToPage(this.view, sx, sy)
        const el = this.getElement(this.elbowDragging.id)
        if (el && el.kind === 'arrow' && el.elbow) {
          const elbows = el.elbow.slice()
          elbows[this.elbowDragging.index] = { x: Math.round(p.x), y: Math.round(p.y) }
          this.upsert({ ...el, elbow: elbows })
        }
        return
      }
      if (this.panning) {
        this.setView({
          ...this.view,
          panX: this.panning.fromPanX + (sx - this.panning.startSx),
          panY: this.panning.fromPanY + (sy - this.panning.startSy),
        })
      }
    }
    const onUp = (e: PointerEvent) => {
      this.coalescing = false // 任何交互结束 → 关闭 coalescing(drag/resize 的连续 upsert 批到此为止)
      if (this.connecting) {
        const rect = this.canvas.getBoundingClientRect()
        const sx = e.clientX - rect.left
        const sy = e.clientY - rect.top
        const p = screenToPage(this.view, sx, sy)
        const toId = hitTest(this.getElements(), p.x, p.y, this.view.zoom)
        if (toId && toId !== this.connecting.fromId) {
          const id =
            'arrow-' +
            (typeof crypto !== 'undefined' && 'randomUUID' in crypto
              ? crypto.randomUUID()
              : Math.random().toString(36).slice(2))
          this.upsert({
            id,
            kind: 'arrow',
            x: 0,
            y: 0,
            w: 0,
            h: 0,
            rotation: 0,
            from: this.connecting.fromId,
            to: toId,
            color: 'black',
          })
        }
        this.connecting = null
        try {
          this.canvas.releasePointerCapture(e.pointerId)
        } catch {
          /* 已释放 */
        }
        return
      }
      if (this.marquee) {
        const r = {
          x: Math.min(this.marquee.startX, this.marquee.curX),
          y: Math.min(this.marquee.startY, this.marquee.curY),
          w: Math.abs(this.marquee.curX - this.marquee.startX),
          h: Math.abs(this.marquee.curY - this.marquee.startY),
        }
        const hit = marqueeSelect(r, this.getElements())
        if (e.shiftKey) {
          const next = new Set(this.selectedIds)
          for (const id of hit) next.add(id)
          this.setSelectedIds([...next])
        } else {
          this.setSelectedIds(hit)
        }
        this.marquee = null
        try {
          this.canvas.releasePointerCapture(e.pointerId)
        } catch {
          /* 已释放 */
        }
        return
      }
      if (this.resizing) {
        this.resizing = null
        try {
          this.canvas.releasePointerCapture(e.pointerId)
        } catch {
          /* 已释放 */
        }
        return
      }
      if (this.currentStroke) {
        const id =
          'freedraw-' +
          (typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : Math.random().toString(36).slice(2))
        this.upsert(commitFreedraw(id, this.currentStroke.points))
        this.currentStroke = null
        try {
          this.canvas.releasePointerCapture(e.pointerId)
        } catch {
          /* 已释放 */
        }
        return
      }
      if (this.panning) {
        try {
          this.canvas.releasePointerCapture(e.pointerId)
        } catch {
          /* 已释放 */
        }
      }
      this.dragGroup = null
      this.panning = null
    }
    this.pointerHandlers = { down: onDown, move: onMove, up: onUp }
    this.canvas.addEventListener('pointerdown', onDown)
    this.canvas.addEventListener('pointermove', onMove)
    this.canvas.addEventListener('pointerup', onUp)

    // 滚轮/触摸板:ctrlKey(pinch 或 ctrl+滚轮)→ zoom-to-cursor;否则 → pan。
    this.wheelHandler = (e: WheelEvent) => {
      e.preventDefault()
      const rect = this.canvas.getBoundingClientRect()
      this.onWheel(
        e.clientX - rect.left,
        e.clientY - rect.top,
        e.deltaX,
        e.deltaY,
        e.ctrlKey,
      )
    }
    this.canvas.addEventListener('wheel', this.wheelHandler, { passive: false })
  }

  /**
   * 挂 window keydown:Delete/Backspace 删选中(严守卫)。
   * activeTool==='text'(文本编辑中)或焦点在 INPUT/TEXTAREA 时不触发,防误删。
   * 选择空不触发。detach 解绑,防泄漏。
   */
  private attachKeyboard(): void {
    if (this.keyHandler) return
    this.keyHandler = (e: KeyboardEvent) => {
      // 守卫:text 模式 / 焦点在输入框
      const t = e.target as HTMLElement | null
      const inInput = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')
      if (this.activeTool === 'text' || inInput) {
        // 文本编辑中:只可能 IME;不拦截任何键(Delete/微移/undo 都不触发)
        return
      }
      // Escape:取消选区(通用画布习惯)。text/输入框已在上守卫排除。
      if (e.key === 'Escape') {
        if (this.selectedIds.size === 0) return
        e.preventDefault()
        this.setSelectedIds([])
        return
      }
      // undo/redo/selectAll(守 isComposing——IME 组合态不 undo)
      const action = parseKeyboardAction(e)
      if (action) {
        if (e.isComposing) return
        e.preventDefault()
        if (action === 'undo') this.undo()
        else if (action === 'redo') this.redo()
        else if (action === 'selectAll') this.setSelectedIds(selectAllIds(this.getElements()))
        return
      }
      // Delete/Backspace(现有)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.selectedIds.size === 0) return
        e.preventDefault()
        const ids = [...this.selectedIds]
        this.setSelectedIds([])
        for (const id of ids) this.remove(id) // echo → onUserChange
        return
      }
      // 方向键微移
      const delta = arrowKeyDelta(e.key, e.shiftKey)
      if (delta) {
        if (this.selectedIds.size === 0) return
        e.preventDefault()
        for (const id of this.selectedIds) {
          const el = this.getElement(id)
          if (!el) continue
          if (el.kind === 'freedraw') {
            // freedraw 真身=点序列:微移也须平移 points(同 drag,别只移 bbox)
            const moved = translateFreedraw(el, delta.dx, delta.dy)
            if (moved) this.upsert(moved)
          } else {
            this.upsert({ ...el, x: el.x + delta.dx, y: el.y + delta.dy })
          }
        }
      }
    }
    window.addEventListener('keydown', this.keyHandler)
  }

  /**
   * 滚轮/触摸板:ctrlKey(pinch 或 ctrl+滚轮)→ zoom-to-cursor;否则 → pan。
   * macOS 触摸板双指滑动 = wheel 无 ctrlKey(应 pan);pinch = wheel + ctrlKey(应 zoom)。
   * 主流画布(Figma/tldraw)同此规范:滚轮 pan,ctrl+滚轮 zoom。
   */
  onWheel(sx: number, sy: number, deltaX: number, deltaY: number, ctrlKey: boolean): void {
    if (ctrlKey) {
      // zoom-to-cursor:以 (sx,sy) 为锚点。zoom 钳制 [0.1, 8];pan 补偿使 cursor 下页坐标缩放前后不变。
      const factor = deltaY < 0 ? 1.1 : 1 / 1.1
      const nextZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.view.zoom * factor))
      const pageX = (sx - this.view.panX) / this.view.zoom
      const pageY = (sy - this.view.panY) / this.view.zoom
      const panX = sx - pageX * nextZoom
      const panY = sy - pageY * nextZoom
      this.setView({ ...this.view, zoom: nextZoom, panX, panY })
    } else {
      // pan:delta 直接平移(触摸板双指滑动 / 鼠标滚轮)。
      this.setView({ ...this.view, panX: this.view.panX - deltaX, panY: this.view.panY - deltaY })
    }
  }

  /** 解绑指针 + wheel 监听(页面卸载调)。 */
  detach(): void {
    if (this.pointerHandlers) {
      this.canvas.removeEventListener('pointerdown', this.pointerHandlers.down)
      this.canvas.removeEventListener('pointermove', this.pointerHandlers.move)
      this.canvas.removeEventListener('pointerup', this.pointerHandlers.up)
      this.pointerHandlers = null
    }
    if (this.wheelHandler) {
      this.canvas.removeEventListener('wheel', this.wheelHandler)
      this.wheelHandler = null
    }
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler)
      this.keyHandler = null
    }
  }

  /** 供后续 Task(渲染/交互)读取相机。 */
  protected getViewInternal(): CanvasView {
    return this.view
  }
}
