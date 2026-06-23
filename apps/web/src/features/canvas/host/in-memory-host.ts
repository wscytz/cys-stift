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
  private selectionListeners = new Set<(ids: string[]) => void>()
  private viewListeners = new Set<(v: CanvasView) => void>()
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
  /** 测试辅助:设置选中(契约测试/导出测试用)。实际变化时触发 onSelectionChange。 */
  setSelectedIds(ids: string[]): void {
    const next = new Set(ids)
    const changed =
      next.size !== this.selectedIds.size ||
      [...next].some((id) => !this.selectedIds.has(id))
    this.selectedIds = next
    if (changed) {
      const snapshot = [...this.selectedIds]
      for (const l of this.selectionListeners) l(snapshot)
    }
  }

  onSelectionChange(cb: (ids: string[]) => void): () => void {
    this.selectionListeners.add(cb)
    return () => {
      this.selectionListeners.delete(cb)
    }
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
    for (const l of this.viewListeners) l(this.view)
  }

  onViewChange(cb: (v: CanvasView) => void): () => void {
    this.viewListeners.add(cb)
    return () => {
      this.viewListeners.delete(cb)
    }
  }

  private emit(c: UserChange): void {
    for (const l of this.listeners) l(c)
  }
}
