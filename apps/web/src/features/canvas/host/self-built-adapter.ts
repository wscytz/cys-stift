'use client'

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
import { renderElements, readToken, drawSelectionOutlines } from './self-built-render'
import { hitTest, screenToPage } from './self-built-hittest'
import { commitFreedraw } from './self-built-freedraw'
import { handleAtPoint, resizeGeometry, type Handle } from './self-built-resize'

export class SelfBuiltAdapter implements CanvasHost {
  private elements = new Map<string, CanvasElement>()
  private view: CanvasView = { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }
  private userListeners = new Set<(c: UserChange) => void>()
  protected echoing = true
  protected ctx: CanvasRenderingContext2D | null
  private getCardLabel: (id: string) => string
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
  private activeTool: 'select' | 'freedraw' | 'text' = 'select'
  private currentStroke: { points: [number, number][] } | null = null
  private selectedIds = new Set<string>()
  private resizing: { id: string; handle: Handle; start: { x: number; y: number; w: number; h: number } } | null = null
  private keyHandler: ((e: KeyboardEvent) => void) | null = null

  constructor(
    private canvas: HTMLCanvasElement,
    opts?: { getCardLabel?: (id: string) => string },
  ) {
    this.ctx = canvas.getContext('2d')
    this.getCardLabel = opts?.getCardLabel ?? (() => '')
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
      this.getCardLabel,
      readToken('--color-canvas', '#f8fafc'),
    )
    drawSelectionOutlines(ctx, this.getSelectedIds(), this.getElements(), this.view)
  }

  getElements(): CanvasElement[] {
    return [...this.elements.values()]
  }

  getElement(id: string): CanvasElement | undefined {
    return this.elements.get(id)
  }

  upsert(el: CanvasElement): void {
    this.elements.set(el.id, el)
    if (this.echoing) this.emitUser({ updated: [el], removed: [] })
    this.scheduleRender()
  }

  remove(id: string): void {
    if (!this.elements.has(id)) return
    this.elements.delete(id)
    if (this.echoing) this.emitUser({ updated: [], removed: [id] })
    this.scheduleRender()
  }

  batch(fn: () => void): void {
    fn // TODO(Phase 1 后续):undo 分组
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

  /** 切换工具(渲染器自身方法,不上 CanvasHost 接口)。 */
  setTool(t: 'select' | 'freedraw' | 'text'): void {
    this.activeTool = t
    // 切工具时放弃进行中的笔画
    if (t !== 'freedraw' && this.currentStroke) {
      this.currentStroke = null
      this.scheduleRender()
    }
  }

  getTool(): 'select' | 'freedraw' | 'text' {
    return this.activeTool
  }

  /** 当前选中元素 id(渲染器自身状态,不上 CanvasHost)。 */
  getSelectedIds(): string[] {
    return [...this.selectedIds]
  }

  setSelectedIds(ids: string[]): void {
    this.selectedIds = new Set(ids)
    this.scheduleRender()
  }

  getView(): CanvasView {
    return { ...this.view }
  }

  setView(v: CanvasView): void {
    this.view = { ...v }
    this.scheduleRender()
  }

  protected emitUser(c: UserChange): void {
    for (const l of this.userListeners) l(c)
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
      // resize handle 优先:选中元素的四角(仅 select 模式)
      if (this.activeTool === 'select' && this.selectedIds.size > 0) {
        const selId = [...this.selectedIds][0]!
        const sel = this.getElement(selId)
        if (sel) {
          const handle = handleAtPoint(sel, p, this.view.zoom)
          if (handle) {
            this.resizing = { id: selId, handle, start: { x: sel.x, y: sel.y, w: sel.w, h: sel.h } }
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
        this.dragId = id
        this.dragOffset = { x: p.x - el.x, y: p.y - el.y }
        this.setSelectedIds([id]) // 命中即选中(单选替换)
      } else {
        // 空白处 mousedown → pan 模式 + 清选择
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
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (this.activeTool === 'text') return // 文本编辑中不删
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return // 焦点在输入框不删
      if (this.selectedIds.size === 0) return
      e.preventDefault()
      const ids = [...this.selectedIds]
      this.setSelectedIds([])
      for (const id of ids) this.remove(id) // echo → onUserChange
    }
    window.addEventListener('keydown', this.keyHandler)
  }

  /**
   * 滚轮缩放:以 (sx,sy) 为锚点的 zoom-to-cursor。
   * zoom 钳制 [0.1, 8];pan 补偿使 cursor 下的页坐标在缩放前后不变。
   */
  onWheel(sx: number, sy: number, delta: number): void {
    const factor = delta < 0 ? 1.1 : 1 / 1.1
    const nextZoom = Math.min(8, Math.max(0.1, this.view.zoom * factor))
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
