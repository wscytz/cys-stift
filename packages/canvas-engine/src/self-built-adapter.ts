
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
  CanvasHistoryChange,
} from './canvas-host'
import { sortByLayer, sanitizeView, ZOOM_MIN, ZOOM_MAX } from './canvas-host'
import { renderElements, drawSelectionOutlines, drawMarquee, domTokenResolver, resolveCardLayout, type CardInfo, type TokenResolver, type CardDisplayMode } from './self-built-render'
import { hitTest, screenToPage, eraserHitTest, hitTestCardWithTolerance } from './self-built-hittest'
import { commitFreedraw, translateFreedraw, scaleFreedrawToBox } from './self-built-freedraw'
import { handleAtPoint, resizeGeometry, type Handle } from './self-built-resize'
import { marqueeSelect } from './self-built-marquee'
import { arrowPreviewEndpoints, arrowEndpoints, arrowRoute } from './self-built-arrow'
import { arrowKeyDelta, selectAllIds, parseKeyboardAction } from './self-built-keyboard'
import { intersectsBounds, viewportBounds, normalizeBox } from './bounds'

export type CanvasCommand =
  | { type: 'select'; ids: string[] }
  | { type: 'clearSelection' }
  | { type: 'selectAll' }
  | { type: 'deleteSelection' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'endHistoryGroup' }
  | {
      type: 'nudgeSelection'
      dx: number
      dy: number
      history: 'start' | 'continue' | 'single'
    }

export class SelfBuiltAdapter implements CanvasHost {
  private elements = new Map<string, CanvasElement>()
  private view: CanvasView = { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }
  private userListeners = new Set<(c: UserChange) => void>()
  private elementListeners = new Set<() => void>()
  private viewListeners = new Set<(v: CanvasView) => void>()
  private selectionListeners = new Set<(ids: string[]) => void>()
  /** undo/redo 栈变化时触发(pushUndo/undo/redo)。供 UI 刷新 undo/redo 按钮 disabled 态。
   *  history 变化的三个点都广播:pushUndo(新变更→canUndo true/canRedo false)、
   *  undo、redo。restore() 不单独触发(由 undo/redo 末尾触发)。 */
  private historyListeners = new Set<(change: CanvasHistoryChange) => void>()
  protected echoing = true
  protected ctx: CanvasRenderingContext2D | null
  private getCardInfo: (id: string) => CardInfo | null
  private tokenResolver: TokenResolver
  /** 卡片显示模式(密度切换,web 层 settings 传入;默认 compact = 旧行为)。 */
  private cardMode: CardDisplayMode = 'compact'
  private rafId: number | null = null
  private panning: {
    startSx: number
    startSy: number
    fromPanX: number
    fromPanY: number
  } | null = null
  /** 多指跟踪(触摸双指 pinch/pan);pointerId → 屏幕坐标(相对 canvas)。 */
  private activePointers = new Map<number, { x: number; y: number }>()
  /** 双指 pinch 态(相对增量)。null = 非双指。 */
  private pinch: { lastDist: number; lastMid: { x: number; y: number } } | null = null
  private pointerHandlers: {
    down: (e: PointerEvent) => void
    move: (e: PointerEvent) => void
    up: (e: PointerEvent) => void
    cancel: (e: PointerEvent) => void
    lost: (e: PointerEvent) => void
  } | null = null
  private wheelHandler: ((e: WheelEvent) => void) | null = null
  /** visibilitychange handler(Tab 切走/失焦清交互态)。null=未挂。 */
  private visibilityHandler: (() => void) | null = null
  private activeTool: 'select' | 'freedraw' | 'eraser' | 'text' | 'connect' = 'select'
  private currentStroke: { points: [number, number][] } | null = null
  private selectedIds = new Set<string>()
  private resizing: { id: string; handle: Handle; start: { x: number; y: number; w: number; h: number } } | null = null
  private dragGroup: { ids: string[]; offsets: Map<string, { x: number; y: number }> } | null = null
  private marquee: { startX: number; startY: number; curX: number; curY: number } | null = null
  private connecting: { fromId: string; pointer: { x: number; y: number }; toId: string | null } | null = null
  /** 拖动箭头弯曲手柄(设 curve 控制点)。null=未在拖。 */
  private curveDragging: { id: string; start: { x: number; y: number } } | null = null
  /** 拖动折线箭头折点手柄(改 elbow[index] 位置)。null=未在拖。 */
  private elbowDragging: { id: string; index: number; start: { x: number; y: number } } | null = null
  /** 橡皮擦按住拖拽连续擦除态。pointerdown 命中即置 true,pointermove 持续命中删除,
   *  pointerup 置 false。null=未在擦。true 时记录上一次擦的 id 防同点重复 remove。 */
  private erasing: { lastId: string | null; lastPoint: { x: number; y: number } | null } | null = null
  /** 橡皮模式:text 只擦文字 / card 只擦卡片(进回收桶)/ all 擦一切。默认 all(兼容旧行为)。 */
  private eraserMode: 'text' | 'card' | 'all' = 'all'
  /** card 模式命中卡片时的回调(由 web 层注入:service.softDelete 进回收桶)。
   *  引擎不接触 CardService,只通过此回调通知「用户擦了张卡」,由调用方决定 softDelete。 */
  private onEraseCard: ((cardId: string) => void) | null = null
  private keyHandler: ((e: KeyboardEvent) => void) | null = null
  /** keyup handler(关方向键 coalescing)。null=未挂。 */
  private keyUpHandler: ((e: KeyboardEvent) => void) | null = null
  private undoStack: CanvasElement[][] = []
  private redoStack: CanvasElement[][] = []
  private static readonly UNDO_LIMIT = 50
  private static readonly GRID = 8
  /** coalescing=true 期间,echo 的 upsert/remove 不重复推快照。
   * drag/resize/handle 在首次位移时 push;batch 在首次 mutation 时 push。 */
  private coalescing = false
  /** Outermost batch waits until its first echoed mutation before snapshotting. */
  private batchUndoPending = false
  /** 元素集版本:每次 upsert/remove/restore 递增,用于 O(1) 缓存失效判定。 */
  private _elementsVersion = 0
  /** 静态层缓存:层排序后的元素数组。_sortedVersion === _elementsVersion 时命中。 */
  private _sortedElements: CanvasElement[] | null = null
  /** 静态层对应的元素集版本;-1 表示未缓存。 */
  private _sortedVersion = -1
  /** 视口剔除缓存:可见元素数组。依赖元素集版本 + view 签名。 */
  private _visibleElements: CanvasElement[] | null = null
  /** 视口剔除对应的元素集版本;-1 表示未缓存。 */
  private _visibleVersion = -1
  /** 视口剔除对应的 view 签名(vp + 画布尺寸),用于检测 pan/zoom/尺寸变化。 */
  private _visibleViewSig = ''

