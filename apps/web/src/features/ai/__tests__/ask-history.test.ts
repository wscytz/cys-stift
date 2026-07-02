import { describe, it, expect, beforeEach } from 'vitest'
import type { CanvasId } from '@cys-stift/domain'
import {
  ASK_CHAT_KEY,
  loadAskHistory,
  saveAskHistory,
  clearAskHistory,
  type PersistedAskMessage,
} from '../ask-history'

beforeEach(() => {
  window.localStorage.clear()
})

const CID = 'cv-1' as CanvasId
const MSGS: PersistedAskMessage[] = [
  { role: 'user', content: '帮我整理画布' },
  { role: 'assistant', content: '好的', dslBlocks: ['```cys-dsl\n[update card]\n```'], targetCanvasId: CID },
]

describe('ASK_CHAT_KEY', () => {
  it('is the global ask-chat key with version suffix', () => {
    expect(ASK_CHAT_KEY).toBe('cys-stift.ask-chat.v1')
  })
})

describe('loadAskHistory', () => {
  it('returns empty array when key missing', () => {
    expect(loadAskHistory()).toEqual([])
  })

  it('round-trips messages saved by saveAskHistory', () => {
    expect(saveAskHistory(MSGS)).toBe(true)
    expect(loadAskHistory()).toEqual(MSGS)
  })

  it('returns empty array on corrupt JSON', () => {
    window.localStorage.setItem(ASK_CHAT_KEY, '{not json')
    expect(loadAskHistory()).toEqual([])
  })

  it('returns empty array when stored value is not an array', () => {
    window.localStorage.setItem(ASK_CHAT_KEY, JSON.stringify({ role: 'user' }))
    expect(loadAskHistory()).toEqual([])
  })

  it('drops malformed entries but keeps valid ones', () => {
    const mixed = [
      { role: 'user', content: 'ok' },
      { role: 'bad-role', content: 'x' },
      { role: 'assistant', content: 123 },
      null,
      { role: 'assistant', content: 'fine' },
    ]
    window.localStorage.setItem(ASK_CHAT_KEY, JSON.stringify(mixed))
    expect(loadAskHistory()).toEqual([
      { role: 'user', content: 'ok' },
      { role: 'assistant', content: 'fine' },
    ])
  })

  it('persists dslBlocks + targetCanvasId; streaming normalized to false on load', () => {
    saveAskHistory([
      { role: 'assistant', content: '...', dslBlocks: ['x'], streaming: true, targetCanvasId: CID },
    ])
    expect(loadAskHistory()).toEqual([
      { role: 'assistant', content: '...', dslBlocks: ['x'], streaming: false, targetCanvasId: CID },
    ])
  })
})

describe('saveAskHistory', () => {
  it('writes JSON to localStorage under the global key', () => {
    saveAskHistory(MSGS)
    expect(window.localStorage.getItem(ASK_CHAT_KEY)).toBe(JSON.stringify(MSGS))
  })

  it('caps stored messages to the most recent 100', () => {
    const big: PersistedAskMessage[] = Array.from({ length: 120 }, (_, i) => ({
      role: 'user' as const,
      content: String(i),
    }))
    saveAskHistory(big)
    const stored = JSON.parse(window.localStorage.getItem(ASK_CHAT_KEY) ?? '[]') as PersistedAskMessage[]
    expect(stored).toHaveLength(100)
    // 保留最近 100 条(丢最早的 20 条:0..19)
    expect(stored[0]!.content).toBe('20')
    expect(stored[99]!.content).toBe('119')
  })

  it('returns false (and does not throw) on QuotaExceededError', () => {
    // 镜像 companion-chat-history.test.ts 的 defineProperty 存根法(jsdom localStorage 宿主对象,
    // 直接 spy setItem 拦不到;整体换 stub 测完还原)。
    const real = window.localStorage
    const stub = {
      getItem: real.getItem.bind(real),
      setItem: () => { throw new DOMException('quota', 'QuotaExceededError') },
      removeItem: real.removeItem.bind(real),
      clear: real.clear.bind(real),
      key: real.key.bind(real),
      get length() { return real.length },
    }
    Object.defineProperty(window, 'localStorage', { value: stub, configurable: true })
    try {
      expect(() => saveAskHistory(MSGS)).not.toThrow()
      expect(saveAskHistory(MSGS)).toBe(false)
    } finally {
      Object.defineProperty(window, 'localStorage', { value: real, configurable: true })
    }
  })
})

describe('clearAskHistory', () => {
  it('removes the key', () => {
    saveAskHistory(MSGS)
    expect(window.localStorage.getItem(ASK_CHAT_KEY)).not.toBeNull()
    clearAskHistory()
    expect(window.localStorage.getItem(ASK_CHAT_KEY)).toBeNull()
  })

  it('does not throw when key absent', () => {
    expect(() => clearAskHistory()).not.toThrow()
  })
})
