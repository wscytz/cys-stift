/**
 * AISettingsPanel — 多 profile UI 测试。
 * 镜像 card-detail 组件测试法:react-dom/client + act,无 @testing-library/react。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'

// 多 profile settings 形状。
const _settings: {
  profiles: { id: string; name: string; provider: string; apiKey: string; baseUrl: string; model: string; enabled: boolean }[]
  activeProfileId: string | null
  locale: 'zh' | 'en'
} = { profiles: [], activeProfileId: null, locale: 'zh' }

const _upserted: unknown[] = []
const _deleted: string[] = []
const _activeSet: (string | null)[] = []

vi.mock('@/lib/settings-store', () => ({
  settingsStore: {
    get: () => _settings,
    subscribe: () => () => {},
    upsertProfile: vi.fn((p: unknown) => { _upserted.push(p); return true }),
    deleteProfile: vi.fn((id: string) => { _deleted.push(id); return true }),
    setActiveProfile: vi.fn((id: string | null) => { _activeSet.push(id); return true }),
  },
  useSettings: () => ({ settings: _settings, ready: true }),
}))

import { messages } from '@/lib/i18n/messages'
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    locale: _settings.locale,
    t: (key: keyof typeof messages, params?: Record<string, string | number | null | undefined>) => {
      const entry = messages[key]
      const msg = entry?.[_settings.locale]
      if (!msg) return String(key)
      if (!params) return msg
      let out: string = msg
      for (const [k, v] of Object.entries(params)) out = out.replace(`{${k}}`, String(v ?? ''))
      return out
    },
    setLocale: () => {},
  }),
}))

vi.mock('@/features/ai/test-connection', () => ({
  testConnection: vi.fn(async () => ({ ok: true, latencyMs: 12 })),
}))

import { AISettingsPanel } from '../ai-settings-panel'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const byTestId = (host: HTMLElement, id: string): Element | null =>
  host.querySelector(`[data-testid="${id}"]`)

function mount(): { host: HTMLDivElement; root: Root; unmount: () => void } {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => { root.render(React.createElement(AISettingsPanel)) })
  return { host, root, unmount: () => act(() => root.unmount()) }
}

beforeEach(() => {
  _settings.profiles = []
  _settings.activeProfileId = null
  _settings.locale = 'zh'
  _upserted.length = 0
  _deleted.length = 0
  _activeSet.length = 0
  window.localStorage.clear()
})
afterEach(() => vi.clearAllMocks())

describe('AISettingsPanel — multi-profile', () => {
  it('renders the new-profile buttons for all 3 providers', () => {
    const { host, unmount } = mount()
    expect(byTestId(host, 'new-profile-openai')).toBeTruthy()
    expect(byTestId(host, 'new-profile-anthropic')).toBeTruthy()
    expect(byTestId(host, 'new-profile-ollama')).toBeTruthy()
    unmount()
  })

  it('clicking new-profile-openai upserts a draft on Save (enabled first)', () => {
    const { host, unmount } = mount()
    // 选 OpenAI 新建
    act(() => { (byTestId(host, 'new-profile-openai') as HTMLButtonElement).click() })
    // enable(否则字段 disabled)
    const enable = host.querySelector('#ai-enabled') as HTMLInputElement
    act(() => { enable.click() })
    // save
    const save = Array.from(host.querySelectorAll('button')).find((b) => b.textContent === '保存') as HTMLButtonElement
    act(() => { save.click() })
    expect(_upserted).toHaveLength(1)
    expect((_upserted[0] as { provider: string }).provider).toBe('openai')
    unmount()
  })

  it('renders existing profiles as chips', () => {
    _settings.profiles = [
      { id: 'p1', name: 'My Ollama', provider: 'ollama', apiKey: '', baseUrl: 'http://localhost:11434', model: 'llama3.2:3b', enabled: true },
    ]
    _settings.activeProfileId = 'p1'
    const { host, unmount } = mount()
    expect(byTestId(host, 'profile-chip-p1')).toBeTruthy()
    unmount()
  })

  it('plaintext warning is a bordered callout (role=note)', () => {
    const { host, unmount } = mount()
    const note = host.querySelector('[role="note"]')
    expect(note?.textContent ?? '').toContain('明文')
    unmount()
  })
})
