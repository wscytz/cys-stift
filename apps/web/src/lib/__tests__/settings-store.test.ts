import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { AIProfile } from '../settings-store'

// ── Hook testing note ───────────────────────────────────────────────────────
// useSettings (the React hook) is NOT tested here.
// apps/web/package.json has no @testing-library/react in devDependencies, and
// pulling in a new dependency just to test the hook would violate YAGNI. The
// hook is a thin wrapper over useSyncExternalStore + the store API exercised
// below.

const STORAGE_KEY = 'cys-stift.settings.v2'

let store: typeof import('../settings-store').settingsStore

beforeEach(async () => {
  vi.resetModules()
  window.localStorage.clear()
  store = (await import('../settings-store')).settingsStore
})

describe('settingsStore.get — defaults', () => {
  it('returns DEFAULT_SETTINGS on a clean profile', () => {
    const s = store.get()
    expect(s.captureShortcut).toEqual({ modKey: 'meta', shift: true, code: 'KeyE' })
    expect(s.theme).toBe('system')
    expect(s.locale).toBe('zh')
    expect(s.profiles).toEqual([])
    expect(s.activeProfileId).toBeNull()
  })
})

describe('settingsStore.update — merge + persist', () => {
  it('merges a partial patch onto the current settings', () => {
    store.update({ theme: 'dark' })
    const s = store.get()
    expect(s.theme).toBe('dark')
    // Untouched fields preserved.
    expect(s.locale).toBe('zh')
    expect(s.captureShortcut.code).toBe('KeyE')
  })

  it('persists to localStorage in a { settings } envelope', () => {
    store.update({ theme: 'dark' })
    const raw = window.localStorage.getItem(STORAGE_KEY)
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!) as { settings: { theme: string } }
    expect(parsed.settings.theme).toBe('dark')
  })
})

describe('settingsStore.updateCaptureShortcut', () => {
  it('patches only the captureShortcut object', () => {
    store.updateCaptureShortcut({ modKey: 'ctrl', code: 'KeyC' })
    const sc = store.get().captureShortcut
    expect(sc).toEqual({ modKey: 'ctrl', shift: true, code: 'KeyC' })
  })
})

describe('settingsStore.updateLocale', () => {
  it('switches locale to en', () => {
    store.updateLocale('en')
    expect(store.get().locale).toBe('en')
  })

  it('is a no-op when the locale is unchanged (no persist, no notify leak)', () => {
    store.updateLocale('zh') // already zh by default
    expect(store.get().locale).toBe('zh')
    // localStorage was never written (no-op branch returns before saveSettings).
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})

describe('settingsStore.updateTheme', () => {
  it('switches theme', () => {
    store.updateTheme('dark')
    expect(store.get().theme).toBe('dark')
  })

  it('is a no-op when the theme is unchanged', () => {
    store.updateTheme('system') // already system
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})

describe('settingsStore.subscribe', () => {
  it('notifies subscribers on a change and returns an unsubscribe', () => {
    const cb = vi.fn()
    const unsub = store.subscribe(cb)
    store.update({ theme: 'dark' })
    expect(cb).toHaveBeenCalled()
    cb.mockClear()
    unsub()
    store.update({ theme: 'light' })
    expect(cb).not.toHaveBeenCalled()
  })
})

describe('settingsStore — hydrate (reads persisted state on load)', () => {
  it('rehydrates a previously-saved settings object across a fresh module load', async () => {
    store.update({ theme: 'dark', locale: 'en' })
    vi.resetModules()
    const fresh = (await import('../settings-store')).settingsStore
    const s = fresh.get()
    expect(s.theme).toBe('dark')
    expect(s.locale).toBe('en')
  })
})

describe('settingsStore — corrupt / invalid localStorage', () => {
  it('falls back to defaults on corrupt JSON (no throw)', () => {
    window.localStorage.setItem(STORAGE_KEY, '{ this is NOT json {{{')
    expect(() => store.get()).not.toThrow()
    expect(store.get().theme).toBe('system') // default
  })

  it('falls back to defaults when settings fails validation (bad theme)', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        settings: {
          captureShortcut: { modKey: 'meta', shift: true, code: 'Space' },
          theme: 'neon', // invalid
          locale: 'zh',
          profiles: [],
          activeProfileId: null,
        },
      }),
    )
    expect(store.get().theme).toBe('system') // rejected → default
  })

  it('falls back to defaults when captureShortcut is malformed', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        settings: {
          captureShortcut: { modKey: 'banana', shift: true, code: 'Space' },
          theme: 'light',
          locale: 'en',
          profiles: [],
          activeProfileId: null,
        },
      }),
    )
    const s = store.get()
    expect(s.theme).toBe('system') // whole object rejected → defaults
    expect(s.captureShortcut.modKey).toBe('meta')
  })

  it('falls back to defaults when profiles contains an invalid profile', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        settings: {
          captureShortcut: { modKey: 'meta', shift: true, code: 'Space' },
          theme: 'light',
          locale: 'en',
          profiles: [{ id: 'p1', provider: 'evilcorp', apiKey: 'x', baseUrl: 'not-a-url', model: 'm', enabled: true }],
          activeProfileId: 'p1',
        },
      }),
    )
    // Bad profile → whole settings rejected.
    expect(store.get().locale).toBe('zh') // default locale, not 'en'
  })

  it('accepts a valid v2 settings object (profiles empty + null active)', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        settings: {
          captureShortcut: { modKey: 'meta', shift: true, code: 'Space' },
          theme: 'dark',
          locale: 'en',
          profiles: [],
          activeProfileId: null,
        },
      }),
    )
    const s = store.get()
    expect(s.theme).toBe('dark')
    expect(s.locale).toBe('en')
    expect(s.profiles).toEqual([])
    expect(s.activeProfileId).toBeNull()
  })
})

