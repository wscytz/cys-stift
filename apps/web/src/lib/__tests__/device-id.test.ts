import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getDeviceId } from '../device-id'

const STORAGE_KEY = 'cys-stift.device-id.v1'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

beforeEach(() => {
  vi.resetModules()
  window.localStorage.clear()
})

describe('getDeviceId', () => {
  it('SSR(window 未定义)返回 "ssr"', async () => {
    const originalWindow = globalThis.window
    // @ts-expect-error — 模拟 SSR
    delete globalThis.window
    try {
      vi.resetModules()
      const { getDeviceId } = await import('../device-id')
      expect(getDeviceId()).toBe('ssr')
    } finally {
      globalThis.window = originalWindow
    }
  })

  it('首次调用生成 UUID v4 并持久化到 localStorage', () => {
    const id = getDeviceId()
    expect(UUID_RE.test(id)).toBe(true)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(id)
  })

  it('稳定:同一 profile 重复调用返回同一个 id', () => {
    const a = getDeviceId()
    const b = getDeviceId()
    const c = getDeviceId()
    expect(b).toBe(a)
    expect(c).toBe(a)
  })

  it('localStorage 已有值 → 返回已存的(不重新生成)', () => {
    window.localStorage.setItem(STORAGE_KEY, 'preset-id')
    expect(getDeviceId()).toBe('preset-id')
  })

  it('localStorage 不可用(catch)→ 返回一个合法 UUID(会话级)', () => {
    // 让 getItem 抛错,触发 catch 分支
    const spy = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    const id = getDeviceId()
    expect(UUID_RE.test(id)).toBe(true)
    spy.mockRestore()
  })
})