  constructor(
    private canvas: HTMLCanvasElement,
    opts?: { getCardInfo?: (id: string) => CardInfo | null; tokenResolver?: TokenResolver; onEraseCard?: (cardId: string) => void; cardMode?: CardDisplayMode },
  ) {
    this.ctx = canvas.getContext('2d')
    this.getCardInfo = opts?.getCardInfo ?? (() => null)
    this.tokenResolver = opts?.tokenResolver ?? domTokenResolver
    this.onEraseCard = opts?.onEraseCard ?? null
    this.cardMode = opts?.cardMode ?? 'compact'
    this.attachPointer()
    this.attachKeyboard()
  }

  /** 设置卡片显示模式(web 层 settings 变更时调,触发重渲)。 */
  setCardMode(m: CardDisplayMode): void {
    if (this.cardMode === m) return
    this.cardMode = m
    // 模式变 -> 所有卡高度都要重算(一次全量同步,不推 undo)。
    this.syncCardHeights(this.getSortedElements())
    this.scheduleRender()
  }

  /**
   * 同步卡高到模式派生值(静默:不推 undo、不 emit 持久化--派生值每次 render 重算,self-heal)。
   * @param targets 要同步的卡集合(renderNow 传 visible 省全量 wrap;setCardMode 传全集)。
   */
  protected syncCardHeights(targets: CanvasElement[]): boolean {
    if (!this.ctx) return false
    let changed = false
    for (const el of targets) {
      if (el.kind !== 'card') continue
      const info = this.getCardInfo(el.id)
      const body = info?.body ?? ''
      const { height } = resolveCardLayout(this.cardMode, body, el.w, this.ctx)
      if (el.h !== height) {
        this.elements.set(el.id, { ...el, h: height })
        changed = true
      }
    }
    if (changed) this._elementsVersion++
    return changed
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
    let visible = this.getVisibleElements(vp, w, h)
    // 卡高同步(模式派生):每帧只同步 visible 卡(省全量 wrap);body/width 改走 upsert->
    // scheduleRender->此行,选中卡(可见)高度跟随。模式变由 setCardMode 全量同步。
    if (this.syncCardHeights(visible)) {
      // sync replaces map entries and invalidates the visibility cache. Render
      // the refreshed objects in this same frame, not the stale pre-sync array.
      visible = this.getVisibleElements(vp, w, h)
    }
    // allForResolution = 全集(getSortedElements 缓存):关系箭头端点靠 from/to id
    // 在元素集里 find 出来。视锥剔除会丢掉屏外端点 card → 若箭头从「被剔除后的
    // 列表」里 resolve 端点会 find 不到 → 不画 → 高倍放大时长箭头凭空消失。
    // 故「画哪些」(toDraw=visible+preview)与「解析端点用哪些」(全集)解耦。
    renderElements(
      ctx,
      [...visible, ...preview],
      this.view,
      w,
      h,
      this.getCardInfo,
      this.tokenResolver('--color-canvas', '#ffffff'),
      this.tokenResolver,
      this.getSortedElements(),
      this.cardMode,
    )
    // selection outline 需要全部元素(找 selected id),用层排序缓存(不另调 getElements)。
    drawSelectionOutlines(ctx, this.getSelectedIds(), this.getSortedElements(), this.view, this.tokenResolver)
    if (this.marquee) {
      drawMarquee(ctx, {
        x: Math.min(this.marquee.startX, this.marquee.curX),
        y: Math.min(this.marquee.startY, this.marquee.curY),
        w: Math.abs(this.marquee.curX - this.marquee.startX),
        h: Math.abs(this.marquee.curY - this.marquee.startY),
      }, this.view, this.tokenResolver)
    }
    // connect 模式:给所有可连元素(card/rect/text/frame)画淡虚线轮廓,暗示可连(教育新用户)。
    if (this.activeTool === 'connect') {
      ctx.save()
      ctx.translate(this.view.panX, this.view.panY)
      ctx.scale(this.view.zoom, this.view.zoom)
      ctx.strokeStyle = this.tokenResolver('--color-blue', '#1d4ed8')
      ctx.lineWidth = 1 / this.view.zoom
      ctx.globalAlpha = 0.4
      ctx.setLineDash([4 / this.view.zoom, 3 / this.view.zoom])
      for (const el of this.getSortedElements()) {
        if (el.kind === 'arrow') continue
        const b = normalizeBox(el)
        ctx.strokeRect(b.x, b.y, b.w, b.h)
      }
      ctx.setLineDash([])
      ctx.restore()
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
      // 目标命中高亮:move 中对准的卡描蓝边(给"对准了"反馈)。
      if (this.connecting.toId) {
        const target = this.getElement(this.connecting.toId)
        if (target) {
          const b = normalizeBox(target)
          ctx.save()
          ctx.translate(this.view.panX, this.view.panY)
          ctx.scale(this.view.zoom, this.view.zoom)
          ctx.strokeStyle = this.tokenResolver('--color-blue', '#1d4ed8')
          ctx.lineWidth = 3 / this.view.zoom
          ctx.strokeRect(b.x, b.y, b.w, b.h)
          ctx.restore()
        }
      }
    }
  }

