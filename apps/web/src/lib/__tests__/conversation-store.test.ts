import { describe, it, expect, beforeEach } from 'vitest'
import type { CanvasId } from '@cys-stift/domain'
import { DEFAULT_CANVAS_ID } from '@/features/canvas/default-canvas'
import {
  loadConversation,
  saveConversation,
  clearConversation,
  conversationKey,
  type PersistedConversationMessage,
} from '../conversation-store'

beforeEach(() => {
  window.localStorage.clear()
})

describe('conversationKey', () => {
  it('builds a per-canvas key with .v2 suffix', () => {
    expect(conversationKey('cv-1' as CanvasId)).toBe('cys-stift.conversation.cv-1.v2')
  })

  it('isolates different canvases', () => {
    expect(conversationKey('cv-a' as CanvasId)).not.toBe(conversationKey('cv-b' as CanvasId))
  })
})

describe('loadConversation — per-canvas isolation', () => {
  it('A/B canvases do not interfere', () => {
    saveConversation('a' as CanvasId, [{ role: 'user', content: 'A' }])
    saveConversation('b' as CanvasId, [{ role: 'user', content: 'B' }])
    expect(loadConversation('a' as CanvasId).map((m) => m.content)).toEqual(['A'])
    expect(loadConversation('b' as CanvasId).map((m) => m.content)).toEqual(['B'])
  })
})

describe('loadConversation — SSR early-return', () => {
  it('returns [] and save/clear are no-ops when window is undefined', () => {
    const originalWindow = globalThis.window
    // @ts-expect-error — simulate SSR
    delete globalThis.window
    try {
      expect(loadConversation('cv-ssr' as CanvasId)).toEqual([])
      expect(saveConversation('cv-ssr' as CanvasId, [{ role: 'user', content: 'x' }])).toBe(false)
      expect(() => clearConversation('cv-ssr' as CanvasId)).not.toThrow()
    } finally {
      globalThis.window = originalWindow
    }
  })
})

describe('saveConversation — quota silent', () => {
  it('returns false (and does not throw) on QuotaExceededError', () => {
    const CID = 'cv-quota' as CanvasId
    const real = window.localStorage
    const stub = {
      getItem: real.getItem.bind(real),
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError')
      },
      removeItem: real.removeItem.bind(real),
      clear: real.clear.bind(real),
      key: real.key.bind(real),
      get length() {
        return real.length
      },
    }
    Object.defineProperty(window, 'localStorage', { value: stub, configurable: true })
    try {
      expect(() => saveConversation(CID, [{ role: 'user', content: 'x' }])).not.toThrow()
      expect(saveConversation(CID, [{ role: 'user', content: 'x' }])).toBe(false)
    } finally {
      Object.defineProperty(window, 'localStorage', { value: real, configurable: true })
    }
  })
})

describe('loadConversation — streaming-revival guard', () => {
  it('clears streaming:true to false on load', () => {
    const CID = 'cv-str' as CanvasId
    saveConversation(CID, [
      { role: 'assistant', content: '...', dslBlocks: ['x'], streaming: true },
    ])
    expect(loadConversation(CID)).toEqual([
      { role: 'assistant', content: '...', dslBlocks: ['x'], streaming: false },
    ])
  })

  it('clears streaming in multi-message arrays', () => {
    const CID = 'cv-str2' as CanvasId
    saveConversation(CID, [
      { role: 'user', content: 'q' },
      { role: 'assistant', content: 'a', streaming: true },
    ])
    const loaded = loadConversation(CID)
    expect(loaded.every((m) => m.streaming !== true)).toBe(true)
  })
})

describe('saveConversation — cap 100', () => {
  it('keeps only the most recent 100 messages', () => {
    const CID = 'cv-cap' as CanvasId
    const big: PersistedConversationMessage[] = Array.from({ length: 120 }, (_, i) => ({
      role: 'user' as const,
      content: String(i),
    }))
    saveConversation(CID, big)
    const stored = JSON.parse(
      window.localStorage.getItem(conversationKey(CID)) ?? '[]',
    ) as PersistedConversationMessage[]
    expect(stored).toHaveLength(100)
    // drop earliest 20 (0..19), keep 20..119
    expect(stored[0]!.content).toBe('20')
    expect(stored[99]!.content).toBe('119')
  })
})

