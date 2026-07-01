import { describe, it, expect, beforeEach } from 'vitest'
import {
  chatHistoryKey,
  loadChatHistory,
  saveChatHistory,
  type PersistedChatMessage,
} from '../companion-chat-history'

const CID = 'cv-test' as Parameters<typeof chatHistoryKey>[0]

beforeEach(() => {
  window.localStorage.clear()
})

const MSGS: PersistedChatMessage[] = [
  { role: 'user', content: '你好' },
  { role: 'assistant', content: '回答', dslBlocks: ['```cys-dsl\ncreate card\n```'] },
]

describe('chatHistoryKey', () => {
  it('builds a per-canvas key with version suffix', () => {
    expect(chatHistoryKey('cv-1' as never)).toBe('cys-stift.companion-chat.cv-1.v1')
  })

  it('isolates different canvases', () => {
    expect(chatHistoryKey('cv-a' as never)).not.toBe(chatHistoryKey('cv-b' as never))
  })
})

describe('loadChatHistory', () => {
  it('returns empty array when key missing', () => {
    expect(loadChatHistory(CID)).toEqual([])
  })

  it('round-trips messages saved by saveChatHistory', () => {
    expect(saveChatHistory(CID, MSGS)).toBe(true)
    expect(loadChatHistory(CID)).toEqual(MSGS)
  })

  it('returns empty array on corrupt JSON', () => {
    window.localStorage.setItem(chatHistoryKey(CID), '{not json')
    expect(loadChatHistory(CID)).toEqual([])
  })

  it('returns empty array when stored value is not an array', () => {
    window.localStorage.setItem(chatHistoryKey(CID), JSON.stringify({ role: 'user' }))
    expect(loadChatHistory(CID)).toEqual([])
  })

  it('drops malformed entries but keeps valid ones', () => {
    const mixed = [
      { role: 'user', content: 'ok' },
      { role: 'bad-role', content: 'x' }, // role 不合法 → 丢
      { role: 'assistant', content: 123 }, // content 非 string → 丢
      null,
      { role: 'assistant', content: 'fine' },
    ]
    window.localStorage.setItem(chatHistoryKey(CID), JSON.stringify(mixed))
    expect(loadChatHistory(CID)).toEqual([
      { role: 'user', content: 'ok' },
      { role: 'assistant', content: 'fine' },
    ])
  })
})

describe('saveChatHistory', () => {
  it('writes JSON to localStorage under the per-canvas key', () => {
    saveChatHistory(CID, MSGS)
    expect(window.localStorage.getItem(chatHistoryKey(CID))).toBe(JSON.stringify(MSGS))
  })

  it('returns false (and does not throw) on QuotaExceededError', () => {
    // jsdom 的 localStorage 是宿主对象,直接赋值 setItem 会被忽略;用 defineProperty
    // 把整个 localStorage 换成一个会抛 quota 的存根,测完还原。
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
      expect(() => saveChatHistory(CID, MSGS)).not.toThrow()
      expect(saveChatHistory(CID, MSGS)).toBe(false)
    } finally {
      Object.defineProperty(window, 'localStorage', { value: real, configurable: true })
    }
  })

  it('persists dslBlocks and streaming flags', () => {
    const withDsl: PersistedChatMessage[] = [
      { role: 'assistant', content: '...', dslBlocks: ['x'], streaming: true },
    ]
    saveChatHistory(CID, withDsl)
    expect(loadChatHistory(CID)).toEqual(withDsl)
  })
})
