/** T4 workbench-store：open/close/getCardId + subscribe 通知。 */
import { describe, it, expect, beforeEach } from 'vitest'
import { workbenchStore, subscribe } from '../workbench-store'

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