describe('migration — legacy companion v1 → new v2', () => {
  it('migrates old companion-chat key to conversation key on first load', () => {
    const CID = 'old-comp' as CanvasId
    window.localStorage.setItem(
      'cys-stift.companion-chat.old-comp.v1',
      JSON.stringify([
        { role: 'user', content: 'legacy' },
        { role: 'assistant', content: 'reply', dslBlocks: ['```cys-dsl\nx\n```'] },
      ]),
    )
    expect(loadConversation(CID).map((m) => m.content)).toEqual(['legacy', 'reply'])
    // new key was written
    expect(window.localStorage.getItem(conversationKey(CID))).toBeTruthy()
    // old key is untouched (not deleted — companion-chat-history still owns it)
    expect(window.localStorage.getItem('cys-stift.companion-chat.old-comp.v1')).toBeTruthy()
  })

  it('normalizes streaming:true during migration', () => {
    const CID = 'old-str' as CanvasId
    window.localStorage.setItem(
      'cys-stift.companion-chat.old-str.v1',
      JSON.stringify([{ role: 'assistant', content: '...', streaming: true }]),
    )
    expect(loadConversation(CID)).toEqual([
      { role: 'assistant', content: '...', streaming: false },
    ])
  })
})

describe('migration — legacy ask global split by targetCanvasId', () => {
  it('routes ask messages to their targetCanvasId canvas', () => {
    window.localStorage.setItem(
      'cys-stift.ask-chat.v1',
      JSON.stringify([
        { role: 'user', content: 'for-c1', targetCanvasId: 'c1' },
        { role: 'user', content: 'for-c2', targetCanvasId: 'c2' },
      ]),
    )
    expect(loadConversation('c1' as CanvasId).map((m) => m.content)).toEqual(['for-c1'])
    expect(loadConversation('c2' as CanvasId).map((m) => m.content)).toEqual(['for-c2'])
    // each canvas has its own new key
    expect(window.localStorage.getItem(conversationKey('c1' as CanvasId))).toBeTruthy()
    expect(window.localStorage.getItem(conversationKey('c2' as CanvasId))).toBeTruthy()
  })

  it('routes no-target messages to DEFAULT_CANVAS_ID only', () => {
    window.localStorage.setItem(
      'cys-stift.ask-chat.v1',
      JSON.stringify([
        { role: 'user', content: 'no-target' },
        { role: 'user', content: 'has-target', targetCanvasId: 'other' },
      ]),
    )
    // no-target → DEFAULT_CANVAS_ID
    expect(loadConversation(DEFAULT_CANVAS_ID).map((m) => m.content)).toEqual(['no-target'])
    // a random non-default canvas does NOT pick up the no-target message
    expect(loadConversation('random' as CanvasId)).toEqual([])
  })

  it('strips targetCanvasId field from migrated messages', () => {
    window.localStorage.setItem(
      'cys-stift.ask-chat.v1',
      JSON.stringify([
        { role: 'user', content: 'stripped', targetCanvasId: 'strip-test' },
      ]),
    )
    const loaded = loadConversation('strip-test' as CanvasId)
    expect(loaded).toHaveLength(1)
    expect(loaded[0]).not.toHaveProperty('targetCanvasId')
  })
})

