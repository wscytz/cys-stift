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
  origin: string | null
}

let _state: WorkbenchState = { cardId: null, origin: null }
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
  /** 设当前编辑卡，并记录来源路由，供返回动作恢复用户上下文。 */
  open(cardId: string, origin?: string): void {
    const nextOrigin = origin ?? _state.origin
    if (_state.cardId === cardId && _state.origin === nextOrigin) return
    _state = { cardId, origin: nextOrigin ?? null }
    notify()
  },
  /** 清当前编辑卡。 */
  close(): void {
    if (_state.cardId === null) return
    _state = { cardId: null, origin: _state.origin }
    notify()
  },
  /** 当前编辑的卡 id（null = 无）。 */
  getCardId(): string | null {
    return _state.cardId
  },
  getOrigin(): string | null {
    return _state.origin
  },
  /** 仅记录进入工作台的来源，不改变当前卡片。 */
  setOrigin(origin: string): void {
    if (_state.origin === origin) return
    _state = { ..._state, origin }
    notify()
  },
}

/** 订阅工作台状态（cardId）。SSR 安全（server 快照 = 初始 null）。 */
export function useWorkbench(): { cardId: string | null; origin: string | null } {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
