/** T4 workbench-store：open/close/getCardId + subscribe 通知。 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  workbenchStore,
  subscribe,
  getSnapshotWorkbench,
} from '../workbench-store'

// 直接读 store 当前快照(getSnapshotWorkbench 是为测试桥导出的)
function useWorkbenchSnapshot() {
  return getSnapshotWorkbench()
}

describe('workbenchStore', () => {
  beforeEach(() => workbenchStore.close())

  it('open 设 cardId', () => {
    workbenchStore.open('c1')
    expect(workbenchStore.getCardId()).toBe('c1')
  })

  it('close 清空', () => {
    workbenchStore.open('c1')
    workbenchStore.close()
    expect(workbenchStore.getCardId()).toBeNull()
  })

  it('已关时 close 无副作用', () => {
    expect(() => workbenchStore.close()).not.toThrow()
    expect(workbenchStore.getCardId()).toBeNull()
  })

  it('open 替换上一个 cardId', () => {
    workbenchStore.open('c1')
    workbenchStore.open('c2')
    expect(workbenchStore.getCardId()).toBe('c2')
  })

  it('open 同一 cardId 不重复通知', () => {
    let calls = 0
    const unsub = subscribe(() => {
      calls++
    })
    workbenchStore.open('c1')
    const firstCalls = calls
    workbenchStore.open('c1') // 同 id，不 notify
    expect(calls).toBe(firstCalls)
    unsub()
  })

  it('open/close 触发 subscribe 通知', () => {
    let calls = 0
    const unsub = subscribe(() => {
      calls++
    })
    workbenchStore.open('c1')
    workbenchStore.close()
    expect(calls).toBeGreaterThanOrEqual(2)
    unsub()
  })
})

describe('workbenchStore focusEdit', () => {
  beforeEach(() => {
    // 确保干净起点:close 复位
    workbenchStore.close()
  })

  it('setFocusEdit flips focusEdit when dock open', () => {
    workbenchStore.open('cardA' as never)
    expect(useWorkbenchSnapshot().focusEdit).toBe(false)
    workbenchStore.setFocusEdit(true)
    expect(useWorkbenchSnapshot().focusEdit).toBe(true)
    workbenchStore.setFocusEdit(false)
    expect(useWorkbenchSnapshot().focusEdit).toBe(false)
  })

  it('setFocusEdit is no-op when no card open (dock closed)', () => {
    // 没开 dock 时不能进专注(无处编辑)
    workbenchStore.setFocusEdit(true)
    expect(useWorkbenchSnapshot().focusEdit).toBe(false)
  })

  it('open(new card) resets focusEdit to false', () => {
    workbenchStore.open('cardA' as never)
    workbenchStore.setFocusEdit(true)
    workbenchStore.open('cardB' as never) // 切卡 → 退出专注
    expect(useWorkbenchSnapshot().focusEdit).toBe(false)
  })

  it('close resets focusEdit to false', () => {
    workbenchStore.open('cardA' as never)
    workbenchStore.setFocusEdit(true)
    workbenchStore.close()
    expect(useWorkbenchSnapshot().focusEdit).toBe(false)
  })
})
