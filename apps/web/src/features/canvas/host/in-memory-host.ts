'use client'

import type { CanvasElement, CanvasHost, CanvasView, UserChange } from './canvas-host'

/**
 * InMemoryCanvasHost — 纯内存 CanvasHost,单测用,无 tldraw 依赖。
 *
 * 它是「契约基准」:`canvas-host.contract.test.ts` 的 runContract 对它跑一遍,
 * 确认接口契约自洽;Task 2 后同一套契约再对 TldrawAdapter 跑(e2e),
 * Phase 1 对 SelfBuiltAdapter 跑——任何实现都得过同一套。
 */
export class InMemoryCanvasHost implements CanvasHost {
  private elements = new Map<string, CanvasElement>()
  private view: CanvasView = { panX: 0, panY: 0, zoom: 1, gridMode: 'free' }
  private listeners = new Set<(c: UserChange) => void>()
  private echoing = true

  getElements(): CanvasElement[] {
    return [...this.elements.values()]
  }

  getElement(id: string): CanvasElement | undefined {
    return this.elements.get(id)
  }

  private selectedIds = new Set<string>()
  getSelectedIds(): string[] {
    return [...this.selectedIds]
  }
  /** 测试辅助:设置选中(契约测试/导出测试用)。 */
  setSelectedIds(ids: string[]): void {
    this.selectedIds = new Set(ids)
  }

  upsert(el: CanvasElement): void {
    this.elements.set(el.id, el)
    if (this.echoing) this.emit({ updated: [el], removed: [] })
  }

  remove(id: string): void {
    if (!this.elements.has(id)) return
    this.elements.delete(id)
    if (this.echoing) this.emit({ updated: [], removed: [id] })
  }

  batch(fn: () => void): void {
    // fake 无 undo 分组;真实 adapter 这里包一个 undo 步。
    fn()
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
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  getView(): CanvasView {
    return { ...this.view }
  }

  setView(v: CanvasView): void {
    this.view = { ...v }
  }

  private emit(c: UserChange): void {
    for (const l of this.listeners) l(c)
  }
}