describe('migration — companion-first merge order', () => {
  it('merges companion messages before ask-global for same canvas', () => {
    const CID = 'merge-test' as CanvasId
    // legacy companion has one message for this canvas
    window.localStorage.setItem(
      'cys-stift.companion-chat.merge-test.v1',
      JSON.stringify([{ role: 'user', content: 'from-companion' }]),
    )
    // legacy ask also has a message routed to this canvas
    window.localStorage.setItem(
      'cys-stift.ask-chat.v1',
      JSON.stringify([
        { role: 'user', content: 'from-ask', targetCanvasId: 'merge-test' },
      ]),
    )
    const loaded = loadConversation(CID)
    expect(loaded).toHaveLength(2)
    // companion comes first
    expect(loaded[0]!.content).toBe('from-companion')
    expect(loaded[1]!.content).toBe('from-ask')
  })
})

describe('migration — idempotent', () => {
  it('does not re-migrate when new key already has data', () => {
    const CID = 'idem' as CanvasId
    // pre-populate new key
    saveConversation(CID, [{ role: 'user', content: 'new-data' }])
    // also set old keys with DIFFERENT data
    window.localStorage.setItem(
      'cys-stift.companion-chat.idem.v1',
      JSON.stringify([{ role: 'user', content: 'stale-legacy' }]),
    )
    // load should return new key's data, not migrate
    expect(loadConversation(CID).map((m) => m.content)).toEqual(['new-data'])
  })

  it('repeated load does not duplicate or corrupt data', () => {
    const CID = 'idem2' as CanvasId
    window.localStorage.setItem(
      'cys-stift.companion-chat.idem2.v1',
      JSON.stringify([{ role: 'user', content: 'once' }]),
    )
    const first = loadConversation(CID)
    const second = loadConversation(CID)
    expect(second).toEqual(first)
    expect(second).toHaveLength(1)
  })
})

describe('bad JSON / corrupt data', () => {
  it('returns [] on corrupt JSON in new key', () => {
    const CID = 'bad-new' as CanvasId
    window.localStorage.setItem(conversationKey(CID), '{not json')
    expect(loadConversation(CID)).toEqual([])
  })

  it('returns [] when stored value is not an array', () => {
    const CID = 'bad-type' as CanvasId
    window.localStorage.setItem(conversationKey(CID), JSON.stringify({ role: 'user' }))
    expect(loadConversation(CID)).toEqual([])
  })

  it('drops malformed entries but keeps valid ones in new key', () => {
    const CID = 'bad-mixed' as CanvasId
    window.localStorage.setItem(
      conversationKey(CID),
      JSON.stringify([
        { role: 'user', content: 'ok' },
        { role: 'bad-role', content: 'x' },
        { role: 'assistant', content: 123 },
        null,
        { role: 'assistant', content: 'fine' },
      ]),
    )
    expect(loadConversation(CID)).toEqual([
      { role: 'user', content: 'ok' },
      { role: 'assistant', content: 'fine' },
    ])
  })

  it('skips corrupt legacy companion JSON without crashing', () => {
    const CID = 'bad-old-comp' as CanvasId
    window.localStorage.setItem('cys-stift.companion-chat.bad-old-comp.v1', '{broken')
    expect(loadConversation(CID)).toEqual([])
  })

  it('skips corrupt legacy ask JSON without crashing', () => {
    const CID = 'bad-old-ask' as CanvasId
    window.localStorage.setItem('cys-stift.ask-chat.v1', '{also broken')
    expect(loadConversation(CID)).toEqual([])
  })

  it('skips non-array legacy companion data', () => {
    const CID = 'bad-old-type' as CanvasId
    window.localStorage.setItem(
      'cys-stift.companion-chat.bad-old-type.v1',
      JSON.stringify({ not: 'array' }),
    )
    expect(loadConversation(CID)).toEqual([])
  })
})

describe('clearConversation', () => {
  it('removes the per-canvas key', () => {
    const CID = 'cv-clear' as CanvasId
    saveConversation(CID, [{ role: 'user', content: 'x' }])
    expect(window.localStorage.getItem(conversationKey(CID))).not.toBeNull()
    clearConversation(CID)
    expect(window.localStorage.getItem(conversationKey(CID))).toBeNull()
  })

  it('does not throw when key absent', () => {
    expect(() => clearConversation('absent' as CanvasId)).not.toThrow()
  })
})
