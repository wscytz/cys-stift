/**
 * Task 3 regression: /ask must use the unified per-canvas conversation store
 * (loadConversation / saveConversation / clearConversation), reload the
 * conversation when the canvas-select changes, and must NOT persist a
 * `targetCanvasId` field on chat messages (the per-canvas localStorage key
 * already encodes the canvas).
 *
 * Mirrors companion-chat.test.tsx: no @testing-library/react in devDeps
 * (codebase policy); mounts via react-dom/client + act (React 19 built-in).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { CanvasId } from '@cys-stift/domain'

// --- Mocks (must be before component import; vitest hoists vi.mock) ---

const streamTextMock = vi.fn()
vi.mock('@/features/ai/stream-text', () => ({
  streamText: (...args: unknown[]) => streamTextMock(...args),
}))

vi.mock('@/features/ai/ai-settings-provider', () => ({
  isAIReady: () => true,
  getCurrentAI: () => ({ provider: 'openai', apiKey: 'k', model: 'm' }),
}))

vi.mock('@/features/ai/canvas-snapshot', () => ({
  snapshotCanvas: () => ({}),
  formatCanvasSnapshot: () => '(empty canvas)',
}))

vi.mock('@/features/ai/agent-prompt', () => ({
  AGENT_SYSTEM_PROMPT: 'sys',
  buildAgentUserPrompt: (q: string) => `PROMPT:${q}`,
  extractDslBlocks: () => [],
  extractCardRefs: () => [],
}))

vi.mock('@/features/ai/agent-confirm-card', () => ({
  AgentConfirmCard: () => null,
}))

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (k: string) => k }),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, ...rest }: { children?: React.ReactNode } & Record<string, unknown>) =>
    React.createElement('a', rest, children),
}))

vi.mock('@/lib/toast-store', () => ({ pushToast: vi.fn() }))

vi.mock('@/features/ai/sample-store', () => ({
  addSample: vi.fn(),
  genSampleId: () => 's1',
}))

vi.mock('@/lib/settings-store', () => ({
  settingsStore: { get: () => ({ aiSampleCapture: false }) },
}))

vi.mock('@/lib/db-client', () => ({
  useDb: () => ({
    service: {
      listAll: () => [],
      get: () => undefined,
      update: () => undefined,
      softDelete: () => undefined,
    },
    ready: true,
  }),
}))

// Minimal stub for @cys-stift/ui so we don't pull in the design-system
// dependency graph. Keep the Button element interactive (onClick / disabled).
vi.mock('@cys-stift/ui', () => ({
  BauhausMotif: () => null,
  Card: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  Tag: () => null,
  Toolbar: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  Button: ({ children, onClick, disabled }: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) =>
    React.createElement('button', { onClick, disabled, type: 'button' }, children),
}))

vi.mock('@/components/page-loading', () => ({ PageLoading: () => null }))
vi.mock('@/features/card/card-detail', () => ({ CardDetailModal: () => null }))
vi.mock('@/features/ai/ai-setup-card', () => ({ AiSetupCard: () => null }))
vi.mock('@/features/canvas/canvas-host-builder', () => ({
  buildCanvasHostForCanvas: async () => ({ host: {} }),
}))

// --- Controlled canvases for the select ---
import { DEFAULT_CANVAS_ID } from '@/features/canvas/default-canvas'
const CV_A: CanvasId = DEFAULT_CANVAS_ID
const CV_B = 'cv-other' as CanvasId
const CANVASES = [
  {
    id: CV_A,
    name: 'Canvas A',
    workspaceId: 'ws',
    view: {},
    createdAt: '1970-01-01T00:00:00.000Z',
    updatedAt: '1970-01-01T00:00:00.000Z',
  },
  {
    id: CV_B,
    name: 'Canvas B',
    workspaceId: 'ws',
    view: {},
    createdAt: '1970-01-01T00:00:00.000Z',
    updatedAt: '1970-01-01T00:00:00.000Z',
  },
]
vi.mock('@/lib/canvas-store', () => ({
  useCanvases: () => ({ snapshot: { canvases: CANVASES, activeCanvasId: CV_A }, ready: true }),
}))

import AskPage from '../page'
import { saveConversation, conversationKey } from '@/lib/conversation-store'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom doesn't implement Element.scrollTo — the page's auto-scroll effect
// calls scrollRef.current?.scrollTo. Stub it so the effect doesn't crash
// the mount before our assertions run.
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = function scrollTo() {
    /* no-op for tests */
  }
}

function render(el: React.ReactElement) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(el)
  })
  return { host, unmount: () => act(() => root.unmount()) }
}

/** Drive the canvas-select to a new value. */
async function switchCanvas(host: HTMLDivElement, value: string) {
  const select = host.querySelector('select.ask__canvas-select') as HTMLSelectElement
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
    setter.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

/** Set textarea value + dispatch Enter to trigger send. Drains async chain. */
async function typeAndSend(host: HTMLDivElement, text: string) {
  const input = host.querySelector('textarea.ask__input') as HTMLTextAreaElement
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    setter.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => {
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    )
    await vi.waitFor(() => {
      expect(streamTextMock).toHaveBeenCalled()
    })
  })
}

describe('/ask page — per-canvas conversation store (Task 3)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    streamTextMock.mockReset()
    streamTextMock.mockResolvedValue({ content: 'plain answer' })
  })

  it('renders messages from the current targetCanvasId conversation on mount', () => {
    saveConversation(CV_A, [
      { role: 'user', content: 'hello-A' },
      { role: 'assistant', content: 'world-A' },
    ])
    const { host, unmount } = render(<AskPage />)
    const text = host.textContent ?? ''
    expect(text).toContain('hello-A')
    expect(text).toContain('world-A')
    unmount()
  })

  it('switching the canvas-select reloads the new canvas conversation (old gone)', async () => {
    saveConversation(CV_A, [{ role: 'user', content: 'msg-A-visible' }])
    saveConversation(CV_B, [{ role: 'user', content: 'msg-B-visible' }])
    const { host, unmount } = render(<AskPage />)
    expect(host.textContent).toContain('msg-A-visible')
    expect(host.textContent).not.toContain('msg-B-visible')

    await switchCanvas(host, CV_B)

    const after = host.textContent ?? ''
    expect(after).toContain('msg-B-visible')
    expect(after).not.toContain('msg-A-visible')
    unmount()
  })

  it('send writes to current targetCanvasId key; persisted messages have NO targetCanvasId field', async () => {
    const { host, unmount } = render(<AskPage />)
    await typeAndSend(host, 'test question')
    // Wait for the 400ms debounced save to fire.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 550))
    })

    // Written to the per-canvas key for CV_A (= DEFAULT_CANVAS_ID)?
    const raw = window.localStorage.getItem(conversationKey(CV_A))
    expect(raw).not.toBeNull()
    const stored = JSON.parse(raw!) as Record<string, unknown>[]
    expect(stored.length).toBeGreaterThanOrEqual(2)
    // Every persisted message must omit targetCanvasId (the key encodes canvas).
    for (const m of stored) {
      expect(m).not.toHaveProperty('targetCanvasId')
    }
    // And NOT written to the legacy global key.
    expect(window.localStorage.getItem('cys-stift.ask-chat.v1')).toBeNull()
    unmount()
  })
})