describe('settingsStore — SSR safety', () => {
  it('returns defaults and does not throw when window is undefined', async () => {
    const originalWindow = globalThis.window
    // @ts-expect-error — simulate SSR
    delete globalThis.window
    try {
      vi.resetModules()
      const ssrStore = (await import('../settings-store')).settingsStore
      const s = ssrStore.get()
      expect(s.theme).toBe('system')
      expect(s.locale).toBe('zh')
      expect(() => ssrStore.update({ theme: 'dark' })).not.toThrow()
      expect(() => ssrStore.updateLocale('en')).not.toThrow()
      expect(() => ssrStore.updateTheme('dark')).not.toThrow()
      expect(() => ssrStore.upsertProfile({
        id: 'p1', name: 'OpenAI', provider: 'openai', apiKey: 'x', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', enabled: false,
      })).not.toThrow()
    } finally {
      globalThis.window = originalWindow
    }
  })
})

// 镜像 db-client 的配额回滚测试。quota-silence fix:配额满时必须回滚内存
// _settings(让 UI 不撒谎:改了主题/快捷键/AI 配置,reload 后消失)+ notifyQuota
// (让 AppMenu toast 提示)。此前 saveSettings 裸 catch {} → 静默丢设置。
describe('settingsStore — quota exceeded (rollback + notify)', () => {
  let store: typeof import('../settings-store').settingsStore
  let onQuotaExceeded: typeof import('../settings-store').onQuotaExceeded

  beforeEach(async () => {
    vi.resetModules()
    window.localStorage.clear()
    store = (await import('../settings-store')).settingsStore
    onQuotaExceeded = (await import('../settings-store')).onQuotaExceeded
  })

  /** Force localStorage.setItem to throw. jsdom puts setItem on Storage.prototype
   *  (non-writable on the instance), so a direct `window.localStorage.setItem = fn`
   *  silently no-ops. Override the prototype method and restore it after. */
  function simulateQuota() {
    const orig = Object.getOwnPropertyDescriptor(Storage.prototype, 'setItem')
    Object.defineProperty(Storage.prototype, 'setItem', {
      configurable: true,
      value: () => {
        throw new DOMException('quota', 'QuotaExceededError')
      },
    })
    return () => {
      if (orig) Object.defineProperty(Storage.prototype, 'setItem', orig)
    }
  }

  it('rolls back update + fires quota when persist fails', () => {
    const restore = simulateQuota()
    try {
      let quotaFired = false
      const unsub = onQuotaExceeded(() => {
        quotaFired = true
      })
      store.update({ theme: 'dark' })
      unsub()
      // Rollback: theme did not stick in memory.
      expect(store.get().theme).toBe('system')
      expect(quotaFired).toBe(true)
    } finally {
      restore()
    }
  })

  it('rolls back updateTheme + fires quota when persist fails', () => {
    const restore = simulateQuota()
    try {
      let quotaFired = false
      const unsub = onQuotaExceeded(() => {
        quotaFired = true
      })
      store.updateTheme('dark')
      unsub()
      expect(store.get().theme).toBe('system')
      expect(quotaFired).toBe(true)
    } finally {
      restore()
    }
  })

  it('rolls back updateLocale + fires quota when persist fails', () => {
    const restore = simulateQuota()
    try {
      let quotaFired = false
      const unsub = onQuotaExceeded(() => {
        quotaFired = true
      })
      store.updateLocale('en')
      unsub()
      expect(store.get().locale).toBe('zh')
      expect(quotaFired).toBe(true)
    } finally {
      restore()
    }
  })

  it('rolls back updateCaptureShortcut + fires quota when persist fails', () => {
    const restore = simulateQuota()
    try {
      let quotaFired = false
      const unsub = onQuotaExceeded(() => {
        quotaFired = true
      })
      store.updateCaptureShortcut({ code: 'KeyC' })
      unsub()
      expect(store.get().captureShortcut.code).toBe('KeyE')
      expect(quotaFired).toBe(true)
    } finally {
      restore()
    }
  })

  it('rolls back upsertProfile + fires quota when persist fails', () => {
    const restore = simulateQuota()
    try {
      let quotaFired = false
      const unsub = onQuotaExceeded(() => {
        quotaFired = true
      })
      store.upsertProfile({
        id: 'p1', name: 'OpenAI', provider: 'openai', apiKey: 'sk-test', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', enabled: false,
      })
      unsub()
      expect(store.get().profiles).toEqual([])
      expect(quotaFired).toBe(true)
    } finally {
      restore()
    }
  })

  it('normal write still works + does not fire quota', () => {
    let quotaFired = false
    const unsub = onQuotaExceeded(() => {
      quotaFired = true
    })
    store.update({ theme: 'dark' })
    unsub()
    expect(store.get().theme).toBe('dark')
    expect(quotaFired).toBe(false)
  })

  // Bug 1 回归守护(2026-06-26):settings-store 的 5 个 updater 已经在末尾
  // 无条件 notify(),所以本文件不受 Bug 1 影响。这里加一个订阅者可见性断言,
  // 把「回滚后订阅者最后一次看到的快照 = prev」锁死,防止未来重构把 notify()
  // 挪进 saveSettings 的成功分支而漏掉回滚路径的 notify。
  it('rollback is subscriber-visible: last snapshot seen == pre-mutation state', () => {
    store.get() // force hydration so the snapshot ref is stable from here on
    const before = store.get()
    const seen: ReturnType<typeof store.get>[] = []
    const unsub = store.subscribe(() => seen.push(store.get()))
    const restore = simulateQuota()
    try {
      store.update({ theme: 'dark' })
      unsub()
      expect(seen.length).toBeGreaterThanOrEqual(1)
      const last = seen[seen.length - 1]!
      expect(last).toBe(before) // subscriber's final view is the rolled-back state (same ref)
      expect(last.theme).toBe('system')
    } finally {
      restore()
    }
  })

  it('successful mutation notifies subscribers exactly once (no render loop)', () => {
    store.get() // force hydration first (hydrate's own notify must not count here)
    const seen: ReturnType<typeof store.get>[] = []
    const unsub = store.subscribe(() => seen.push(store.get()))
    store.update({ theme: 'dark' })
    unsub()
    expect(seen.length).toBe(1)
    expect(seen[0]!.theme).toBe('dark')
  })
})

