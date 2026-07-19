import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { CanvasId } from '@cys-stift/domain'
import { DEFAULT_CANVAS_ID } from '@/features/canvas/default-canvas'
import {
  loadConversation,
  saveConversation,
  clearConversation,
  conversationKey,
  migrateAllLegacyConversations,
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

describe('saveConversation — persistence boundary', () => {
  it('keeps bounded RAG metadata but strips component-only prompt state', () => {
    const CID = 'context-meta' as CanvasId
    saveConversation(CID, [
      {
        role: 'assistant',
        content: 'answer',
        targetCanvasId: String(CID),
        contextMeta: { retrievedCount: 12, sentCount: 8, cardIds: ['a', 'b'] },
        sampleContext: { question: 'private question', context: 'private prompt' },
      } as PersistedConversationMessage & { sampleContext: unknown },
    ])
    const raw = JSON.parse(window.localStorage.getItem(conversationKey(CID)) ?? '[]') as Record<string, unknown>[]
    expect(raw[0]).toMatchObject({ targetCanvasId: String(CID), contextMeta: { retrievedCount: 12, sentCount: 8, cardIds: ['a', 'b'] } })
    expect(raw[0]).not.toHaveProperty('sampleContext')
    expect(loadConversation(CID)[0]?.contextMeta?.sentCount).toBe(8)
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

// ── migrateAllLegacyConversations — 全量迁移(修备份漏 v1) ──────────────────
//
// 问题:loadConversation 的 lazy migrate 只在「打开画布」时迁该画布。未打开过的
// 画布的 v1 conversation 永远不迁 → export-service 只枚举 v2 → 备份漏。
// migrateAllLegacyConversations 枚举所有 v1 key,一次性迁完 + 删旧 key。

describe('migrateAllLegacyConversations — 全量迁移 v1 → v2 + 删旧 key', () => {
  it('migrates companion v1 keys for canvases that were never opened', () => {
    // 两画布都有 v1 companion 数据,但从未 loadConversation(未被 lazy migrate)
    window.localStorage.setItem(
      'cys-stift.companion-chat.never-opened-1.v1',
      JSON.stringify([{ role: 'user', content: 'legacy-1' }]),
    )
    window.localStorage.setItem(
      'cys-stift.companion-chat.never-opened-2.v1',
      JSON.stringify([{ role: 'user', content: 'legacy-2' }]),
    )

    const count = migrateAllLegacyConversations()

    expect(count).toBe(2)
    // v2 写入
    expect(loadConversation('never-opened-1' as CanvasId).map((m) => m.content)).toEqual(['legacy-1'])
    expect(loadConversation('never-opened-2' as CanvasId).map((m) => m.content)).toEqual(['legacy-2'])
    // v1 旧 key 已删
    expect(window.localStorage.getItem('cys-stift.companion-chat.never-opened-1.v1')).toBeNull()
    expect(window.localStorage.getItem('cys-stift.companion-chat.never-opened-2.v1')).toBeNull()
  })

  it('migrates ask-global messages by targetCanvasId (including no-target → default)', () => {
    window.localStorage.setItem(
      'cys-stift.ask-chat.v1',
      JSON.stringify([
        { role: 'user', content: 'for-x', targetCanvasId: 'ask-cv-x' },
        { role: 'user', content: 'for-y', targetCanvasId: 'ask-cv-y' },
        { role: 'user', content: 'no-target' }, // → DEFAULT_CANVAS_ID
      ]),
    )

    migrateAllLegacyConversations()

    expect(loadConversation('ask-cv-x' as CanvasId).map((m) => m.content)).toEqual(['for-x'])
    expect(loadConversation('ask-cv-y' as CanvasId).map((m) => m.content)).toEqual(['for-y'])
    expect(loadConversation(DEFAULT_CANVAS_ID).map((m) => m.content)).toContain('no-target')
    // ask 全局 key 已删
    expect(window.localStorage.getItem('cys-stift.ask-chat.v1')).toBeNull()
  })

  it('deletes v1 keys even when v2 already has data (lazy already migrated — v1 stale)', () => {
    const CID = 'already-lazy' as CanvasId
    // lazy migrate 已跑过(loadConversation 写了 v2),但 v1 未删
    saveConversation(CID, [{ role: 'user', content: 'new-v2-data' }])
    window.localStorage.setItem(
      `cys-stift.companion-chat.${CID}.v1`,
      JSON.stringify([{ role: 'user', content: 'stale-v1' }]),
    )

    migrateAllLegacyConversations()

    // v2 保留(不重写 —— 幂等)
    expect(loadConversation(CID).map((m) => m.content)).toEqual(['new-v2-data'])
    // v1 已删(stale 子集,不再需要)
    expect(window.localStorage.getItem(`cys-stift.companion-chat.${CID}.v1`)).toBeNull()
  })

  it('is idempotent — running twice does not duplicate or lose data', () => {
    window.localStorage.setItem(
      'cys-stift.companion-chat.idem-all.v1',
      JSON.stringify([{ role: 'user', content: 'once' }]),
    )
    const first = migrateAllLegacyConversations()
    const second = migrateAllLegacyConversations()

    expect(first).toBe(1)
    expect(second).toBe(0) // 第二次无 v1 key 可迁
    // v2 数据不重复
    expect(loadConversation('idem-all' as CanvasId)).toHaveLength(1)
  })

  it('returns 0 and is a no-op when no v1 keys exist (pure v2 state)', () => {
    saveConversation('pure-v2' as CanvasId, [{ role: 'user', content: 'x' }])
    const count = migrateAllLegacyConversations()
    expect(count).toBe(0)
    expect(loadConversation('pure-v2' as CanvasId).map((m) => m.content)).toEqual(['x'])
  })

  it('SSR early-return: returns 0 when window is undefined', () => {
    const originalWindow = globalThis.window
    // @ts-expect-error — simulate SSR
    delete globalThis.window
    try {
      expect(migrateAllLegacyConversations()).toBe(0)
    } finally {
      globalThis.window = originalWindow
    }
  })

  it('skips corrupt v1 JSON without crashing (companion + ask)', () => {
    window.localStorage.setItem('cys-stift.companion-chat.corrupt.v1', '{broken')
    window.localStorage.setItem('cys-stift.ask-chat.v1', '{also broken')
    expect(() => migrateAllLegacyConversations()).not.toThrow()
    // 坏 key 仍被删(无法解析 = 无数据,删除安全)
    expect(window.localStorage.getItem('cys-stift.companion-chat.corrupt.v1')).toBeNull()
    expect(window.localStorage.getItem('cys-stift.ask-chat.v1')).toBeNull()
  })

  // 性能:多 canvas 时 ASK_OLD_KEY 应只 parse 一次(预 parse 复用),不应 N canvas = N 次
  // parse 同一份 JSON。boot 一次性 + μs 级,但工程上避免重复读。
  it('reads ASK_OLD_KEY minimally across N canvases (parse once, not per-canvas)', () => {
    // 3 画布各有 companion v1 数据(进 canvasIds 集合)+ ask-global 含 3 个 target
    window.localStorage.setItem(
      'cys-stift.companion-chat.perf-1.v1',
      JSON.stringify([{ role: 'user', content: 'c1' }]),
    )
    window.localStorage.setItem(
      'cys-stift.companion-chat.perf-2.v1',
      JSON.stringify([{ role: 'user', content: 'c2' }]),
    )
    window.localStorage.setItem(
      'cys-stift.companion-chat.perf-3.v1',
      JSON.stringify([{ role: 'user', content: 'c3' }]),
    )
    window.localStorage.setItem(
      'cys-stift.ask-chat.v1',
      JSON.stringify([
        { role: 'assistant', content: 'a1', targetCanvasId: 'perf-1' },
        { role: 'assistant', content: 'a2', targetCanvasId: 'perf-2' },
        { role: 'assistant', content: 'a3', targetCanvasId: 'perf-3' },
      ]),
    )

    // 用计数 stub 包裹真实 localStorage(jsdom 的 Storage.prototype 上 spy 不可靠,
    // 改用对象 stub —— 同 saveConversation 配额测试的既有范式)
    const real = window.localStorage
    let askKeyReads = 0
    const stub = {
      getItem: (key: string) => {
        if (key === 'cys-stift.ask-chat.v1') askKeyReads++
        return real.getItem(key)
      },
      setItem: real.setItem.bind(real),
      removeItem: real.removeItem.bind(real),
      clear: real.clear.bind(real),
      key: real.key.bind(real),
      get length() {
        return real.length
      },
    }
    Object.defineProperty(window, 'localStorage', { value: stub, configurable: true })

    try {
      const count = migrateAllLegacyConversations()
      // 行为等价:3 个 companion v1 都迁(ask 部分被合并进同 v2 key,不额外计数)
      expect(count).toBe(3)
      // ASK_OLD_KEY 在 scan 阶段读 1 次;旧实现会额外读 N(=3)次 per-canvas。
      // 断言「只读 1 次」锁定 parse-once 优化。
      expect(askKeyReads).toBe(1)
      // 3 canvas 都收到 companion + ask 合并(各 2 条) —— 行为等价于旧实现
      expect(loadConversation('perf-1' as CanvasId)).toHaveLength(2)
      expect(loadConversation('perf-2' as CanvasId)).toHaveLength(2)
      expect(loadConversation('perf-3' as CanvasId)).toHaveLength(2)
      // 迁完后 ASK_OLD_KEY 已删
      expect(real.getItem('cys-stift.ask-chat.v1')).toBeNull()
    } finally {
      Object.defineProperty(window, 'localStorage', { value: real, configurable: true })
    }
  })

  it('falls back to per-canvas read when ask JSON is corrupt (no regression)', () => {
    // 2 画布 + ask-global 是坏 JSON:opts.askGlobal 不传(坏 JSON 无法 parse 成 array)
    // → migrateLegacy 退化到内部自取路径(再读再坏,静默跳过) —— 行为等价于旧实现
    window.localStorage.setItem(
      'cys-stift.companion-chat.fallback.v1',
      JSON.stringify([{ role: 'user', content: 'ok' }]),
    )
    window.localStorage.setItem('cys-stift.ask-chat.v1', '{broken')

    const count = migrateAllLegacyConversations()

    // companion v1 仍迁成功(ask 坏 → 不贡献,不炸)
    expect(count).toBe(1)
    expect(loadConversation('fallback' as CanvasId).map((m) => m.content)).toEqual(['ok'])
    // ask 坏 key 已删
    expect(window.localStorage.getItem('cys-stift.ask-chat.v1')).toBeNull()
  })
})

// Task 6 quota:saveConversation 配额失败 → notifyQuota(AppMenu toast 订阅源)
describe('conversationStore — quota (Task 6)', () => {
  let onQuotaExceeded: typeof import('../conversation-store').onQuotaExceeded
  let saveConversation: typeof import('../conversation-store').saveConversation
  beforeEach(async () => {
    vi.resetModules()
    window.localStorage.clear()
    onQuotaExceeded = (await import('../conversation-store')).onQuotaExceeded
    saveConversation = (await import('../conversation-store')).saveConversation
  })
  function simulateQuota() {
    const orig = Object.getOwnPropertyDescriptor(Storage.prototype, 'setItem')
    Object.defineProperty(Storage.prototype, 'setItem', {
      configurable: true,
      value: () => { throw new DOMException('quota', 'QuotaExceededError') },
    })
    return () => { if (orig) Object.defineProperty(Storage.prototype, 'setItem', orig) }
  }
  it('saveConversation 配额失败 → notifyQuota + 返 false', () => {
    const restore = simulateQuota()
    try {
      let fired = false
      const unsub = onQuotaExceeded(() => { fired = true })
      const ok = saveConversation('c' as CanvasId, [])
      unsub()
      expect(ok).toBe(false)
      expect(fired).toBe(true)
    } finally {
      restore()
    }
  })
})
