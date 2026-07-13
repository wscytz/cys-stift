'use client'

import { useSyncExternalStore } from 'react'

/**
 * workbench-store — 工作台的当前编辑 cardId。
 *
 * 照搬 graph-view-store 的 useSyncExternalStore 单例范式，但**不落 localStorage**：
 * 工作台是会话态的临时编辑，关页/刷新即重置（与持久化无关）。
 *
 * WorkbenchPanel 本身是受控组件（page 传 card + onSave + onClose）；
 * 这个 store 只回答「工作台当前编辑的是哪张卡」。
 */

interface WorkbenchState {
  cardId: string | null
}

let _state: WorkbenchState = { cardId: null }
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
  /** 设当前编辑卡。 */
  open(cardId: string): void {
    if (_state.cardId === cardId) return
    _state = { cardId }
    notify()
  },
  /** 清当前编辑卡。 */
  close(): void {
    if (_state.cardId === null) return
    _state = { cardId: null }
    notify()
  },
  /** 当前编辑的卡 id（null = 无）。 */
  getCardId(): string | null {
    return _state.cardId
  },
}

/** 订阅工作台状态（cardId）。SSR 安全（server 快照 = 初始 null）。 */
export function useWorkbench(): { cardId: string | null } {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
