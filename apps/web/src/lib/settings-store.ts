'use client'

import { useEffect, useMemo, useSyncExternalStore, useState } from 'react'
import {
  isSafeProviderId,
  isSafeModelId,
  isSafeBaseUrl,
} from './safe-href'
import { genProfileId, type AIProfile } from '@/features/ai/types'

export type { AIProfile }

// ── Settings store (spec §5.5 "可在设置改") ───────────────────────────────
// Web-local keymap + future settings. Backed by localStorage, same
// singleton pattern as draft-store / canvas-view-store. Tauri (Phase 8)
// will read the same shape from its settings file.

const STORAGE_KEY = 'cys-stift.settings.v2'

export interface CaptureShortcut {
  /** 'meta' = Cmd (mac) / 'ctrl' = Ctrl (win). We store one; CaptureHost
   * accepts either at match time for cross-platform forgiveness. */
  modKey: 'meta' | 'ctrl'
  shift: boolean
  /** KeyboardEvent.code value, e.g. 'Space', 'KeyC', 'Comma'. */
  code: string
}

/**
 * Theme preference (spec §5.6, 2026-06-20 加;**2026-07-11 v0.57.3 删 dark 聚焦 light-only**)。
 * 类型保留 'light'|'dark'|'system'(legacy 兼容:旧 settings.theme='dark' 不破 isValid),
 * 但 theme.ts resolveTheme **恒返 light**(见 ADR `docs/adr/2026-07-11-remove-dark-mode.md`)。
 * data-theme 恒 light;dark variant 已从 tokens.css 删除;settings 主题选择器 UI 已移除。
 */
export type ThemePreference = 'light' | 'dark' | 'system'

// AIConfig/AIProfile 类型权威源在 features/ai/types.ts(多 profile 模型)。
// 此处只 re-export AIProfile 供 store 消费者;AIConfig = Omit<AIProfile,'id'|'name'>。

/** 当前仍有运行时入口的实验室设置。退役开关会在加载旧设置时迁移掉，
 * 不能继续作为 Settings 的可写契约，避免它们在后续保存时被带回。 */
export interface LabSettings {
  /** 可审计 AI 共编：来源锚定、分层审查、事务 Apply/Undo。 */
  proposalCoauthorLab?: boolean
}

export interface Settings {
  captureShortcut: CaptureShortcut
  theme: ThemePreference
  locale: 'zh' | 'en'
  /** AI provider profiles(多 profile)。空 = 未配置。 */
  profiles: AIProfile[]
  /** 当前 active profile id( getCurrentAI 解析它)。null = 无 active。 */
  activeProfileId: string | null
  /** One-time first-run capture-shortcut hint (plan Task 9). false until the
   *  user dismisses it. Backward-compat: missing field loads as false. */
  seenCaptureHint: boolean
  /** 导出选项。includeDeleted=true(默认)导出全部含软删/归档卡(完整可恢复备份);
   *  false 时仅导出活跃卡。P2 (2026-06-28)。向后兼容:旧 settings 无此字段 → 默认 true。 */
  export?: { includeDeleted?: boolean }
  /** 实验室功能(Labs)。默认全关,用户显式开启 = 接受附加风险。
   *  分层判据见 docs/specs/2026-06-30-ai-labs-strategy.md:隐私升级/自动副作用/
   *  破坏性/新颖不稳定 → 实验室;只读+确认+可撤销+稳定 → 默认开。
   *  开启时:① /settings 弹不可撤销确认门;② 代码层 useLabEnabled(id) 守卫,
   *  路径才可达(非仅 UI 隐藏);③ R2 铁律永不放宽(deviceId/apiKey/软删卡)。
   *  向后兼容:旧 settings 无此字段 → 默认全关(labs = {})。 */
  labs?: LabSettings
  /** AI 交互样本累积开关。仅 true=用户明确同意；undefined/false 均不写。
   *  独立字段(非 labs)，只在本机保留，最多 500 条。 */
  aiSampleCapture?: boolean
  /** 卡片显示模式(密度切换,2026-07):compact(默认,3 行截断)/ auto(全文,卡高随内容)/
   *  title(仅标题)/ subtitle(标题+副标题)。模式管卡高(mode A);视图设置,不进 DSL。
   *  向后兼容:旧 settings 无此字段 -> 默认 compact(旧行为)。 */
  cardDisplayMode?: 'compact' | 'auto' | 'title' | 'subtitle'
  /** AI 上下文是否包含卡片正文(content-on-demand)。默认 true(/ask 等用户主动发起的
   *  AI 任务需要 AI 理解卡片内容);关掉则画布快照只发 title(省 token + 保守)。body
   *  已在 AI_CARD_FIELDS allowlist(RAG 本就发),此开关只额外控画布快照通道。
   *  向后兼容:旧 settings 无此字段 → 默认 true。 */
  aiIncludeCardContent?: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  captureShortcut: { modKey: 'meta', shift: true, code: 'KeyE' },
  theme: 'system',
  locale: 'zh',
  profiles: [],
  activeProfileId: null,
  seenCaptureHint: false,
  export: { includeDeleted: true },
  labs: {},
}

