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

export function subscribe(cb: () => void): () => void {
  _subscribers.add(cb)
  return () => {
    _subscribers.delete(cb)
  }
}

export const workbenchStore = {
  /** 展开工作台到指定卡。 */
  open(cardId: string): void {
    if (_state.cardId === cardId) return
    _state = { cardId }
    notify()
  },
  /** 收起工作台。 */
  close(): void {
    if (_state.cardId === null) return
    _state = { cardId: null }
    notify()
  },
  /** 当前展开的卡 id（null = 未展开）。 */
  getCardId(): string | null {
    return _state.cardId
  },
}

/** 订阅工作台状态（cardId）。SSR 安全（server 快照 = 初始 null）。 */
export function useWorkbench(): { cardId: string | null } {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