describe('settingsStore — multi-profile CRUD', () => {
  const profile = (id: string, provider: 'openai' | 'anthropic' | 'ollama' = 'openai'): AIProfile => ({
    id,
    name: provider === 'openai' ? 'OpenAI' : provider === 'anthropic' ? 'Anthropic' : 'Ollama',
    provider,
    apiKey: 'k-' + id,
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    enabled: false,
  })

  it('upsertProfile adds a new profile', () => {
    store.upsertProfile(profile('p1'))
    const s = store.get()
    expect(s.profiles).toHaveLength(1)
    expect(s.profiles[0]!.id).toBe('p1')
  })

  it('upsertProfile replaces by id', () => {
    store.upsertProfile(profile('p1'))
    store.upsertProfile({ ...profile('p1'), apiKey: 'changed' })
    expect(store.get().profiles[0]!.apiKey).toBe('changed')
    expect(store.get().profiles).toHaveLength(1)
  })

  it('setActiveProfile sets activeProfileId', () => {
    store.upsertProfile(profile('p1'))
    store.setActiveProfile('p1')
    expect(store.get().activeProfileId).toBe('p1')
  })

  it('deleteProfile auto-switches active to the first remaining (or null)', () => {
    store.upsertProfile(profile('p1'))
    store.upsertProfile(profile('p2', 'anthropic'))
    store.setActiveProfile('p1')
    store.deleteProfile('p1')
    const s = store.get()
    expect(s.profiles.map((p) => p.id)).toEqual(['p2'])
    expect(s.activeProfileId).toBe('p2') // 自动切第一个剩余
  })

  it('deleteProfile of the last profile → activeProfileId null', () => {
    store.upsertProfile(profile('p1'))
    store.setActiveProfile('p1')
    store.deleteProfile('p1')
    expect(store.get().profiles).toEqual([])
    expect(store.get().activeProfileId).toBeNull()
  })
})

