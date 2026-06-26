/**
 * card-detail ✨ AI entry — single always-visible AI button routing (plan Task 5).
 *
 * Codebase policy: no @testing-library/react in devDeps. We mount
 * CardDetailModal via react-dom/client + `act` (built into React 19, zero
 * new deps) and use plain DOM queries that are the exact equivalents of the
 * RTL helpers the plan originally specified:
 *   getByTestId(id)     → host.querySelector(`[data-testid="${id}"]`)
 *   fireEvent.click(el) → act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
 *
 * We drive both isAIReady branches by mocking @/features/ai/ai-settings-provider
 * and stub @/features/ai/ai-popover so we test routing only (not streaming).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { Card } from '@cys-stift/domain'

// isAIReady / getCurrentAI are the gate. We drive both branches by mocking
// the provider module; the mock delegates to vi.fn so each test can set the
// return value. useAIEnabled stays true (the ✨ AI entry is ALWAYS visible
// per spec §3.2, regardless of the configured-but-disabled flag).
const mockIsAIReady = vi.fn()
const mockGetCurrentAI = vi.fn()
vi.mock('@/features/ai/ai-settings-provider', () => ({
  useAIEnabled: () => true,
  isAIReady: (cfg: unknown) => mockIsAIReady(cfg),
  getCurrentAI: () => mockGetCurrentAI(),
}))

// Stub AIPopover so we only assert routing (not the streaming side effects).
vi.mock('@/features/ai/ai-popover', () => ({
  AIPopover: (props: { onClose: () => void }) =>
    React.createElement(
      'div',
      { 'data-testid': 'ai-popover-stub' },
      React.createElement(
        'button',
        { onClick: props.onClose },
        'close',
      ),
    ),
}))

// Minimal real translator bound to the messages table (zh locale) so t(...)
// resolves for the strings CardDetailModal renders. Avoids the full
// I18nProvider + its settingsStore subscriptions.
const _locale: 'zh' | 'en' = 'zh'
import { messages } from '@/lib/i18n/messages'
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    locale: _locale,
    t: (
      key: keyof typeof messages,
      params?: Record<string, string | number | null | undefined>,
    ) => {
      const entry = messages[key]
      const msg = entry?.[_locale]
      if (!msg) return String(key)
      if (!params) return msg
      let out: string = msg
      for (const [k, v] of Object.entries(params)) {
        out = out.replace(`{${k}}`, String(v ?? ''))
      }
      return out
    },
    setLocale: () => {},
  }),
}))

// mediaStore.getAsset is called during render for any media refs; our fake
// card has no media, but the module import still runs — stub it to be safe.
vi.mock('@/lib/media-store', () => ({
  mediaStore: {
    getAsset: () => null,
    attach: vi.fn(),
    remove: vi.fn(),
  },
}))

import { CardDetailModal, type CardDetailModalProps } from '../card-detail'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

interface Mount {
  host: HTMLDivElement
  root: Root
  unmount: () => void
}

function mount(el: React.ReactElement): Mount {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(el)
  })
  return { host, root, unmount: () => act(() => root.unmount()) }
}

// ── query helpers (data-attribute based; never class based) ──
const byTestId = (host: HTMLElement, id: string): Element | null =>
  host.querySelector(`[data-testid="${id}"]`)

const click = (host: HTMLElement, id: string): void => {
  const el = byTestId(host, id)
  if (!el) throw new Error(`click: no element with data-testid="${id}"`)
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function fakeCard(): Card {
  return {
    id: 'c1' as never,
    title: 'T',
    body: 'B',
    type: 'note',
    tags: [],
    media: [],
    links: [],
    codeSnippets: [],
    quotes: [],
    source: { kind: 'manual', deviceId: 'dev' } as never,
    capturedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    pinned: false,
    archived: false,
  } as unknown as Card
}

// CardDetailModal's required props: card, actions, onClose, onSave,
// onConfirmDelete (onAIAppendNew / the rest are optional). The plan's
// baseProps mentioned an `open` field, but CardDetailModalProps has no
// `open` prop (the Modal is always open=true internally) — so we omit it.
const baseProps = (
  overrides: Partial<CardDetailModalProps> = {},
): CardDetailModalProps =>
  ({
    card: fakeCard(),
    actions: ['summarize', 'rewrite', 'translate', 'export', 'softDelete'],
    onClose: vi.fn(),
    onSave: vi.fn(),
    onConfirmDelete: vi.fn(),
    ...overrides,
  } as unknown as CardDetailModalProps)

beforeEach(() => {
  mockIsAIReady.mockReset()
  mockGetCurrentAI.mockReset()
})
afterEach(() => vi.clearAllMocks())

describe('card-detail ✨ AI entry', () => {
  it('renders the ✨ AI button even when AI is not ready', () => {
    mockGetCurrentAI.mockReturnValue(null)
    mockIsAIReady.mockReturnValue(false)
    const { host, unmount } = mount(<CardDetailModal {...baseProps()} />)
    expect(byTestId(host, 'card-ai-entry')).toBeTruthy()
    unmount()
  })

  it('routes to AiSetupCard when AI is not ready', () => {
    mockGetCurrentAI.mockReturnValue(null)
    mockIsAIReady.mockReturnValue(false)
    const { host, unmount } = mount(<CardDetailModal {...baseProps()} />)
    click(host, 'card-ai-entry')
    expect(byTestId(host, 'ai-setup-card')).toBeTruthy()
    unmount()
  })

  it('routes to AiActionMenu when AI is ready', () => {
    mockGetCurrentAI.mockReturnValue({ provider: 'openai', enabled: true })
    mockIsAIReady.mockReturnValue(true)
    const { host, unmount } = mount(<CardDetailModal {...baseProps()} />)
    click(host, 'card-ai-entry')
    expect(byTestId(host, 'ai-action-menu')).toBeTruthy()
    unmount()
  })

  it('picking summarize from the menu routes into the popover', () => {
    mockGetCurrentAI.mockReturnValue({ provider: 'openai', enabled: true })
    mockIsAIReady.mockReturnValue(true)
    const { host, unmount } = mount(<CardDetailModal {...baseProps()} />)
    click(host, 'card-ai-entry')
    click(host, 'ai-menu-summarize')
    expect(byTestId(host, 'ai-popover-stub')).toBeTruthy()
    unmount()
  })
})
