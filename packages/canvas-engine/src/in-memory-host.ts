
import { sortByLayer, sanitizeView } from './canvas-host'
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
  private historyListeners = new Set<() => void>()
  private echoing = true
  /** coalescing=true 期间,echo 的 upsert/remove 不推快照(连续操作合并为 1 undo 步)。
   *  batch() 用此门控实现分组(对齐 SelfBuiltAdapter)。 */
  private coalescing = false
  /** 最小 undo 栈:每个 echoed upsert/remove 前推一份快照(供测试 host.undo)。 */
  private undoStack: CanvasElement[][] = []
  private redoStack: CanvasElement[][] = []

  getElements(): CanvasElement[] {
    // 确定性 z 序:按 KIND_LAYER 稳定排序(见 canvas-host),与 SelfBuiltAdapter 一致。
    return sortByLayer([...this.elements.values()])
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
    if (this.echoing && !this.coalescing) this.pushUndo()
    this.elements.set(el.id, el)
    if (this.echoing) this.emit({ updated: [el], removed: [] })
  }

  remove(id: string): void {
    if (!this.elements.has(id)) return
    if (this.echoing && !this.coalescing) this.pushUndo()
    this.elements.delete(id)
    // 级联删悬空关系箭头(from/to 指向被删 id),与 SelfBuiltAdapter 同契约 ——
    // 否则 AI 用 InMemoryHost 预演删 card 的 after 状态含悬空 arrow,真实 apply
    // (SelfBuilt)会删 arrow,预演与实际不符。
    const removed: string[] = [id]
    for (const [eid, el] of this.elements) {
      if (el.kind === 'arrow' && (el.from === id || el.to === id)) {
        this.elements.delete(eid)
        removed.push(eid)
      }
    }
    if (this.echoing) this.emit({ updated: [], removed })
  }

  /** 测试用最小 undo:恢复栈顶快照,清 redo,广播 onHistoryChange。 */
  undo(): void {
    const prev = this.undoStack.pop()
    if (!prev) return
    this.redoStack.push(this.snapshot())
    this.restore(prev)
    this.emitHistory()
  }

  /** 测试用最小 redo:对称的 undo 反操作。 */
  redo(): void {
    const next = this.redoStack.pop()
    if (!next) return
    this.undoStack.push(this.snapshot())
    this.restore(next)
    this.emitHistory()
  }

  private snapshot(): CanvasElement[] {
    // meta 深拷贝 points:freedraw 的 points 是 [number,number][] 嵌套数组,
    // 浅拷贝({ ...el })会让快照与 live 元素共享同一内层数组 —— 之后 live 元素的
    // 原地改动会污染快照,undo 回滚恢复的是被改过的点序列(时序炸弹)。与
    // SelfBuiltAdapter.snapshot 同契约,深拷贝 points。
    return [...this.elements.values()].map((el) => {
      if (!el.meta) return { ...el, meta: undefined }
      const m = el.meta as { points?: unknown }
      if (Array.isArray(m.points)) {
        return {
          ...el,
          meta: {
            ...el.meta,
            points: (m.points as [number, number][]).map((p) => [...p] as [number, number]),
          },
        }
      }
      return { ...el, meta: { ...el.meta } }
    })
  }

  private pushUndo(): void {
    this.undoStack.push(this.snapshot())
    // 与 SelfBuiltAdapter 同契约:undo 栈有上限,防止长会话内存线性增长
    // (每个快照深拷贝全部元素)。SelfBuiltAdapter UNDO_LIMIT=50,此处对齐。
    if (this.undoStack.length > 50) this.undoStack.shift()
    this.redoStack = []
    // 与 SelfBuiltAdapter 同契约:pushUndo / undo / redo 都广播 onHistoryChange
    // (真实 adapter 上每个 echoed 编辑都会 pushUndo → 广播,故此处也广播,
    //  让 InMemoryCanvasHost 能测到「正常编辑触发 reconcile 但幂等 no-op」)。
    this.emitHistory()
  }

  private restore(snap: CanvasElement[]): void {
    this.elements = new Map(snap.map((el) => [el.id, { ...el }]))
    // 选区同步(对齐 SelfBuiltAdapter.restore):undo/redo 可能让被选中的元素消失
    // (撤掉 upsert),残留的幽灵 id 会让后续操作取到 undefined → 静默失效。过滤掉
    // 快照里不存在的 id;若选区实际变了才 emit(跟 setSelectedIds 一致,避免多余事件)。
    const live = new Set(snap.map((e) => e.id))
    const filtered = new Set([...this.selectedIds].filter((id) => live.has(id)))
    if (
      filtered.size !== this.selectedIds.size ||
      [...filtered].some((id) => !this.selectedIds.has(id))
    ) {
      this.selectedIds = filtered
      const selSnapshot = [...this.selectedIds]
      for (const l of this.selectionListeners) l(selSnapshot)
    }
  }

  private emitHistory(): void {
    for (const l of this.historyListeners) l()
  }

  onHistoryChange(cb: () => void): () => void {
    this.historyListeners.add(cb)
    return () => {
      this.historyListeners.delete(cb)
    }
  }

  batch(fn: () => void): void {
    // undo 分组(对齐 SelfBuiltAdapter.batch):批前推一次快照,批内所有变更合并为
    // 1 undo 步。嵌套 batch 不重复推(用 wasCoalescing 门控)。批内 upsert/remove 因
    // coalescing=true 不再各自推快照。
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
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  getView(): CanvasView {
    return { ...this.view }
  }

  setView(v: CanvasView): void {
    // 与 SelfBuiltAdapter 同契约:净化脏 view(zoom 钳 + 非有限值兜底)。
    this.view = sanitizeView(v)
    for (const l of this.viewListeners) l(this.view)
  }

  onViewChange(cb: (v: CanvasView) => void): () => void {
    this.viewListeners.add(cb)
    return () => {
      this.viewListeners.delete(cb)
    }
  }

  /** 测试用 host 无 undo 历史;返回 [] 让 diff UI 走「无历史」分支。 */
  getHistory(): CanvasElement[][] {
    return []
  }

  private emit(c: UserChange): void {
    for (const l of this.listeners) l(c)
  }
}
