import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Card } from '@cys-stift/domain'
import type { AIConfig, AIProviderId } from '../types'
import type { AIAction } from '../prompts'

// Mock streamText BEFORE importing the module under test.
const mockStreamText = vi.fn()
vi.mock('../stream-text', () => ({ streamText: mockStreamText }))

// We import runAIAction after the mock registration so it gets the mock.
let runAIAction: typeof import('../ai-actions').runAIAction

const FAKE_CFG: AIConfig = {
  provider: 'openai' as AIProviderId,
  enabled: true,
  model: 'gpt-4',
  apiKey: 'sk-fake-key-should-not-leak',
  baseUrl: 'https://api.openai.com/v1',
}

function fakeCard(title = 'Test', body = 'Some body'): Card {
  return {
    id: 'c1' as never,
    title,
    body,
    type: 'note',
    tags: [],
    media: [],
    links: [],
    codeSnippets: [],
    quotes: [],
    source: { kind: 'manual', deviceId: 'dev-x' } as never,
    capturedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    pinned: false,
    archived: false,
  }
}

beforeEach(async () => {
  mockStreamText.mockReset()
  // Default: streamText resolves to the user prompt (so we can assert what was sent).
  mockStreamText.mockImplementation((_cfg: AIConfig, opts: { user: string }) =>
    Promise.resolve({ content: opts.user }),
  )
  // Re-import after mock to get fresh binding.
  runAIAction = (await import('../ai-actions')).runAIAction
})

describe('runAIAction — translate {{LANG}} replacement', () => {
  it('replaces {{LANG}} with 中文 when targetLang is zh', async () => {
    await runAIAction(FAKE_CFG, 'translate', fakeCard('T', 'some text'), { targetLang: 'zh' })
    const sent = mockStreamText.mock.calls[0]?.[1]?.user as string | undefined
    expect(sent).toContain('中文')
    expect(sent).not.toContain('{{LANG}}')
  })
  it('replaces {{LANG}} with English when targetLang is en', async () => {
    await runAIAction(FAKE_CFG, 'translate', fakeCard('T', 'body'), { targetLang: 'en' })
    const sent = mockStreamText.mock.calls[0]?.[1]?.user as string
    expect(sent).toContain('English')
  })
  it('defaults targetLang to en when not specified', async () => {
    await runAIAction(FAKE_CFG, 'translate', fakeCard('T', 'body'))
    const sent = mockStreamText.mock.calls[0]?.[1]?.user as string
    expect(sent).toContain('English')
  })
})

describe('runAIAction — prompt assembly (all actions)', () => {
  const actions: AIAction[] = ['summarize', 'improveWriting', 'translate']
  it.each(actions)('%s: includes the card body in the user prompt', async (a) => {
    await runAIAction(FAKE_CFG, a, fakeCard('T', 'custom body text'))
    const sent = mockStreamText.mock.calls[0]?.[1]?.user as string
    expect(sent).toContain('custom body text')
  })
  it.each(actions)('%s: system prompt is non-empty', async (a) => {
    await runAIAction(FAKE_CFG, a, fakeCard())
    const sent = mockStreamText.mock.calls[0]?.[1]?.system as string
    expect(sent.length).toBeGreaterThan(10)
  })
  it.each(actions)('%s: the API key is NOT in the user prompt', async (a) => {
    await runAIAction(FAKE_CFG, a, fakeCard())
    const sent = mockStreamText.mock.calls[0]?.[1] as { system: string; user: string }
    const allText = sent.system + sent.user
    expect(allText).not.toContain('sk-fake-key')
  })
})

describe('runAIAction — passes through config', () => {
  it('receives onDelta callbacks', async () => {
    const deltas: string[] = []
    mockStreamText.mockImplementation((_cfg, _opts, onDelta: (s: string) => void) => {
      onDelta('chunk1')
      onDelta('chunk2')
      return Promise.resolve({ content: 'done' })
    })
    await runAIAction(FAKE_CFG, 'summarize', fakeCard(), { onDelta: (c) => deltas.push(c) })
    expect(deltas).toEqual(['chunk1', 'chunk2'])
  })
  it('passes AbortSignal through', async () => {
    const ctrl = new AbortController()
    await runAIAction(FAKE_CFG, 'summarize', fakeCard(), { signal: ctrl.signal })
    const opts = mockStreamText.mock.calls[0]?.[3] as AbortSignal | undefined
    expect(opts).toBe(ctrl.signal)
  })
})
