/**
 * Task 3 regression: /ask must use the unified per-canvas conversation store
 * (loadConversation / saveConversation / clearConversation), reload the
 * conversation when the canvas-select changes, and persist message-level
 * `targetCanvasId` provenance so a stale proposal cannot be applied after a
 * canvas switch. The per-canvas localStorage key remains the primary scope.
 *
 * Mirrors companion-chat.test.tsx: no @testing-library/react in devDeps
 * (codebase policy); mounts via react-dom/client + act (React 19 built-in).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React, { act } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import type { CanvasId } from '@cys-stift/domain'

// --- Mocks (must be before component import; vitest hoists vi.mock) ---

const streamTextMock = vi.fn()
const pushToastMock = vi.fn()
let currentAIProfile = {
  id: 'p1',
  name: 'Profile 1',
  provider: 'openai' as const,
  apiKey: 'k',
  baseUrl: 'https://example.invalid/v1',
  model: 'm',
  enabled: true,
}
vi.mock('@/features/ai/stream-text', () => ({
  streamText: (...args: unknown[]) => streamTextMock(...args),
}))

vi.mock('@/features/ai/ai-settings-provider', () => ({
  isAIReady: (profile: unknown) => profile !== null,
  // The page must not depend on this non-reactive cache for its first render.
  getCurrentAI: () => null,
}))

vi.mock('@/features/ai/canvas-snapshot', () => ({
  snapshotCanvas: () => ({}),
  formatCanvasSnapshot: () => '(empty canvas)',
}))

vi.mock('@/features/ai/agent-prompt', () => ({
  RAG_TOP_N: 8,
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

vi.mock('@/lib/toast-store', () => ({ pushToast: (...args: unknown[]) => pushToastMock(...args) }))

vi.mock('@/features/ai/sample-store', () => ({
  addSample: vi.fn(),
  genSampleId: () => 's1',
}))

vi.mock('@/lib/settings-store', () => ({
  useSettings: () => ({
    settings: {
      profiles: [currentAIProfile],
      activeProfileId: currentAIProfile.id,
    },
    ready: true,
  }),
  settingsStore: {
    get: () => ({
      aiSampleCapture: false,
      profiles: [currentAIProfile],
      activeProfileId: currentAIProfile.id,
    }),
  },
}))

vi.mock('@/lib/db-client', () => ({
  useDb: () => ({
    service: {
      listAll: () => [],
      // Task 5 sweep calls listOnCanvas; delegate to controllable mock.
      listOnCanvas: (id: CanvasId) => listOnCanvasMock(id),
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

// --- Task 5 sweep mocks: canvasFreeformStore + delete + listOnCanvas ---
// Declared before canvas-store / canvas-freeform-store vi.mock factories that
// close over them lazily (same pattern as createMock above). These are module
// level so beforeEach can reset per test.
const deleteMock = vi.fn((_id: CanvasId): boolean => true)
const listOnCanvasMock = vi.fn((_id: CanvasId): unknown[] => [])
const freeformLoadMock = vi.fn(
  async (_id: CanvasId): Promise<unknown> => null,
)

vi.mock('@/lib/canvas-freeform-store', () => ({
  canvasFreeformStore: {
    load: (id: CanvasId) => freeformLoadMock(id),
    remove: async () => undefined,
  },
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
// Stateful mock state: canvasStore.create mutates canvasesState; useCanvases
// re-reads it. The vi.mock factory closures below capture these bindings by
// reference, so they see updated values when reassigning canvasesState.
// `let` (not `const`) so beforeEach can reset to a fresh copy per test.
let canvasesState: typeof CANVASES = []
const createMock = vi.fn((name: string): CanvasId => {
  const id = `cv-new-${canvasesState.length}` as CanvasId
  canvasesState = [
    ...canvasesState,
    {
      id,
      name,
      workspaceId: 'ws',
      view: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]
  return id
})
vi.mock('@/lib/canvas-store', () => ({
  // Closures read canvasesState/createMock lazily — safe even though the
  // vi.mock is hoisted above the let/const (TDZ only errors on access at
  // factory-run time, and these inner fns are called much later, during
  // a React render or event handler, after the lets are initialized).
  useCanvases: () => ({ snapshot: { canvases: canvasesState, activeCanvasId: CV_A }, ready: true }),
  canvasStore: {
    create: (name: string) => createMock(name),
    // Task 5 sweep calls delete; delegate to controllable mock.
    delete: (id: CanvasId) => deleteMock(id),
  },
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

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
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

// Reset stateful mock state before each test (all suites).
beforeEach(() => {
  canvasesState = [...CANVASES]
  createMock.mockClear()
  // Task 5 sweep mocks — reset to "empty" defaults each test.
  deleteMock.mockClear()
  listOnCanvasMock.mockReturnValue([])
  freeformLoadMock.mockResolvedValue(null)
  currentAIProfile = {
    id: 'p1',
    name: 'Profile 1',
    provider: 'openai',
    apiKey: 'k',
    baseUrl: 'https://example.invalid/v1',
    model: 'm',
    enabled: true,
  }
})

describe('/ask page — per-canvas conversation store (Task 3)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    streamTextMock.mockReset()
    pushToastMock.mockReset()
    streamTextMock.mockResolvedValue({ content: 'plain answer' })
  })

  it('renders the composer from reactive settings when the module cache is empty', () => {
    const { host, unmount } = render(<AskPage />)
    expect(host.querySelector('textarea.ask__input')).not.toBeNull()
    unmount()
  })

  it('exposes the conversation as a polite live log', () => {
    const { host, unmount } = render(<AskPage />)
    const thread = host.querySelector('.ask__thread')
    expect(thread?.getAttribute('role')).toBe('log')
    expect(thread?.getAttribute('aria-live')).toBe('polite')
    expect(thread?.getAttribute('aria-relevant')).toBe('additions text')
    expect(thread?.getAttribute('aria-label')).toBe('ask.threadLabel')
    unmount()
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

  it('hydrates persisted history without a server/client first-frame mismatch', async () => {
    saveConversation(CV_A, [
      { role: 'user', content: 'persisted-before-hydration' },
    ])

    const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')!
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: undefined,
      writable: true,
    })
    let markup = ''
    try {
      markup = renderToString(<AskPage />)
    } finally {
      Object.defineProperty(globalThis, 'window', windowDescriptor)
    }
    expect(markup).not.toContain('persisted-before-hydration')

    const host = document.createElement('div')
    host.innerHTML = markup
    document.body.appendChild(host)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    let root: ReturnType<typeof hydrateRoot> | null = null
    try {
      await act(async () => {
        root = hydrateRoot(host, <AskPage />)
        await Promise.resolve()
      })
      expect(host.textContent).toContain('persisted-before-hydration')
      expect(
        consoleError.mock.calls.some((args) =>
          args.some((arg) => String(arg).includes('Hydration failed')),
        ),
      ).toBe(false)
    } finally {
      consoleError.mockRestore()
      if (root) act(() => root?.unmount())
      host.remove()
    }
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

  it('send writes to current targetCanvasId key and persists message provenance', async () => {
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
    // Every newly written message carries the canvas provenance as a second
    // guard against a delayed render/apply crossing a canvas switch.
    for (const m of stored) {
      expect(m.targetCanvasId).toBe(String(CV_A))
    }
    // And NOT written to the legacy global key.
    expect(window.localStorage.getItem('cys-stift.ask-chat.v1')).toBeNull()
    unmount()
  })

  it('shows an actionable truncation message instead of a format-retry result', async () => {
    streamTextMock.mockResolvedValue({
      content: 'partial',
      finishReason: 'length',
      stopReason: 'length',
    })
    const { host, unmount } = render(<AskPage />)
    await typeAndSend(host, 'long request')
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(host.textContent).toContain('ai.outputTruncated')
    expect(host.textContent).not.toContain('ask.retrying')
    expect(pushToastMock).toHaveBeenCalledWith({ kind: 'info', message: 'ai.outputTruncated' })
    unmount()
  })
})

describe('/ask page — request ownership and cancellation', () => {
  beforeEach(() => {
    window.localStorage.clear()
    streamTextMock.mockReset()
  })

  it('Stop aborts the active signal and ignores a provider response that arrives late', async () => {
    const pending = deferred<{ content: string }>()
    streamTextMock.mockImplementation(() => pending.promise)
    const { host, unmount } = render(<AskPage />)
    await typeAndSend(host, 'cancel this')

    const signal = streamTextMock.mock.calls[0]![3] as AbortSignal
    const stop = [...host.querySelectorAll('button')].find((button) => button.textContent === 'ask.stop')!
    await act(async () => { stop.click() })
    expect(signal.aborted).toBe(true)

    await act(async () => {
      pending.resolve({ content: 'LATE STOPPED RESPONSE' })
      await Promise.resolve()
    })
    expect(host.textContent).not.toContain('LATE STOPPED RESPONSE')
    expect(host.textContent).toContain('ai.error')
    unmount()
  })

  it('switching canvas aborts and prevents a late old-canvas response from landing', async () => {
    const pending = deferred<{ content: string }>()
    streamTextMock.mockImplementation(() => pending.promise)
    saveConversation(CV_B, [{ role: 'user', content: 'new-canvas-message' }])
    const { host, unmount } = render(<AskPage />)
    await typeAndSend(host, 'old canvas request')

    const signal = streamTextMock.mock.calls[0]![3] as AbortSignal
    await switchCanvas(host, CV_B)
    expect(signal.aborted).toBe(true)

    await act(async () => {
      pending.resolve({ content: 'LATE OLD CANVAS RESPONSE' })
      await Promise.resolve()
    })
    expect(host.textContent).toContain('new-canvas-message')
    expect(host.textContent).not.toContain('LATE OLD CANVAS RESPONSE')
    unmount()
  })

  it('discards a response when the active AI profile changes mid-request', async () => {
    const pending = deferred<{ content: string }>()
    streamTextMock.mockImplementation(() => pending.promise)
    const { host, unmount } = render(<AskPage />)
    await typeAndSend(host, 'profile-bound request')

    currentAIProfile = {
      ...currentAIProfile,
      id: 'p2',
      name: 'Profile 2',
      model: 'other-model',
    }
    await act(async () => {
      pending.resolve({ content: 'STALE PROFILE RESPONSE' })
      await Promise.resolve()
    })
    expect(host.textContent).not.toContain('STALE PROFILE RESPONSE')
    expect(host.textContent).toContain('ai.error')
    unmount()
  })

  it('unmount aborts the active request and accepts no later writes', async () => {
    const pending = deferred<{ content: string }>()
    streamTextMock.mockImplementation(() => pending.promise)
    const { host, unmount } = render(<AskPage />)
    await typeAndSend(host, 'leave page')
    const signal = streamTextMock.mock.calls[0]![3] as AbortSignal

    unmount()
    expect(signal.aborted).toBe(true)
    pending.resolve({ content: 'AFTER UNMOUNT' })
    await Promise.resolve()
  })
})

describe('/ask page — new canvas from picker (Task 4: 新建即出生)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    streamTextMock.mockReset()
    streamTextMock.mockResolvedValue({ content: 'plain answer' })
  })

  it('canvas-select offers a ➕ new-canvas option (sentinel __new__)', () => {
    const { host, unmount } = render(<AskPage />)
    const select = host.querySelector('select.ask__canvas-select') as HTMLSelectElement
    const opts = Array.from(select.options)
    const newOpt = opts.find((o) => o.value === '__new__')
    expect(newOpt).toBeDefined()
    // Label starts with ➕
    expect(newOpt!.textContent ?? '').toMatch(/^\s*➕/)
    unmount()
  })

  it('selecting the sentinel calls canvasStore.create once and binds conversation to the new id', async () => {
    const { host, unmount } = render(<AskPage />)
    const select = host.querySelector('select.ask__canvas-select') as HTMLSelectElement

    // Before: 2 canvases, no create called.
    expect(createMock).not.toHaveBeenCalled()
    expect(select.options.length).toBe(3) // CV_A + CV_B + sentinel

    await switchCanvas(host, '__new__')

    // create called exactly once.
    expect(createMock).toHaveBeenCalledTimes(1)
    // The new canvas id is returned and select now shows it as the current value.
    const newId = createMock.mock.results[0]!.value as CanvasId
    expect(newId).toBeTruthy()
    expect(select.value).toBe(String(newId))
    // The new canvas now appears in the option list (no more sentinel).
    const opts = Array.from(select.options)
    expect(opts.some((o) => o.value === String(newId))).toBe(true)
    expect(opts.find((o) => o.value === '__new__')).toBeDefined() // sentinel still present
    expect(select.options.length).toBe(4) // CV_A + CV_B + new + sentinel
    unmount()
  })

  it('the created canvas default name uses ask.newCanvasName with {n} = count + 1', async () => {
    const { host, unmount } = render(<AskPage />)
    await switchCanvas(host, '__new__')
    // createMock called with the i18n key (the i18n mock returns the key as-is).
    expect(createMock).toHaveBeenCalledWith('ask.newCanvasName')
    unmount()
  })
})

describe('/ask page — unmount sweep of empty ask-created canvases (Task 5)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    streamTextMock.mockReset()
    streamTextMock.mockResolvedValue({ content: 'plain answer' })
    // Sweep defaults: all-empty (the criterion for deletion).
    listOnCanvasMock.mockReturnValue([])
    freeformLoadMock.mockResolvedValue(null)
  })

  /**
   * Helper: flush the async fire-and-forget sweep after unmount.
   * The sweep runs as an async IIFE from the cleanup; vi.waitFor polls
   * until the assertion passes (or times out).
   */
  async function flushSweep() {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })
  }

  it('truly-empty ask-created canvas (no cards / no conv / no freeform) → deleted on unmount', async () => {
    const { host, unmount } = render(<AskPage />)
    await switchCanvas(host, '__new__')
    const newId = createMock.mock.results[0]!.value as CanvasId

    // Unmount triggers the sweep cleanup.
    await act(async () => {
      unmount()
    })
    await act(async () => {
      await vi.waitFor(() => expect(deleteMock).toHaveBeenCalledTimes(1))
    })
    expect(deleteMock).toHaveBeenCalledWith(newId)
  })

  it('ask-created canvas WITH a conversation message → NOT deleted', async () => {
    const { host, unmount } = render(<AskPage />)
    await switchCanvas(host, '__new__')
    const newId = createMock.mock.results[0]!.value as CanvasId
    // Simulate a persisted conversation for this canvas.
    saveConversation(newId, [{ role: 'user', content: 'hello' }])

    await act(async () => {
      unmount()
    })
    await flushSweep()
    expect(deleteMock).not.toHaveBeenCalled()
  })

  it('ask-created canvas WITH cards on canvas → NOT deleted', async () => {
    const { host, unmount } = render(<AskPage />)
    await switchCanvas(host, '__new__')
    const newId = createMock.mock.results[0]!.value as CanvasId
    listOnCanvasMock.mockReturnValue([
      { id: 'card-1', title: 'has a card' },
    ])

    await act(async () => {
      unmount()
    })
    await flushSweep()
    expect(deleteMock).not.toHaveBeenCalled()
  })

  it('ask-created canvas WITH freeform elements → NOT deleted', async () => {
    const { host, unmount } = render(<AskPage />)
    await switchCanvas(host, '__new__')
    freeformLoadMock.mockResolvedValue({
      v: 1,
      app: 'cys-stift',
      elements: [{ kind: 'text', id: 't1' }],
    })

    await act(async () => {
      unmount()
    })
    await flushSweep()
    expect(deleteMock).not.toHaveBeenCalled()
  })

  it('non-ask-created canvas (default canvas) is never swept', async () => {
    const { host, unmount } = render(<AskPage />)
    // Don't create a canvas via ➕; just unmount.
    await act(async () => {
      unmount()
    })
    await flushSweep()
    expect(deleteMock).not.toHaveBeenCalled()
  })
})