describe('settingsStore — v1→v2 migration', () => {
  it('prefers canonical v2 when a stale v1 key also exists', async () => {
    store.update({ locale: 'en' })
    window.localStorage.setItem(
      'cys-stift.settings.v1',
      JSON.stringify({ settings: { locale: 'zh', ai: null } }),
    )
    vi.resetModules()
    const store2 = (await import('../settings-store')).settingsStore
    expect(store2.get().locale).toBe('en')
  })

  it('migrates a legacy v1 payload (settings.ai) into profiles[0] + active', async () => {
    window.localStorage.setItem(
      'cys-stift.settings.v1',
      JSON.stringify({
        settings: {
          captureShortcut: { modKey: 'meta', shift: true, code: 'Space' },
          theme: 'system',
          locale: 'zh',
          ai: { provider: 'anthropic', apiKey: 'sk-ant-x', baseUrl: 'https://api.anthropic.com', model: 'claude-haiku-4-5', enabled: true },
          seenCaptureHint: false,
        },
      }),
    )
    vi.resetModules()
    const store2 = (await import('../settings-store')).settingsStore
    const s = store2.get()
    expect(s.profiles).toHaveLength(1)
    expect(s.profiles[0]!.provider).toBe('anthropic')
    expect(s.profiles[0]!.apiKey).toBe('sk-ant-x')
    expect(s.profiles[0]!.name).toBe('Anthropic')
    expect(typeof s.profiles[0]!.id).toBe('string')
    expect(s.activeProfileId).toBe(s.profiles[0]!.id)
    // 迁移后写入 v2 key(不再读 v1)。
    expect(window.localStorage.getItem('cys-stift.settings.v2')).not.toBeNull()
  })

  it('v1 with no ai → empty profiles + null active', async () => {
    window.localStorage.setItem(
      'cys-stift.settings.v1',
      JSON.stringify({ settings: { captureShortcut: { modKey: 'meta', shift: true, code: 'Space' }, theme: 'system', locale: 'zh', seenCaptureHint: false } }),
    )
    vi.resetModules()
    const store2 = (await import('../settings-store')).settingsStore
    const s = store2.get()
    expect(s.profiles).toEqual([])
    expect(s.activeProfileId).toBeNull()
  })
})