  getElements(): CanvasElement[] {
    // 确定性 z 序:按 KIND_LAYER 稳定排序(见 canvas-host)。渲染 / hitTest / SVG /
    // 快照 / DSL / .cystift 全读这个顺序,五视图一致,reload 视觉不变。
    return sortByLayer([...this.elements.values()])
  }

  /** 层排序后的元素(缓存)。元素集版本变化时重算。
   *  直接读 this.elements(Map),**不调 getElements()** —— 后者每次都 sortByLayer,
   *  若经它查缓存,排序发生在缓存检查之前,缓存形同虚设(v0.40 A-T3 修正)。 */
  private getSortedElements(): CanvasElement[] {
    if (this._sortedElements && this._sortedVersion === this._elementsVersion) {
      return this._sortedElements
    }
    this._sortedElements = sortByLayer([...this.elements.values()])
    this._sortedVersion = this._elementsVersion
    // 元素集变化 → 视口剔除也失效
    this._visibleElements = null
    return this._sortedElements
  }

  /** 视口剔除后的可见元素(缓存)。元素集版本或 view 变化时重算。 */
  private getVisibleElements(vp: { x: number; y: number; w: number; h: number }, w: number, h: number): CanvasElement[] {
    const sorted = this.getSortedElements()
    const viewSig = `${vp.x},${vp.y},${vp.w},${vp.h}|${w},${h}`
    if (
      this._visibleElements &&
      this._visibleVersion === this._elementsVersion &&
      this._visibleViewSig === viewSig
    ) {
      return this._visibleElements
    }
    this._visibleViewSig = viewSig
    this._visibleVersion = this._elementsVersion
    this._visibleElements = sorted.filter(
      (el) => (el.kind === 'arrow' && el.from && el.to) || intersectsBounds(normalizeBox(el), vp),
    )
    return this._visibleElements
  }

  getElement(id: string): CanvasElement | undefined {
    return this.elements.get(id)
  }

  upsert(el: CanvasElement): void {
    this._elementsVersion++
    if (this.echoing) {
      if (this.batchUndoPending) {
        this.pushUndo()
        this.batchUndoPending = false
      } else if (!this.coalescing) {
        this.pushUndo()
      }
    }
    this.elements.set(el.id, el)
    if (this.echoing) this.emitUser({ updated: [el], removed: [] })
    this.emitElements()
    this.scheduleRender()
  }

  remove(id: string): void {
    if (!this.elements.has(id)) return
    this._elementsVersion++
    if (this.echoing) {
      if (this.batchUndoPending) {
        this.pushUndo()
        this.batchUndoPending = false
      } else if (!this.coalescing) {
        this.pushUndo()
      }
    }
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
    this.emitElements()
    this.scheduleRender()
  }

