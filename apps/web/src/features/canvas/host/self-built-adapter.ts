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

export class SelfBuiltAdapter implements CanvasHost {
  private elements = new Map<string, CanvasElement>()
  private view: CanvasView = { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }
  private userListeners = new Set<(c: UserChange) => void>()
  protected echoing = true
  protected ctx: CanvasRenderingContext2D | null

  constructor(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')
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
  }

  remove(id: string): void {
    if (!this.elements.has(id)) return
    this.elements.delete(id)
    if (this.echoing) this.emitUser({ updated: [], removed: [id] })
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
  }

  protected emitUser(c: UserChange): void {
    for (const l of this.userListeners) l(c)
  }

  /** 供后续 Task(渲染/交互)读取相机。 */
  protected getViewInternal(): CanvasView {
    return this.view
  }
}