// B1 迁移:Space 在 macOS Carbon RegisterEventHotKey 注册必败(输入法/Spotlight
// 冲突)→ 默认换 KeyE,老用户 code=Space 一次性迁移为 KeyE(存回 localStorage)。
describe('captureShortcut Space→KeyE 迁移', () => {
  it('老用户 code=Space 迁移为 KeyE(一次性,存回)', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        settings: {
          captureShortcut: { modKey: 'meta', shift: true, code: 'Space' },
          theme: 'light',
          locale: 'zh',
          profiles: [],
          activeProfileId: null,
          seenCaptureHint: false,
          export: { includeDeleted: true },
          labs: {},
        },
      }),
    )
    vi.resetModules()
    const fresh = (await import('../settings-store')).settingsStore
    const s = fresh.get()
    expect(s.captureShortcut.code).toBe('KeyE')
    // 存回(localStorage 已是 KeyE,下次 load 不再迁移)
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!) as {
      settings: { captureShortcut: { code: string } }
    }
    expect(stored.settings.captureShortcut.code).toBe('KeyE')
  })

  it('新用户默认 KeyE', () => {
    // localStorage already cleared in beforeEach; store is a fresh import.
    const s = store.get()
    expect(s.captureShortcut.code).toBe('KeyE')
  })

  it('用户自定义 code(非 Space)不被迁移', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        settings: {
          captureShortcut: { modKey: 'ctrl', shift: true, code: 'KeyJ' },
          theme: 'light',
          locale: 'zh',
          profiles: [],
          activeProfileId: null,
          seenCaptureHint: false,
          export: { includeDeleted: true },
          labs: {},
        },
      }),
    )
    vi.resetModules()
    const fresh = (await import('../settings-store')).settingsStore
    const s = fresh.get()
    expect(s.captureShortcut.code).toBe('KeyJ')
  })

  // ── B1 迁移 edge-case 补测 ──────────────────────────────────────────────
  it('Space 迁移保留兄弟字段(theme/locale/profiles 不丢)', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        settings: {
          captureShortcut: { modKey: 'meta', shift: true, code: 'Space' },
          theme: 'dark',
          locale: 'en',
          profiles: [{ id: 'p1', name: 'OpenAI', provider: 'openai', apiKey: 'sk-x', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', enabled: true }],
          activeProfileId: 'p1',
          seenCaptureHint: true,
          export: { includeDeleted: false },
          labs: { visionLab: true },
        },
      }),
    )
    vi.resetModules()
    const fresh = (await import('../settings-store')).settingsStore
    const s = fresh.get()
    // code 迁移
    expect(s.captureShortcut.code).toBe('KeyE')
    // 兄弟字段全保(theme/locale/profiles/active/seen/export/labs)
    expect(s.theme).toBe('dark')
    expect(s.locale).toBe('en')
    expect(s.profiles).toHaveLength(1)
    expect(s.profiles[0]!.id).toBe('p1')
    expect(s.activeProfileId).toBe('p1')
    expect(s.seenCaptureHint).toBe(true)
    expect(s.export?.includeDeleted).toBe(false)
    expect(s.labs?.visionLab).toBe(true)
    // modKey/shift 不变(只改 code)
    expect(s.captureShortcut.modKey).toBe('meta')
    expect(s.captureShortcut.shift).toBe(true)
  })

  it('Space 迁移幂等(第二次 load 不再迁移,KeyE 稳定)', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        settings: {
          captureShortcut: { modKey: 'meta', shift: true, code: 'Space' },
          theme: 'light',
          locale: 'zh',
          profiles: [],
          activeProfileId: null,
        },
      }),
    )
    // 第一次 load → 迁移 Space→KeyE + 存回
    vi.resetModules()
    const s1 = (await import('../settings-store')).settingsStore.get()
    expect(s1.captureShortcut.code).toBe('KeyE')
    // 第二次 load(新模块实例,模拟 reload)→ 读到的已是 KeyE,不触发迁移分支
    vi.resetModules()
    const s2 = (await import('../settings-store')).settingsStore.get()
    expect(s2.captureShortcut.code).toBe('KeyE')
    // localStorage 仍是 KeyE(没被改)
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!) as { settings: { captureShortcut: { code: string } } }
    expect(stored.settings.captureShortcut.code).toBe('KeyE')
  })
})

