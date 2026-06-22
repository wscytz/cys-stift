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
import { renderElements, readToken } from './self-built-render'
import { hitTest, screenToPage } from './self-built-hittest'

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
  private pointerHandlers: {
    down: (e: PointerEvent) => void
    move: (e: PointerEvent) => void
    up: (e: PointerEvent) => void
  } | null = null

  constructor(
    private canvas: HTMLCanvasElement,
    opts?: { getCardLabel?: (id: string) => string },
  ) {
    this.ctx = canvas.getContext('2d')
    this.getCardLabel = opts?.getCardLabel ?? (() => '')
    this.attachPointer()
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
    renderElements(ctx, this.getElements(), this.view, w, h, this.getCardLabel, readToken('--color-canvas', '#f8fafc'))
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
      const rect = this.canvas.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const p = screenToPage(this.view, sx, sy)
      const id = hitTest(this.getElements(), p.x, p.y)
      if (id) {
        const el = this.getElement(id)!
        this.dragId = id
        this.dragOffset = { x: p.x - el.x, y: p.y - el.y }
        this.canvas.setPointerCapture(e.pointerId)
      }
      // 空白处 mousedown:pan 在 Task 4 加(T1.3 不做)。
    }
    const onMove = (e: PointerEvent) => {
      if (!this.dragId) return
      const rect = this.canvas.getBoundingClientRect()
      const p = screenToPage(this.view, e.clientX - rect.left, e.clientY - rect.top)
      const el = this.getElement(this.dragId)
      if (!el) return
      this.upsert({
        ...el,
        x: Math.round(p.x - this.dragOffset.x),
        y: Math.round(p.y - this.dragOffset.y),
      })
    }
    const onUp = (e: PointerEvent) => {
      if (this.dragId) {
        try {
          this.canvas.releasePointerCapture(e.pointerId)
        } catch {
          /* 已释放 */
        }
        this.dragId = null
      }
    }
    this.pointerHandlers = { down: onDown, move: onMove, up: onUp }
    this.canvas.addEventListener('pointerdown', onDown)
    this.canvas.addEventListener('pointermove', onMove)
    this.canvas.addEventListener('pointerup', onUp)
  }

  /** 解绑指针监听(页面卸载调;为 T1.4 的 wheel 解绑铺垫)。 */
  detach(): void {
    if (this.pointerHandlers) {
      this.canvas.removeEventListener('pointerdown', this.pointerHandlers.down)
      this.canvas.removeEventListener('pointermove', this.pointerHandlers.move)
      this.canvas.removeEventListener('pointerup', this.pointerHandlers.up)
      this.pointerHandlers = null
    }
  }

  /** 供后续 Task(渲染/交互)读取相机。 */
  protected getViewInternal(): CanvasView {
    return this.view
  }
}
