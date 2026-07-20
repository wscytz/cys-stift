/**
 * Task 2 regression: CompanionChat must send conversation history to the AI
 * (prior turns), not just the current turn. Previously the `initialMessages`
 * passed to retryUntilValid/streamText was `[{role:'user', content:userPrompt}]`
 * only — so the AI had no memory of earlier turns in the same chat ("AI says
 * it has no context" bug).
 *
 * Mirrors /ask's pattern: `messages.slice(-MAX_HISTORY).map(m => ({role, content}))`
 * then `initialMessages: [...history, {role:'user', content:userPrompt}]`.
 *
 * No @testing-library/react in devDeps (codebase policy); mounts via
 * react-dom/client + act (React 19 built-in) per use-debounced-callback.test.tsx.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { CanvasId } from '@cys-stift/domain'

// --- Mocks (must be before component import; vitest hoists vi.mock) ---

const streamTextMock = vi.fn()
const pushToastMock = vi.fn()
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
  useI18n: () => ({
    t: (k: string) => k,
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/lib/toast-store', () => ({
  pushToast: (...args: unknown[]) => pushToastMock(...args),
}))

vi.mock('@/features/ai/sample-store', () => ({
  addSample: vi.fn(),
  genSampleId: () => 's1',
}))

vi.mock('@/lib/settings-store', () => ({
  settingsStore: { get: () => ({ aiSampleCapture: false }) },
}))

import { CompanionChat } from '../companion-chat'
import { saveConversation } from '@/lib/conversation-store'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true

const CID = 'cv-companion-test' as CanvasId

function render(el: React.ReactElement) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(el)
  })
  return { host, unmount: () => act(() => root.unmount()) }
}

function makeProps() {
  return {
    host: {} as never,
    service: {
      listAll: () => [],
      get: () => undefined,
      update: () => undefined,
      softDelete: () => undefined,
    } as never,
    canvasId: CID,
    getCardTitle: () => undefined,
  }
}

/** Drive a controlled <input> + click send, draining the async send() chain. */
async function typeAndSend(host: HTMLDivElement, text: string) {
  const input = host.querySelector('input.cc-chat__input') as HTMLInputElement
  const btn = host.querySelector('button.cc-chat__send') as HTMLButtonElement
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!
    setter.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => {
    btn.click()
    // Drain microtask queue so the async send() → retryUntilValid → streamText
    // chain completes before we assert.
    await vi.waitFor(() => {
      expect(streamTextMock).toHaveBeenCalled()
    })
  })
}

describe('CompanionChat — sends conversation history to AI (Task 2)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    streamTextMock.mockReset()
    pushToastMock.mockReset()
    streamTextMock.mockResolvedValue({ content: 'Just a plain answer.' })
  })

  it('includes prior turns in streamText messages (length > 1)', async () => {
    // Pre-populate conversation store with two prior turns.
    saveConversation(CID, [
      { role: 'user', content: 'earlier question' },
      { role: 'assistant', content: 'earlier answer' },
    ])

    const { host, unmount } = render(<CompanionChat {...makeProps()} />)
    await typeAndSend(host, 'follow-up question')

    expect(streamTextMock).toHaveBeenCalledTimes(1)
    const req = streamTextMock.mock.calls[0]![1] as {
      messages?: { role: string; content: string }[]
    }
    expect(req.messages).toBeDefined()
    // 2 history + 1 current = 3
    expect(req.messages!.length).toBe(3)
    // First two must be the prior turns (not just the new prompt).
    expect(req.messages![0]!.content).toBe('earlier question')
    expect(req.messages![1]!.content).toBe('earlier answer')
    // Last is the current user prompt.
    expect(req.messages![2]!.role).toBe('user')

    unmount()
  })

  it('exposes the conversation as a polite live log', () => {
    const { host, unmount } = render(<CompanionChat {...makeProps()} />)
    const thread = host.querySelector('.cc-chat__thread')
    expect(thread?.getAttribute('role')).toBe('log')
    expect(thread?.getAttribute('aria-live')).toBe('polite')
    expect(thread?.getAttribute('aria-relevant')).toBe('additions text')
    expect(thread?.getAttribute('aria-label')).toBe('canvas.companion.chat.threadLabel')
    unmount()
  })

  it('sends only current turn when no prior history', async () => {
    const { host, unmount } = render(<CompanionChat {...makeProps()} />)
    await typeAndSend(host, 'first question')

    expect(streamTextMock).toHaveBeenCalledTimes(1)
    const req = streamTextMock.mock.calls[0]![1] as {
      messages?: unknown[]
    }
    expect(req.messages).toBeDefined()
    expect(req.messages!.length).toBe(1)

    unmount()
  })

  it('does NOT send dslBlocks field to provider (role+content only)', async () => {
    saveConversation(CID, [
      {
        role: 'assistant',
        content: 'prior with dsl',
        dslBlocks: ['```cys-dsl\ncreate card\n```'],
      },
    ])

    const { host, unmount } = render(<CompanionChat {...makeProps()} />)
    await typeAndSend(host, 'next question')

    const req = streamTextMock.mock.calls[0]![1] as {
      messages?: Record<string, unknown>[]
    }
    // Every history message must have exactly {role, content} — no dslBlocks.
    const historyMsg = req.messages!.find((m) => m.content === 'prior with dsl')
    expect(historyMsg).toBeDefined()
    expect(historyMsg).not.toHaveProperty('dslBlocks')

    unmount()
  })

  it('shows a terminal truncation message instead of the generic format retry', async () => {
    streamTextMock.mockResolvedValue({
      content: 'partial',
      finishReason: 'length',
      stopReason: 'length',
    })
    const { host, unmount } = render(<CompanionChat {...makeProps()} />)
    await typeAndSend(host, 'long request')
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(host.textContent).toContain('ai.outputTruncated')
    expect(host.textContent).not.toContain('ask.retrying')
    expect(pushToastMock).toHaveBeenCalledWith({ kind: 'info', message: 'ai.outputTruncated' })
    unmount()
  })
})