  batch(fn: () => void): void {
    const wasCoalescing = this.coalescing
    if (!wasCoalescing) {
      this.coalescing = true
      this.batchUndoPending = this.echoing
    }
    try {
      fn()
    } finally {
      if (!wasCoalescing) {
        this.batchUndoPending = false
        this.coalescing = false
      }
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

  /** Subscribe to the live element model, including echo-suppressed hydration. */
  onElementsChange(cb: () => void): () => void {
    this.elementListeners.add(cb)
    return () => {
      this.elementListeners.delete(cb)
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
  setTool(t: 'select' | 'freedraw' | 'eraser' | 'text' | 'connect'): void {
    this.activeTool = t
    // R1.5:切工具时清掉一切进行中的交互状态,否则 connect/drag 中的 connecting/dragGroup
    // 残留 → 切回 select 后一个无谓的 pointermove 会用陈旧状态造幽灵 arrow / 移动元素。
    // 之前只清 currentStroke,不够。
    this.clearInteractionState()
    this.scheduleRender()
  }

  getTool(): 'select' | 'freedraw' | 'eraser' | 'text' | 'connect' {
    return this.activeTool
  }

  /** 切换橡皮模式:text 只擦文字 / card 只擦卡片(进回收桶)/ all 擦一切。 */
  setEraserMode(m: 'text' | 'card' | 'all'): void {
    this.eraserMode = m
  }
  getEraserMode(): 'text' | 'card' | 'all' {
    return this.eraserMode
  }

  /**
   * 橡皮命中 + 按模式过滤 + 删除。返回命中的 id(供 erasing 态防重复),null=未命中/被模式过滤。
   *  - text 模式:只删 kind==='text'
   *  - card 模式:只删 kind==='card',删前调 onEraseCard(web 层 softDelete 进回收桶),
   *    再 host.remove(视觉消失)。canvas-binding 的 removed 回写因 deletedAt 已设而跳过 removeFromCanvas。
   *  - all 模式:删一切(host.remove)
   */
  private eraseAt(p: { x: number; y: number }): string | null {
    // 橡皮用专属宽松命中(eraserHitTest):线类 16px 屏幕、bbox 类扩展 4px。
    // 比 hitTest(6px)宽松得多,细线/箭头在缩小视图下也能擦到(用户"删不掉"真因)。
    const id = eraserHitTest(this.getElements(), p.x, p.y, this.view.zoom)
    if (!id) return null
    const el = this.getElement(id)
    if (!el) return null
    if (this.eraserMode === 'text' && el.kind !== 'text') return null
    if (this.eraserMode === 'card' && el.kind !== 'card') return null
    if (this.eraserMode === 'card' && el.kind === 'card') {
      this.onEraseCard?.(id)
    }
    this.remove(id)
    return id
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
    // 函数内多次用全量元素(hitTest 命中判定 + arrowEndpoints 端点解析),取一次快照
    // 复用 —— 否则每次 this.getElements() 都 O(n log n) 全排序 + 拷贝(5000 元素时双击 = 3 次)。
    // 函数期间无 upsert/remove,排序结果恒等。
    const els = this.getElements()
    if (hitTest(els, p.x, p.y, this.view.zoom) !== selId) return false
    const { from, to } = arrowEndpoints(el, els)
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

  /** Shared mutation path for window keyboard handling and DOM accessibility UI. */
  executeCommand(command: CanvasCommand): boolean {
    if (command.type === 'select') {
      const before = this.getSelectedIds()
      this.setSelectedIds(command.ids.filter((id) => this.elements.has(id)))
      const after = this.getSelectedIds()
      return before.length !== after.length || before.some((id, index) => id !== after[index])
    }
    if (command.type === 'clearSelection') {
      if (this.selectedIds.size === 0) return false
      this.setSelectedIds([])
      return true
    }
    if (command.type === 'selectAll') {
      const ids = selectAllIds(this.getElements())
      if (ids.length === 0) return false
      this.setSelectedIds(ids)
      return true
    }
    if (command.type === 'deleteSelection') {
      const ids = [...this.selectedIds].filter((id) => this.elements.has(id))
      if (ids.length === 0) return false
      this.setSelectedIds([])
      this.batch(() => {
        for (const id of ids) this.remove(id)
      })
      return true
    }
    if (command.type === 'undo') {
      if (!this.canUndo()) return false
      this.undo()
      return true
    }
    if (command.type === 'redo') {
      if (!this.canRedo()) return false
      this.redo()
      return true
    }
    if (command.type === 'endHistoryGroup') {
      const active = this.coalescing
      this.coalescing = false
      return active
    }

    const ids = [...this.selectedIds].filter((id) => this.elements.has(id))
    if (ids.length === 0 || (command.dx === 0 && command.dy === 0)) return false
    const wasCoalescing = this.coalescing
    if (command.history === 'single') {
      this.pushUndo()
      this.coalescing = true
    } else if (command.history === 'start' || !this.coalescing) {
      this.pushUndo()
      this.coalescing = true
    }
    const dx =
      this.view.gridMode === 'snap'
        ? command.dx * SelfBuiltAdapter.GRID
        : command.dx
    const dy =
      this.view.gridMode === 'snap'
        ? command.dy * SelfBuiltAdapter.GRID
        : command.dy
    for (const id of ids) {
      const el = this.getElement(id)
      if (!el) continue
      if (el.kind === 'freedraw') {
        const moved = translateFreedraw(el, dx, dy)
        if (moved) this.upsert(moved)
      } else {
        this.upsert({ ...el, x: el.x + dx, y: el.y + dy })
      }
    }
    if (command.history === 'single') this.coalescing = wasCoalescing
    this.scheduleRender()
    return true
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

  private emitElements(): void {
    for (const listener of this.elementListeners) listener()
  }

  private pushUndo(): void {
    this.undoStack.push(this.snapshot())
    if (this.undoStack.length > SelfBuiltAdapter.UNDO_LIMIT) this.undoStack.shift()
    this.redoStack = [] // 新 user-change 清 redo
    this.emitHistory('push')
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
    this.emitHistory('undo')
  }

  redo(): void {
    const next = this.redoStack.pop()
    if (!next) return
    this.undoStack.push(this.snapshot())
    this.restore(next)
    this.emitHistory('redo')
  }

  /** 广播 history 栈变化(供 undo/redo 按钮刷新 disabled 态)。 */
  private emitHistory(change: CanvasHistoryChange): void {
    for (const l of this.historyListeners) l(change)
  }

  /** 订阅 undo/redo 栈变化(pushUndo/undo/redo 时触发)。返回取消订阅。 */
  onHistoryChange(cb: (change: CanvasHistoryChange) => void): () => void {
    this.historyListeners.add(cb)
    return () => {
      this.historyListeners.delete(cb)
    }
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
    this.erasing = null
    this.coalescing = false
    this.batchUndoPending = false
  }

  /** 计算当前双指几何(两指距离 + 中点)。不足两指 → null。
   *  Map 迭代序 = 插入序,故 vals[0]/[1] 稳定对应先落的两指。 */
  private twoFingerGeometry(): { dist: number; mid: { x: number; y: number } } | null {
    if (this.activePointers.size < 2) return null
    const vals = [...this.activePointers.values()]
    const p1 = vals[0]!, p2 = vals[1]!
    return {
      dist: Math.hypot(p2.x - p1.x, p2.y - p1.y),
      mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
    }
  }

  /** 进入双指 pinch:清一切进行中的单指交互(drag/connect/erase/...),
   *  以当前两指距离+中点为基线。后续 updatePinch 用相对增量。 */
  private startPinch(): void {
    const geo = this.twoFingerGeometry()
    if (!geo) return
    this.clearInteractionState()
    this.pinch = { lastDist: geo.dist, lastMid: geo.mid }
  }

  /** 双指移动:相对增量 zoom(以中点为锚)+ 中点位移 pan。
   *  zoom-to-cursor 锚点 = 中点;pan = 中点屏幕位移 + 缩放补偿。 */
  private updatePinch(): void {
    if (!this.pinch) return
    const geo = this.twoFingerGeometry()
    if (!geo) return
    const factor = geo.dist / this.pinch.lastDist
    const nextZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.view.zoom * factor))
    const pageX = (geo.mid.x - this.view.panX) / this.view.zoom
    const pageY = (geo.mid.y - this.view.panY) / this.view.zoom
    let panX = geo.mid.x - pageX * nextZoom
    let panY = geo.mid.y - pageY * nextZoom
    panX += geo.mid.x - this.pinch.lastMid.x
    panY += geo.mid.y - this.pinch.lastMid.y
    this.setView({ ...this.view, zoom: nextZoom, panX, panY })
    this.pinch.lastDist = geo.dist
    this.pinch.lastMid = geo.mid
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
    // 快照替换整个元素集 → 静态层缓存失效(签名必变,显式失效防签名碰撞/幽灵元素)。
    this._elementsVersion++
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
    this.emitElements()
    this.scheduleRender()
  }

  private attachPointer(): void {
    if (this.pointerHandlers) return
    const onDown = (e: PointerEvent) => {
      if (this.activeTool === 'text') return // text 模式:不 drag/pan/freedraw,让页面 onClick 放 textarea
      const rect = this.canvas.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      // 多指跟踪:第二指落下 → 进 pinch(清单指交互态)。text/eraser/freedraw/connect
      // 单指语义在 size<2 时照常走;第二指一到即接管,单指手势让位(对齐 tldraw/Figma)。
      this.activePointers.set(e.pointerId, { x: sx, y: sy })
      if (this.activePointers.size >= 2) {
        this.startPinch()
        // 第二指也要捕获:canvas 不填满视口(toolbar/rail/companion 占位),不捕获则
        // 第二指漂出 canvas 边界后 pointermove 不达 → activePointers 陈旧 → pinch 坏。
        try { this.canvas.setPointerCapture(e.pointerId) } catch { /* jsdom 无 setPointerCapture */ }
        return
      }
      const p = screenToPage(this.view, sx, sy)
      // eraser 模式:点中元素即删 + 进入连续擦除态(按住拖拽擦过路径上的元素)。
      // remove() 自动 pushUndo + 级联清悬空箭头 + emitUser + scheduleRender。
      // 拖拽擦除:每次 pointermove 命中新元素就删,像真正的橡皮。
      // coalescing:批前 pushUndo 一次,后续 onMove 的 remove 都被 coalescing 抑制不再推快照
      // → 整个拖拽擦除 = 1 步 undo(对齐 drag/resize/multi-delete 的单步契约)。
      if (this.activeTool === 'eraser') {
        // undo 粒度:eraseAt→remove 内置 pushUndo(coalescing=false 时自推)。
        // 命中才 set coalescing 抑制后续 move 的 remove 推快照(整擦=1 步);空白不推。
        const id = this.eraseAt(p)
        if (id) this.coalescing = true
        this.erasing = { lastId: id, lastPoint: p }
        try {
          this.canvas.setPointerCapture(e.pointerId)
        } catch {
          /* jsdom 无 setPointerCapture / 已捕获 */
        }
        return
      }
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
          this.connecting = { fromId: id, pointer: { x: p.x, y: p.y }, toId: null }
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
              this.elbowDragging = { id: selId, index: idx, start: { x: p.x, y: p.y } }
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
                this.curveDragging = { id: selId, start: { x: p.x, y: p.y } }
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
            // undo 粒度:pushUndo 推迟到 onMove 首次实际 resize(lazy)。
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
        // undo 粒度:pushUndo 推迟到 onMove 首次实际移动(lazy),纯点击不拖不污染 undo 栈。
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
      // 更新当前指位置;pinch 中 → 用相对增量 zoom/pan 并 return(不让单指态介入)。
      if (this.activePointers.has(e.pointerId)) {
        this.activePointers.set(e.pointerId, { x: sx, y: sy })
      }
      if (this.pinch) {
        this.updatePinch()
        return
      }
      if (this.erasing) {
        // 连续擦除:拖拽路径上每命中一个新元素就删(lastId 防同点重复 remove)。
        // 走 eraseAt 以遵守当前 eraserMode(text/card/all 的命中过滤 + card 进回收桶)。
        const p = screenToPage(this.view, sx, sy)
        // 线段擦:上一点到当前点之间按约 4px 屏幕间距完整采样,不设固定步数上限。
        const pts: { x: number; y: number }[] = []
        if (this.erasing.lastPoint) {
          const a = this.erasing.lastPoint
          const dx = p.x - a.x,
            dy = p.y - a.y
          const distPx = Math.hypot(dx, dy) * this.view.zoom
          const steps = Math.max(1, Math.ceil(distPx / 4))
          for (let s = 1; s <= steps; s++) {
            const t = s / steps
            pts.push({ x: a.x + dx * t, y: a.y + dy * t })
          }
        } else {
          pts.push(p)
        }
        for (const sp of pts) {
          const id = this.eraseAt(sp)
          // 首次 move 命中(onDown 未命中/空白起手):remove 已自推,开 coalescing 抑制后续。
          if (id) {
            if (!this.coalescing) this.coalescing = true
            this.erasing.lastId = id
          }
        }
        this.erasing.lastPoint = p
        return
      }
      if (this.connecting) {
        const p = screenToPage(this.view, sx, sy)
        this.connecting.pointer = { x: p.x, y: p.y }
        // move 中跟踪当前命中目标(用 card 容差命中),供目标高亮 + 松手判定。
        // 排除 fromId(不自连)。toId 即"对准了"的视觉反馈数据源。
        // 用 getSortedElements()(层排序缓存)而非 getElements()(每帧全量排序)。
        const hit = hitTestCardWithTolerance(this.getSortedElements(), p.x, p.y, this.view.zoom)
        this.connecting.toId = hit && hit !== this.connecting.fromId ? hit : null
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
          // lazy pushUndo:首次实际 resize 才推(点 handle 不拖不推)。
          if (!this.coalescing) {
            this.pushUndo()
            this.coalescing = true
          }
          // snap 模式:拖动角点 p 过 snapCoord(对角由 start 固定,snap 移动角即让尺寸落网格)。
          const sp = this.view.gridMode === 'snap'
            ? { x: this.snapCoord(p.x), y: this.snapCoord(p.y) }
            : p
          const g = resizeGeometry(this.resizing.handle, this.resizing.start, sp)
          if (el.kind === 'freedraw') {
            // freedraw 真身=点序列:把点序列从旧 bbox 线性映射到新 box(不只改 bbox)。
            const scaled = scaleFreedrawToBox(el, g)
            if (scaled) this.upsert(scaled)
          } else if (el.kind === 'card') {
            // card 高度由 cardDisplayMode 派生(mode A):resize 只改 x/w,**y 锚定 el.y 不动**。
            // h 留给 syncCardHeights 下个 render 帧按新 w 重算(拖角 -> 宽变 -> 高跟随内容)。
            // 不取 g.y:ne/nw 上角的 g.y=point.y(指针),取了卡会垂直跳到指针;mode A 高度
            // 派生,顶应固定,只让 handle 的水平分量(x/w)生效。
            this.upsert({ ...el, x: g.x, y: el.y, w: g.w })
          } else {
            this.upsert({ ...el, x: g.x, y: g.y, w: g.w, h: g.h })
          }
        }
        return
      }
      if (this.dragGroup) {
        const p = screenToPage(this.view, sx, sy)
        // lazy pushUndo:首次实际移动才推快照(纯点击不拖不推),后续 upsert 被 coalescing 合并。
        if (!this.coalescing) {
          this.pushUndo()
          this.coalescing = true
        }
        for (const sid of this.dragGroup.ids) {
          const el = this.getElement(sid)
          const off = this.dragGroup.offsets.get(sid)
          if (!el || !off) continue
          const nx = this.snapCoord(p.x - off.x)
          const ny = this.snapCoord(p.y - off.y)
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
        if (
          !this.coalescing &&
          p.x === this.curveDragging.start.x &&
          p.y === this.curveDragging.start.y
        ) {
          return
        }
        const el = this.getElement(this.curveDragging.id)
        if (el && el.kind === 'arrow') {
          const { from, to } = arrowEndpoints(el, this.getElements())
          if (from && to) {
            if (!this.coalescing) {
              this.pushUndo()
              this.coalescing = true
            }
            const cx = 2 * p.x - (from.x + to.x) / 2
            const cy = 2 * p.y - (from.y + to.y) / 2
            this.upsert({
              ...el,
              route: 'curve',
              curve: { cx: Math.round(cx), cy: Math.round(cy) },
            })
          }
        }
        return
      }
      if (this.elbowDragging) {
        // 拖动折点手柄:指针位置 = 折点新位置(改 elbow[index])。
        const p = screenToPage(this.view, sx, sy)
        if (
          !this.coalescing &&
          p.x === this.elbowDragging.start.x &&
          p.y === this.elbowDragging.start.y
        ) {
          return
        }
        const el = this.getElement(this.elbowDragging.id)
        if (el && el.kind === 'arrow' && el.elbow) {
          if (!this.coalescing) {
            this.pushUndo()
            this.coalescing = true
          }
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
      // 双指中一指抬起 → 退 pinch(pinch 期间已 clearInteractionState,单指态本就空,
      // 直接 return 不走下方 erasing/connecting/... 清理)。activePointers 仍留另一指,
      // 它若继续移动不再触发 pinch(单指),避免误 drag/pan。
      this.activePointers.delete(e.pointerId)
      if (this.pinch && this.activePointers.size < 2) {
        this.pinch = null
        return
      }
      if (this.erasing) {
        this.erasing = null
        try {
          this.canvas.releasePointerCapture(e.pointerId)
        } catch {
          /* 已释放 */
        }
        return
      }
      if (this.connecting) {
        const rect = this.canvas.getBoundingClientRect()
        const sx = e.clientX - rect.left
        const sy = e.clientY - rect.top
        const p = screenToPage(this.view, sx, sy)
        // 优先用 move 中跟踪的 toId(已排除 fromId);松手点可能再偏一点,用 card 容差兜底重算。
        // 用 getSortedElements()(层排序缓存)而非 getElements()(每次全量排序)。
        const toId =
          this.connecting.toId ??
          (() => {
            const hit = hitTestCardWithTolerance(this.getSortedElements(), p.x, p.y, this.view.zoom)
            return hit && hit !== this.connecting!.fromId ? hit : null
          })()
        if (toId) {
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
        // 单点(points<2)不建:commitFreedraw 对 1 点返 w=h=0 不可见不可选幽灵元素。
        if (this.currentStroke.points.length >= 2) {
          const id =
            'freedraw-' +
            (typeof crypto !== 'undefined' && 'randomUUID' in crypto
              ? crypto.randomUUID()
              : Math.random().toString(36).slice(2))
          this.upsert(commitFreedraw(id, this.currentStroke.points))
        }
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
      // curve/elbow 手柄拖拽:松手必须清,否则后续无按键 hover 会让箭头跟光标"闹鬼"
      // + 每次 hover 进 undo 栈(clearInteractionState 只在 setTool/restore/visibility 调,
      // onUp 路径不会经过)。onCancel 对这俩走 onUp,一并覆盖。
      this.curveDragging = null
      this.elbowDragging = null
    }
    // pointercancel:系统中断 pointer(浏览器手势/通知/触屏多点/OS 中断)时触发而非 up。
    // 对 drag/resize/erase/pan 等"清理型"态复用 onUp(只清状态,无副作用)。
    // 但 connect 态除外:onUp 会在 cancel 事件的坏坐标(常为 0 或中断点)上 hitTest,
    // 可能建出错箭头或落空致预览突消(v0.40 手测反馈"拖到一半消失")。connect 走丢弃路径:
    // 直接清 connecting,不 hitTest、不建箭头(取消即取消)。
    const onCancel = (e: PointerEvent) => {
      // 双指中一指被系统中断 → 退 pinch(不 return;后续 connecting/currentStroke 丢弃
      // 语义照常,activePointers 已 delete)。onUp 末尾的 delete 对已删 key 是 no-op。
      this.activePointers.delete(e.pointerId)
      if (this.pinch && this.activePointers.size < 2) {
        this.pinch = null
      }
      // connect:系统中断不在坏坐标判定(v0.40),直接丢弃。
      if (this.connecting) {
        this.connecting = null
        try {
          this.canvas.releasePointerCapture(e.pointerId)
        } catch {
          /* 已释放 */
        }
        this.scheduleRender()
        return
      }
      // freedraw:系统中断不 commit 半截笔画(v0.41,与 connect 同构)。
      // 旧逻辑走 onUp 会把 currentStroke commit 成残线元素(进 undo + 持久化)。
      if (this.currentStroke) {
        this.currentStroke = null
        try {
          this.canvas.releasePointerCapture(e.pointerId)
        } catch {
          /* 已释放 */
        }
        this.scheduleRender()
        return
      }
      onUp(e)
    }
    const onLost = (e: PointerEvent) => {
      if (this.activePointers.has(e.pointerId)) onCancel(e)
    }
    this.pointerHandlers = { down: onDown, move: onMove, up: onUp, cancel: onCancel, lost: onLost }
    this.canvas.addEventListener('pointerdown', onDown)
    this.canvas.addEventListener('pointermove', onMove)
    this.canvas.addEventListener('pointerup', onUp)
    this.canvas.addEventListener('pointercancel', onCancel)
    this.canvas.addEventListener('lostpointercapture', onLost)

    // visibilitychange:Tab 切走/页面失焦时浏览器不发 pointerup/cancel,交互态
    // (dragGroup/currentStroke/connecting/…)会残留,回来后首个 pointermove 用陈旧
    // 态造幽灵移动/误建箭头(v0.41 审计 P0,v0.40 同类根因)。页面隐藏时清全部交互态。
    this.visibilityHandler = () => {
      if (document.visibilityState === 'hidden') {
        this.clearInteractionState()
        // activePointers / pinch 不在 clearInteractionState 里清(startPinch 先填再用,
        // 全局清会坏 pinch);但 tab 隐藏时浏览器不发 up/cancel,丢失的指会在 activePointers
        // 留幽灵 → 回来后单指配对幽灵触发假 pinch 乱缩放。隐藏即视指针全失效,这里清。
        this.activePointers.clear()
        this.pinch = null
        this.scheduleRender()
      }
    }
    window.addEventListener('visibilitychange', this.visibilityHandler)

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
      // IME 组合态统一守卫:组合中(中文/日文输入候选)的任何键都不触发画布操作,
      // 否则 IME 的 Escape/方向键/Delete 会误清选区/误删/误移。undo/redo 分支内原有
      // 的 isComposing 守卫由此统一覆盖。
      if (e.isComposing) return
      // Escape:取消选区(通用画布习惯)。text/输入框已在上守卫排除。
      // 不 preventDefault:模态(CardDetailModal/DSL/Export)的 Escape 关闭守卫依赖
      // defaultPrevented 判断「我是不是最顶层」,adapter 的 preventDefault 会反向吞掉
      // 单层模态的 Escape(选中态开模态 → Escape 只清选区不关模态)。adapter 清选区
      // 无需阻止默认行为,去掉 preventDefault 让模态正常关(画布选区被清无害,模态已遮住)。
      if (e.key === 'Escape') {
        if (this.selectedIds.size === 0) return
        this.executeCommand({ type: 'clearSelection' })
        return
      }
      // modal 打开时(CardDetailModal/DSL/Export 等)画布 Delete/方向键/⌘Z/⌘A 全让位 ——
      // 否则 modal 里按 Delete 删文字会背后删画布的卡(focus trap 焦点在 close button,
      // inInput 守卫拦不住)。Escape 不挡(清选区无害,且 modal Esc 关闭依赖未 preventDefault)。
      // 同 page.tsx 的 modal 守卫选择器(ARIA 标准,引擎读 DOM 不违反零业务依赖)。
      if (typeof document !== 'undefined' && document.querySelector('[role="dialog"][aria-modal="true"]')) return
      // undo/redo/selectAll(守 isComposing——IME 组合态不 undo)
      const action = parseKeyboardAction(e)
      if (action) {
        if (e.isComposing) return
        e.preventDefault()
        this.executeCommand({ type: action })
        return
      }
      // Delete/Backspace(现有)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.selectedIds.size === 0) return
        e.preventDefault()
        this.executeCommand({ type: 'deleteSelection' })
        return
      }
      // 方向键微移
      const delta = arrowKeyDelta(e.key, e.shiftKey)
      if (delta) {
        if (this.selectedIds.size === 0) return
        e.preventDefault()
        this.executeCommand({
          type: 'nudgeSelection',
          dx: delta.dx,
          dy: delta.dy,
          history: e.repeat ? 'continue' : 'start',
        })
        return
      }
    }
    window.addEventListener('keydown', this.keyHandler)
    this.keyUpHandler = (e: KeyboardEvent) => {
      // 方向键松开 → 关 coalescing(本轮连续微移结束,后续操作正常推快照)。
      if (arrowKeyDelta(e.key, e.shiftKey) && this.coalescing) {
        this.executeCommand({ type: 'endHistoryGroup' })
      }
    }
    window.addEventListener('keyup', this.keyUpHandler)
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
    // 取消排队的渲染帧:切画布/卸载时若有一帧 RAF 正排队(刚 upsert/commit),回调会
    // 持有 adapter 闭包 + canvas DOM 引用,对已卸载 canvas 做无意义重绘。每次切画布
    // 确定性发生,累积泄漏。对照 minimap 卸载 cancel rafRef 的同类清理。
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    if (this.pointerHandlers) {
      this.canvas.removeEventListener('pointerdown', this.pointerHandlers.down)
      this.canvas.removeEventListener('pointermove', this.pointerHandlers.move)
      this.canvas.removeEventListener('pointerup', this.pointerHandlers.up)
      this.canvas.removeEventListener('pointercancel', this.pointerHandlers.cancel)
      this.canvas.removeEventListener('lostpointercapture', this.pointerHandlers.lost)
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
    if (this.keyUpHandler) {
      window.removeEventListener('keyup', this.keyUpHandler)
      this.keyUpHandler = null
    }
    if (this.visibilityHandler) {
      window.removeEventListener('visibilitychange', this.visibilityHandler)
      this.visibilityHandler = null
    }
    this.clearInteractionState()
    this.activePointers.clear()
    this.pinch = null
  }

  private snapCoord(n: number): number {
    if (this.view.gridMode !== 'snap') return Math.round(n)
    return Math.round(n / SelfBuiltAdapter.GRID) * SelfBuiltAdapter.GRID
  }

  /** 供后续 Task(渲染/交互)读取相机。 */
  protected getViewInternal(): CanvasView {
    return this.view
  }
}
