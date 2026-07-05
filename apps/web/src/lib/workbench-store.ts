'use client'

import { useSyncExternalStore } from 'react'

/**
 * workbench-store — 工作台 dock 面板的开/关 + 当前 cardId（D2）。
 *
 * 照搬 graph-view-store 的 useSyncExternalStore 单例范式，但**不落 localStorage**：
 * 工作台是画布本地的临时编辑态，关画布/刷新即重置（与持久化无关）。
 *
 * WorkbenchPanel 本身是受控组件（page 传 card + onSave + onClose）；
 * 这个 store 只回答「工作台是否打开 / 开的是哪张卡」。
 */

interface WorkbenchState {
  cardId: string | null
  /** 专注编辑态(工作台撑满 + 画布缩预览)。会话态不持久;切卡/关 dock 复位。 */
  focusEdit: boolean
}

let _state: WorkbenchState = { cardId: null, focusEdit: false }
let _cachedSnapshot: WorkbenchState = _state
const _subscribers = new Set<() => void>()

function notify(): void {
  for (const sub of _subscribers) sub()
}

function getSnapshot(): WorkbenchState {
  if (_cachedSnapshot !== _state) _cachedSnapshot = _state
  return _cachedSnapshot
}

function getServerSnapshot(): WorkbenchState {
  return _cachedSnapshot
}

/** 测试桥:读当前快照(供 workbench-store.test.ts 用,同 db-client 范式)。 */
export function getSnapshotWorkbench(): WorkbenchState {
  return getSnapshot()
}

export function subscribe(cb: () => void): () => void {
  _subscribers.add(cb)
  return () => {
    _subscribers.delete(cb)
  }
}

export const workbenchStore = {
  /** 展开工作台到指定卡。切卡时 focusEdit 复位(spec:专注不跨卡继承)。 */
  open(cardId: string): void {
    if (_state.cardId === cardId) return
    // 切卡 → focusEdit 复位 false
    _state = { cardId, focusEdit: false }
    notify()
  },
  /** 收起工作台。 */
  close(): void {
    if (_state.cardId === null) return
    _state = { cardId: null, focusEdit: false }
    notify()
  },
  /** 进入/退出专注编辑态。没开 dock 时是 no-op(无处编辑)。 */
  setFocusEdit(value: boolean): void {
    // 没开 dock 不能进专注(无处编辑)
    if (_state.cardId === null) return
    if (_state.focusEdit === value) return
    _state = { ..._state, focusEdit: value }
    notify()
  },
  /** 当前展开的卡 id（null = 未展开）。 */
  getCardId(): string | null {
    return _state.cardId
  },
}

/** 订阅工作台状态（cardId + focusEdit）。SSR 安全（server 快照 = 初始 null/false）。 */
export function useWorkbench(): { cardId: string | null; focusEdit: boolean } {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