/**
 * Keep persisted Labs aligned with the runtime registry. Old preview builds
 * wrote five experimental switches; none has a consumer now, so retaining
 * them only makes a local profile look configured when it is not.
 */
function normalizeLabs(value: unknown): LabSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const proposalCoauthorLab = (value as Record<string, unknown>).proposalCoauthorLab
  return typeof proposalCoauthorLab === 'boolean' ? { proposalCoauthorLab } : {}
}

function labsAreCanonical(value: unknown, normalized: LabSettings): boolean {
  // A missing optional field is already canonical; do not write a no-op
  // migration solely to add an empty object to an older valid profile.
  if (value === undefined) return Object.keys(normalized).length === 0
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  return keys.length === Object.keys(normalized).length &&
    keys.every((key) => key === 'proposalCoauthorLab' && record[key] === normalized.proposalCoauthorLab)
}

/** Validate a parsed AI profile(多 profile 模型)。 */
function isValidProfile(v: unknown): v is AIProfile {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return (
    typeof o.id === 'string' && o.id.length > 0 &&
    typeof o.name === 'string' &&
    isSafeProviderId(o.provider) &&
    typeof o.apiKey === 'string' &&
    isSafeBaseUrl(o.baseUrl) &&
    isSafeModelId(o.model) &&
    typeof o.enabled === 'boolean'
  )
}

function isValid(v: unknown): v is Settings {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  const sc = o.captureShortcut
  if (!sc || typeof sc !== 'object') return false
  const s = sc as Record<string, unknown>
  if (
    !(
      (s.modKey === 'meta' || s.modKey === 'ctrl') &&
      typeof s.shift === 'boolean' &&
      typeof s.code === 'string' &&
      s.code.length > 0
    )
  ) {
    return false
  }
  if (o.theme !== 'light' && o.theme !== 'dark' && o.theme !== 'system') {
    return false
  }
  if (o.locale !== 'zh' && o.locale !== 'en') {
    return false
  }
  // profiles 数组 + activeProfileId(v2 schema)。profiles 每项必须合法;
  // activeProfileId null 或指向存在 profile。
  if (!Array.isArray(o.profiles)) return false
  for (const p of o.profiles) {
    if (!isValidProfile(p)) return false
  }
  if (o.activeProfileId !== null && typeof o.activeProfileId === 'string') {
    if (!o.profiles.some((p) => (p as { id?: string }).id === o.activeProfileId)) return false
  } else if (o.activeProfileId !== null && o.activeProfileId !== undefined) {
    return false
  }
  if ('seenCaptureHint' in o && typeof o.seenCaptureHint !== 'boolean')
    return false
  // labs 字段可选(向后兼容)。先容忍旧字段使迁移能读取老 profile，
  // 但当前可写字段必须为 boolean；loadSettings 会立即丢弃其余键。
  if ('labs' in o && o.labs !== undefined && o.labs !== null) {
    if (typeof o.labs !== 'object' || Array.isArray(o.labs)) return false
    const l = o.labs as Record<string, unknown>
    if ('proposalCoauthorLab' in l && typeof l.proposalCoauthorLab !== 'boolean') return false
  }
  if ('aiSampleCapture' in o && o.aiSampleCapture !== undefined && typeof o.aiSampleCapture !== 'boolean') return false
  if ('cardDisplayMode' in o && o.cardDisplayMode !== undefined && !['compact', 'auto', 'title', 'subtitle'].includes(o.cardDisplayMode as string)) return false
  return true
}

