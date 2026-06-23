
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
import { commitFreedraw } from './self-built-freedraw'
import { handleAtPoint, resizeGeometry, type Handle } from './self-built-resize'
import { marqueeSelect } from './self-built-marquee'
import { arrowPreviewEndpoints } from './self-built-arrow'
import { arrowKeyDelta, selectAllIds, parseKeyboardAction } from './self-built-keyboard'

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
  private dragId: string | null = null
  private dragOffset = { x: 0, y: 0 }
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
    renderElements(
      ctx,
      [...this.getElements(), ...preview],
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
    if (this.echoing) this.emitUser({ updated: [], removed: [id] })
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
    // 切工具时放弃进行中的笔画
    if (t !== 'freedraw' && this.currentStroke) {
      this.currentStroke = null
      this.scheduleRender()
    }
  }

  getTool(): 'select' | 'freedraw' | 'text' | 'connect' {
    return this.activeTool
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
    return this.getElements().map((e) => ({ ...e, meta: e.meta ? { ...e.meta } : undefined }))
  }

  canUndo(): boolean {
    return this.undoStack.length > 0
  }

  canRedo(): boolean {
    return this.redoStack.length > 0
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

  /** 用快照替换所有元素(不进栈、不触发 onUserChange)。 */
  private restore(snapshot: CanvasElement[]): void {
    this.applyWithoutEcho(() => {
      this.elements.clear()
      for (const el of snapshot) this.elements.set(el.id, el)
    })
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
        const id = hitTest(this.getElements(), p.x, p.y)
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
        const hitId = hitTest(this.getElements(), p.x, p.y)
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
      // resize handle 优先:选中元素的四角(仅 select 模式)
      if (this.activeTool === 'select' && this.selectedIds.size > 0) {
        const selId = [...this.selectedIds][0]!
        const sel = this.getElement(selId)
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
      const id = hitTest(this.getElements(), p.x, p.y)
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
        this.dragId = id // 兼容现有 onMove 的 dragId 检查;onMove 优先用 dragGroup
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
          this.upsert({ ...el, x: g.x, y: g.y, w: g.w, h: g.h })
        }
        return
      }
      if (this.dragGroup) {
        const p = screenToPage(this.view, sx, sy)
        for (const sid of this.dragGroup.ids) {
          const el = this.getElement(sid)
          const off = this.dragGroup.offsets.get(sid)
          if (el && off) this.upsert({ ...el, x: Math.round(p.x - off.x), y: Math.round(p.y - off.y) })
        }
        return
      }
      if (this.dragId) {
        const p = screenToPage(this.view, sx, sy)
        const el = this.getElement(this.dragId)
        if (el) {
          this.upsert({
            ...el,
            x: Math.round(p.x - this.dragOffset.x),
            y: Math.round(p.y - this.dragOffset.y),
          })
        }
      } else if (this.panning) {
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
        const toId = hitTest(this.getElements(), p.x, p.y)
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
      if (this.dragId || this.panning) {
        try {
          this.canvas.releasePointerCapture(e.pointerId)
        } catch {
          /* 已释放 */
        }
      }
      this.dragId = null
      this.dragGroup = null
      this.panning = null
    }
    this.pointerHandlers = { down: onDown, move: onMove, up: onUp }
    this.canvas.addEventListener('pointerdown', onDown)
    this.canvas.addEventListener('pointermove', onMove)
    this.canvas.addEventListener('pointerup', onUp)

    // 滚轮 → zoom-to-cursor
    this.wheelHandler = (e: WheelEvent) => {
      e.preventDefault()
      const rect = this.canvas.getBoundingClientRect()
      this.onWheel(e.clientX - rect.left, e.clientY - rect.top, e.deltaY)
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
          if (el) this.upsert({ ...el, x: el.x + delta.dx, y: el.y + delta.dy })
        }
      }
    }
    window.addEventListener('keydown', this.keyHandler)
  }

  /**
   * 滚轮缩放:以 (sx,sy) 为锚点的 zoom-to-cursor。
   * zoom 钳制 [0.1, 8];pan 补偿使 cursor 下的页坐标在缩放前后不变。
   */
  onWheel(sx: number, sy: number, delta: number): void {
    const factor = delta < 0 ? 1.1 : 1 / 1.1
    const nextZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.view.zoom * factor))
    // zoom-to-cursor: cursor 下的页坐标缩放前后不变。
    //   pageBefore = (sx - panX) / zoom;  pageAfter = (sx - panX') / nextZoom
    //   → panX' = sx - pageBefore * nextZoom
    const pageX = (sx - this.view.panX) / this.view.zoom
    const pageY = (sy - this.view.panY) / this.view.zoom
    const panX = sx - pageX * nextZoom
    const panY = sy - pageY * nextZoom
    this.setView({ ...this.view, zoom: nextZoom, panX, panY })
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