// v1→v2 迁移 edge-case 补测(删 v1 key + 幂等)
describe('v1→v2 迁移 edge', () => {
  it('迁移后 v1 key 被删除(不再读 v1)', async () => {
    window.localStorage.setItem(
      'cys-stift.settings.v1',
      JSON.stringify({
        settings: {
          captureShortcut: { modKey: 'meta', shift: true, code: 'Space' },
          theme: 'system',
          locale: 'zh',
          ai: { provider: 'openai', apiKey: 'sk-x', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', enabled: true },
          seenCaptureHint: false,
        },
      }),
    )
    vi.resetModules()
    const store2 = (await import('../settings-store')).settingsStore
    store2.get() // 触发迁移
    expect(window.localStorage.getItem('cys-stift.settings.v1')).toBeNull()
    expect(window.localStorage.getItem('cys-stift.settings.v2')).not.toBeNull()
  })

  it('迁移幂等(第二次 load 读 v2,不重复迁移)', async () => {
    window.localStorage.setItem(
      'cys-stift.settings.v1',
      JSON.stringify({
        settings: {
          captureShortcut: { modKey: 'meta', shift: true, code: 'Space' },
          theme: 'system',
          locale: 'zh',
          ai: { provider: 'openai', apiKey: 'sk-x', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', enabled: true },
          seenCaptureHint: false,
        },
      }),
    )
    vi.resetModules()
    const s1 = (await import('../settings-store')).settingsStore.get()
    const profilesCount1 = s1.profiles.length
    // 第二次 load:v1 已删,读 v2 → profiles 数不变(不重复迁移)
    vi.resetModules()
    const s2 = (await import('../settings-store')).settingsStore.get()
    expect(s2.profiles).toHaveLength(profilesCount1)
    expect(window.localStorage.getItem('cys-stift.settings.v1')).toBeNull()
  })
})

// ── Cross-tab storage sync (P1, 2026-07-12) ──────────────────────────────────
// 镜像 db-client / canvas-store 的 cross-tab storage 测试。其它 tab 写 settings.v2
// 时本 tab 收到 storage 事件 → 重新 loadSettings + notify,否则本 tab 内存缓存
// _settings 不刷新,跨 tab 设置不同步。
describe('settingsStore — cross-tab storage sync', () => {
  it('reloads settings + notifies when settings.v2 changes in another tab', async () => {
    vi.resetModules()
    window.localStorage.clear()
    const mod = await import('../settings-store')
    const store = mod.settingsStore
    // hydrate so _hydrated=true (listener only acts after first hydrate).
    store.get()
    const cb = vi.fn()
    const unsub = store.subscribe(cb)
    // Simulate another tab writing settings.v2 with theme=dark.
    const otherTab = JSON.stringify({
      settings: {
        captureShortcut: { modKey: 'meta', shift: true, code: 'KeyE' },
        theme: 'dark',
        locale: 'en',
        profiles: [],
        activeProfileId: null,
      },
    })
    window.localStorage.setItem(STORAGE_KEY, otherTab)
    window.dispatchEvent(
      new StorageEvent('storage', { key: STORAGE_KEY, newValue: otherTab }),
    )
    expect(store.get().theme).toBe('dark')
    expect(store.get().locale).toBe('en')
    expect(cb).toHaveBeenCalled()
    unsub()
  })

  it('ignores storage events for other keys', async () => {
    vi.resetModules()
    window.localStorage.clear()
    const mod = await import('../settings-store')
    const store = mod.settingsStore
    store.get()
    const cb = vi.fn()
    const unsub = store.subscribe(cb)
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'cys-stift.other.v1', newValue: '{}' }),
    )
    expect(cb).not.toHaveBeenCalled()
    unsub()
  })
})