function loadSettings(): Settings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS
  try {
    // ── v2 正常读取 ──
    // The v2 key is canonical. A stale v1 key can remain after an interrupted
    // migration or an import; reading it first would overwrite a valid v2
    // restore with obsolete settings.
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { settings?: unknown }
        if (isValid(parsed.settings)) {
          const loaded = parsed.settings as Settings
          let migrated = false
          // B1 迁移:Space 注册必败(Carbon 限制 + 输入法冲突)→ 一次性迁移 KeyE。
          if (loaded.captureShortcut?.code === 'Space') {
            loaded.captureShortcut = { ...loaded.captureShortcut, code: 'KeyE' }
            migrated = true
          }
          if (typeof loaded.seenCaptureHint !== 'boolean') {
            loaded.seenCaptureHint = false
            migrated = true
          }
          const labs = normalizeLabs(loaded.labs)
          if (!labsAreCanonical(loaded.labs, labs)) {
            loaded.labs = labs
            migrated = true
          }
          if (migrated) {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings: loaded }))
          }
          return loaded
        }
      } catch {
        // Corrupt v2 → try the legacy migration below, then fall back to defaults.
      }
    }

    // ── v1→v2 migration:旧 key 的 {settings:{ai:...}} → profiles+activeProfileId ──
    const v1raw = window.localStorage.getItem('cys-stift.settings.v1')
    if (v1raw) {
      try {
        const v1parsed = JSON.parse(v1raw) as { settings?: Record<string, unknown> }
        const ai = v1parsed.settings?.ai
        const base: Record<string, unknown> = v1parsed.settings ?? {}
        // 复用旧 isValid 分支判定 ai 合法 → 包成 profile[0]。
        const migrated: Settings = {
          captureShortcut:
            base.captureShortcut && typeof base.captureShortcut === 'object'
              ? (base.captureShortcut as Settings['captureShortcut'])
              : DEFAULT_SETTINGS.captureShortcut,
          theme: base.theme === 'light' || base.theme === 'dark' || base.theme === 'system' ? base.theme : 'system',
          locale: base.locale === 'en' ? 'en' : 'zh',
          profiles: ai && isValidAIConfigShape(ai)
            ? [{ ...(ai as object), id: genProfileId(), name: defaultProfileName((ai as { provider?: string }).provider) } as AIProfile]
            : [],
          activeProfileId: ai && isValidAIConfigShape(ai) ? 'pending' : null, // 占位,下方修正
          seenCaptureHint: typeof base.seenCaptureHint === 'boolean' ? base.seenCaptureHint : false,
          export: { includeDeleted: true },
          labs: {},
        }
        // 修正 activeProfileId 指向真实 id。
        migrated.activeProfileId = migrated.profiles[0]?.id ?? null
        // 写 v2,删 v1(迁移幂等:下次只读 v2)。
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings: migrated }))
        window.localStorage.removeItem('cys-stift.settings.v1')
        return migrated
      } catch {
        // v1 corrupt → 走默认
      }
    }
    return DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

/** v1 migration 用:旧 AIConfig 形状判定(无 id/name)。 */
function isValidAIConfigShape(v: unknown): boolean {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return (
    isSafeProviderId(o.provider) &&
    typeof o.apiKey === 'string' &&
    isSafeBaseUrl(o.baseUrl) &&
    isSafeModelId(o.model) &&
    typeof o.enabled === 'boolean'
  )
}

function defaultProfileName(provider: string | undefined): string {
  return provider === 'openai' ? 'OpenAI' : provider === 'anthropic' ? 'Anthropic' : provider === 'ollama' ? 'Ollama' : 'Profile'
}

/**
 * 写设置到 localStorage。返回 true=成功,false=配额满(QuotaExceeded)
 * 或其他写入异常——吞错而非抛,让调用方(update*)决定回滚。
 *
 * 镜像 db-client.ts(审计 H1 / quota-silence fix):配额满时回滚内存 _settings,
 * 保证「内存 = localStorage」一致性,避免「用户改了主题/快捷键/AI 配置,reload
 * 后却消失」的静默数据丢失。同时 notifyQuota,让 AppMenu 订阅的 toast 提示。
 */
