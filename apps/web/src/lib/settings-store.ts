'use client'

import { useEffect, useMemo, useSyncExternalStore, useState } from 'react'
import {
  isSafeProviderId,
  isSafeModelId,
  isSafeBaseUrl,
} from './safe-href'

// ── Settings store (spec §5.5 "可在设置改") ───────────────────────────────
// Web-local keymap + future settings. Backed by localStorage, same
// singleton pattern as draft-store / canvas-view-store. Tauri (Phase 8)
// will read the same shape from its settings file.

const STORAGE_KEY = 'cys-stift.settings.v1'

export interface CaptureShortcut {
  /** 'meta' = Cmd (mac) / 'ctrl' = Ctrl (win). We store one; CaptureHost
   * accepts either at match time for cross-platform forgiveness. */
  modKey: 'meta' | 'ctrl'
  shift: boolean
  /** KeyboardEvent.code value, e.g. 'Space', 'KeyC', 'Comma'. */
  code: string
}

/**
 * Theme preference (spec §5.6, 2026-06-20). 'system' follows the OS
 * `prefers-color-scheme` media query; 'light' / 'dark' are explicit
 * user overrides. Root layout reads this and sets `data-theme` on
 * <html> so the CSS variable variant in tokens.css kicks in.
 */
export type ThemePreference = 'light' | 'dark' | 'system'

/**
 * M3 — AI configuration. Stored as `ai: AIConfig | null` on Settings:
 *   - `null`  → user has never configured AI (no buttons render)
 *   - object  → user filled in the /settings panel, but the buttons still
 *     gate on `enabled` so a saved-but-disabled state is honoured.
 *
 * The apiKey is plaintext — explicit decision (M3 ADR). A UI warning banner
 * in /settings spells out the risk. M4 may add OS keychain.
 */
export interface AIConfig {
  provider: 'openai' | 'anthropic' | 'ollama'
  apiKey: string
  baseUrl: string
  model: string
  enabled: boolean
}

export interface Settings {
  captureShortcut: CaptureShortcut
  theme: ThemePreference
  locale: 'zh' | 'en'
  ai: AIConfig | null
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
  labs?: {
    /** vision 大模型实验室:看图描述/OCR、画布视觉理解、图片转画布元素。
     *  关闭时 vision 路径完全不可达(代码层守卫,非仅 UI 隐藏)。
     *  隐私升级:开启后 media.dataUrl 可进 prompt(违反默认 R2)。 */
    visionLab?: boolean
    /** AI 自动整理实验室:跨画布自动归类/合并近重复卡。
     *  破坏性:可能合并/软删卡。开启后需逐次确认 + 可撤销。 */
    autoCurateLab?: boolean
    /** AI 自动建卡实验室:从对话/剪贴板自动生成卡片。
     *  自动副作用 + 不可预测:可能产生垃圾卡。 */
    autoCaptureLab?: boolean
    /** AI 自动打标签实验室:捕获/编辑后 AI 自动建议标签。
     *  自动副作用(低破坏):自动改卡片 tags。 */
    autoTagLab?: boolean
    /** /ask tool-calling 实验室:AI 主动多轮检索卡片。
     *  不可预测 + 多轮外发:token 不可控。 */
    agentToolCallingLab?: boolean
  }
}

export const DEFAULT_SETTINGS: Settings = {
  captureShortcut: { modKey: 'meta', shift: true, code: 'Space' },
  theme: 'system',
  locale: 'zh',
  ai: null,
  seenCaptureHint: false,
  export: { includeDeleted: true },
  labs: {},
}

/** Validate a parsed AI config. null is valid (no AI configured).
 *  Object must satisfy all 5 validators. */
function isValidAIConfig(v: unknown): v is AIConfig | null {
  if (v === null) return true
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
  // ai field is optional (backwards compat) — accept missing or null or valid
  if (!('ai' in o) || o.ai === null) {
    // seenCaptureHint, if present, must be boolean; missing is fine (back-fill).
    if ('seenCaptureHint' in o && typeof o.seenCaptureHint !== 'boolean')
      return false
    return true
  }
  if (!isValidAIConfig(o.ai)) return false
  if ('seenCaptureHint' in o && typeof o.seenCaptureHint !== 'boolean')
    return false
  // labs 字段可选(向后兼容);存在时必须是对象,各 lab 可选 boolean。
  if ('labs' in o && o.labs !== undefined && o.labs !== null) {
    if (typeof o.labs !== 'object') return false
    const l = o.labs as Record<string, unknown>
    for (const k of ['visionLab', 'autoCurateLab', 'autoCaptureLab', 'autoTagLab', 'agentToolCallingLab']) {
      if (k in l && typeof l[k] !== 'boolean') return false
    }
  }
  return true
}

function loadSettings(): Settings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as { settings?: unknown }
    if (!isValid(parsed.settings)) return DEFAULT_SETTINGS
    const loaded = parsed.settings as Settings
    // Backward-compat: an OLD payload (pre-Task-9) has no seenCaptureHint.
    // Back-fill false so the rest of the app can assume the field exists.
    if (typeof loaded.seenCaptureHint !== 'boolean') {
      loaded.seenCaptureHint = false
    }
    // labs 向后兼容:旧 payload 无此字段 → 默认全关(空对象)。
    if (!loaded.labs || typeof loaded.labs !== 'object') {
      loaded.labs = {}
    }
    return loaded
  } catch {
    return DEFAULT_SETTINGS
  }
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
  updateCaptureShortcut(patch: Partial<CaptureShortcut>): void {
    hydrateOnce()
    const prev = _settings
    _settings = {
      ..._settings,
      captureShortcut: { ..._settings.captureShortcut, ...patch },
    }
    if (!saveSettings(_settings)) {
      _settings = prev
      notifyQuota()
    }
    notify()
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
   * visionLab 等「附加能力」开关,默认全关;用户显式开启 = 接受附加风险。
   * 返回 true=持久化成功(与 updateAISettings 口径一致,便于 UI toast)。
   */
  updateLabs(patch: Partial<NonNullable<Settings['labs']>>): boolean {
    hydrateOnce()
    const prev = _settings
    const merged = { ...(_settings.labs ?? {}), ...patch }
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
  /**
   * M3 — AI settings updater. Accepts a partial patch and merges onto the
   * current config (or seeds a default-config-from-scratch if the user
   * has never configured AI). The defaults are the OpenAI defaults —
   * matches the dropdown's default selection so the panel works out of
   * the box for first-time users.
   */
  updateAISettings(patch: Partial<AIConfig>): boolean {
    hydrateOnce()
    const defaults: AIConfig = {
      provider: 'openai',
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      enabled: false,
    }
    const prev = _settings
    const merged: AIConfig = _settings.ai
      ? { ..._settings.ai, ...patch }
      : { ...defaults, ...patch }
    _settings = { ..._settings, ai: merged }
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