function saveSettings(s: Settings): boolean {
  if (typeof window === 'undefined') return true
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings: s }))
    return true
  } catch (e) {
    // QuotaExceededError / SecurityError(隐私模式)——吞,返回 false。
    console.warn('[settings-store] persist failed (quota?)', e)
    return false
  }
}

// ── Quota 失败回调(镜像 db-client / media-store / canvas-freeform-store)──────
// settings-store 是非 React 模块(无 hook 上下文),不能直接 pushToast/i18n。
// 暴露订阅点:React 层(AppMenu)订阅一次,收到配额失败时展示 toast。
type QuotaCallback = () => void
const _quotaSubscribers = new Set<QuotaCallback>()

function notifyQuota(): void {
  for (const cb of _quotaSubscribers) cb()
}

/** 订阅配额写入失败事件(设置无法持久化时触发)。返回取消订阅。 */
export function onQuotaExceeded(cb: QuotaCallback): () => void {
  _quotaSubscribers.add(cb)
  return () => {
    _quotaSubscribers.delete(cb)
  }
}

let _settings: Settings = DEFAULT_SETTINGS
let _hydrated = false
const _subscribers = new Set<() => void>()

function notify() {
  for (const sub of _subscribers) sub()
}

function hydrateOnce() {
  if (_hydrated) return
  _hydrated = true
  _settings = loadSettings()
  notify()
}

/**
 * Re-read the persisted settings and replace the in-memory snapshot.
 *
 * Import/restore writes localStorage directly, so the hydrate-once guard would
 * otherwise leave this tab serving the pre-import settings until a full page
 * reload. Keep this operation side-effect free beyond replacing the snapshot:
 * callers invoke it only after the complete import transaction succeeds.
 */
export function rehydrateSettings(): void {
  if (typeof window === 'undefined') return
  _hydrated = true
  _settings = loadSettings()
  notify()
}

// ── Cross-tab sync (P1, 2026-07-12) ──────────────────────────────────────────
// 镜像 db-client.ts / canvas-store.ts 的 storage 监听:其它 tab 写 settings.v2
// 时本 tab 收到 storage 事件 → 重新 loadSettings + notify,否则本 tab 内存缓存
// _settings 不刷新,用户在 Tab A 改 AI profile / 主题 / 语言后 Tab B 仍显示旧值,
// 且 Tab B 的任何操作会用旧缓存覆盖刚写入的设置(静默丢失)。storage 事件只在
// 「其它 tab 写」时触发(本 tab 自己写不触发),不与 saveSettings 循环。
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return
    if (!_hydrated) return // fresh tab relies on its own first-mount hydrate
    _settings = loadSettings()
    notify()
  })
}

let _cached: Settings = _settings
function getSnapshot(): Settings {
  if (_cached !== _settings) _cached = _settings
  return _cached
}
function getServerSnapshot(): Settings {
  return _cached
}
function subscribe(cb: () => void) {
  _subscribers.add(cb)
  return () => {
    _subscribers.delete(cb)
  }
}

export const settingsStore = {
  get(): Settings {
    hydrateOnce()
    return _settings
  },
  /** Re-read settings after an external storage restore/import. */
  rehydrate(): void {
    rehydrateSettings()
  },
  /** Subscribe to settings changes. Returns an unsubscribe function.
   * Exposed for consumers (e.g. theme.ts) that need to react to
   * user settings updates outside the React tree. */
  subscribe(cb: () => void): () => void {
    return subscribe(cb)
  },
  update(patch: Partial<Settings>): void {
    hydrateOnce()
    const prev = _settings
    _settings = { ..._settings, ...patch }
    if (!saveSettings(_settings)) {
      _settings = prev // 回滚:内存与 localStorage 一致
      notifyQuota()
    }
    notify()
  },
  updateCaptureShortcut(patch: Partial<CaptureShortcut>): boolean {
    hydrateOnce()
    const next = { ..._settings.captureShortcut, ...patch }
    if (
      next.modKey === _settings.captureShortcut.modKey &&
      next.shift === _settings.captureShortcut.shift &&
      next.code === _settings.captureShortcut.code
    ) {
      return true
    }
    const prev = _settings
    _settings = {
      ..._settings,
      captureShortcut: next,
    }
    if (!saveSettings(_settings)) {
      _settings = prev
      notifyQuota()
      notify()
      return false
    }
    notify()
    return true
  },
  updateLocale(l: 'zh' | 'en'): void {
    hydrateOnce()
    if (_settings.locale === l) return
    const prev = _settings
    _settings = { ..._settings, locale: l }
    if (!saveSettings(_settings)) {
      _settings = prev
      notifyQuota()
    }
    notify()
  },
  updateTheme(theme: ThemePreference): void {
    hydrateOnce()
    if (_settings.theme === theme) return
    const prev = _settings
    _settings = { ..._settings, theme }
    if (!saveSettings(_settings)) {
      _settings = prev
      notifyQuota()
    }
    notify()
  },
  /** Mark the one-time capture hint as seen (plan Task 9). Idempotent: a no-op
   *  if already seen, so re-calling after a failed persist doesn't flip state. */
  markCaptureHintSeen(): void {
    hydrateOnce()
    if (_settings.seenCaptureHint) return
    const prev = _settings
    _settings = { ..._settings, seenCaptureHint: true }
    if (!saveSettings(_settings)) {
      _settings = prev
      notifyQuota()
    }
    notify()
  },
  /**
   * 实验室功能开关更新。partial merge 到现有 labs 对象。
   * 已注册附加能力的开关，默认全关；用户显式开启 = 接受附加风险。
   * 返回 true=持久化成功(与 upsertProfile 口径一致,便于 UI toast)。
   */
  updateLabs(patch: Partial<NonNullable<Settings['labs']>>): boolean {
    hydrateOnce()
    const prev = _settings
    const merged = normalizeLabs({ ...(_settings.labs ?? {}), ...patch })
    _settings = { ..._settings, labs: merged }
    if (!saveSettings(_settings)) {
      _settings = prev
      notifyQuota()
      notify()
      return false
    }
    notify()
    return true
  },
  /** 多 profile:新增或替换(按 id)。返回 false=配额失败(已回滚 + notifyQuota)。 */
  upsertProfile(p: AIProfile): boolean {
    hydrateOnce()
    const prev = _settings
    const idx = _settings.profiles.findIndex((x) => x.id === p.id)
    const profiles = idx >= 0
      ? _settings.profiles.map((x) => (x.id === p.id ? p : x))
      : [..._settings.profiles, p]
    _settings = { ..._settings, profiles }
    if (!saveSettings(_settings)) {
      _settings = prev
      notifyQuota()
      notify()
      return false
    }
    notify()
    return true
  },
  /** 删 profile;若删的是 active,activeProfileId 自动切第一个剩余(无剩余 → null)。 */
  deleteProfile(id: string): boolean {
    hydrateOnce()
    const prev = _settings
    const profiles = _settings.profiles.filter((x) => x.id !== id)
    const activeProfileId =
      _settings.activeProfileId === id
        ? (profiles[0]?.id ?? null) // 删的是 active → 自动切第一个剩余
        : _settings.activeProfileId
    _settings = { ..._settings, profiles, activeProfileId }
    if (!saveSettings(_settings)) {
      _settings = prev
      notifyQuota()
      notify()
      return false
    }
    notify()
    return true
  },
  /** 设 active profile(null = 取消 active)。id 不存在则忽略。 */
  setActiveProfile(id: string | null): boolean {
    hydrateOnce()
    if (id !== null && !_settings.profiles.some((x) => x.id === id)) return false
    const prev = _settings
    _settings = { ..._settings, activeProfileId: id }
    if (!saveSettings(_settings)) {
      _settings = prev
      notifyQuota()
      notify()
      return false
    }
    notify()
    return true
  },
  /** 卡片显示模式(密度切换)。返回 true=持久化成功。 */
  updateCardDisplayMode(m: 'compact' | 'auto' | 'title' | 'subtitle'): boolean {
    hydrateOnce()
    if (_settings.cardDisplayMode === m) return true
    const prev = _settings
    _settings = { ..._settings, cardDisplayMode: m }
    if (!saveSettings(_settings)) {
      _settings = prev
      notifyQuota()
      notify()
      return false
    }
    notify()
    return true
  },
}

export function useSettings(): { settings: Settings; ready: boolean } {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    hydrateOnce()
    setReady(true)
  }, [])
  const settings = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return useMemo(() => ({ settings, ready }), [settings, ready])
}
