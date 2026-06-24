import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { streamText } from '../stream-text'
import type { AIConfig, AIProvider } from '../types'

// streamText 内部调用 registerDefaultProviders() + aiProviderFactory.create(cfg)。
// 这里直接 spy aiProviderFactory.create,返回一个 mock provider,以观测
// signal 是否被透传到 provider.streamText 的第 3 参数位。审计 M5+M9:加
// AbortController 支持后,canvas 页能取消切走的 AI 请求(省 API 费 +
// 防 unmounted setState)。
describe('streamText signal 转发', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.doUnmock('../provider-factory')
  })

  it('把 signal 透传给 provider.streamText', async () => {
    const seenSignals: (AbortSignal | undefined)[] = []
    const mockProvider: AIProvider = {
      id: 'openai',
      name: 'OpenAI',
      defaultBaseUrl: 'https://api.openai.com/v1',
      defaultModel: 'gpt-4o-mini',
      models: ['gpt-4o-mini'],
      streamText: vi.fn().mockImplementation(async (_req, _onDelta, signal) => {
        seenSignals.push(signal)
        return { content: 'ok' }
      }),
      testConnection: vi.fn(),
    }
    vi.doMock('../provider-factory', () => ({
      aiProviderFactory: {
        create: () => mockProvider,
        register: () => {},
        unregister: () => {},
        list: () => [],
      },
      // providers.registerDefaultProviders 在 streamText 顶部被调,doMock 后
      // 整个 provider-factory 模块被替换,registerDefaultProviders 会缺;但
      // streamText import 的是 './providers' 不是 './provider-factory',所以
      // 这里无需提供。下面的 re-import 会拿到 doMock 后的 streamText。
    }))
    const { streamText: streamTextMocked } = await import('../stream-text')
    const ac = new AbortController()
    await streamTextMocked(
      {
        provider: 'openai',
        apiKey: 'sk-x',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        enabled: true,
      } as AIConfig,
      { system: 's', user: 'u' },
      () => {},
      ac.signal,
    )
    expect(seenSignals[0]).toBe(ac.signal)
  })

  it('不传 signal 时仍正常调用(provider 收到 undefined)', async () => {
    const seenSignals: (AbortSignal | undefined)[] = []
    const mockProvider: AIProvider = {
      id: 'openai',
      name: 'OpenAI',
      defaultBaseUrl: 'https://api.openai.com/v1',
      defaultModel: 'gpt-4o-mini',
      models: ['gpt-4o-mini'],
      streamText: vi.fn().mockImplementation(async (_req, _onDelta, signal) => {
        seenSignals.push(signal)
        return { content: 'ok' }
      }),
      testConnection: vi.fn(),
    }
    vi.doMock('../provider-factory', () => ({
      aiProviderFactory: {
        create: () => mockProvider,
        register: () => {},
        unregister: () => {},
        list: () => [],
      },
    }))
    const { streamText: streamTextMocked } = await import('../stream-text')
    await streamTextMocked(
      {
        provider: 'openai',
        apiKey: 'sk-x',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        enabled: true,
      } as AIConfig,
      { system: 's', user: 'u' },
      () => {},
    )
    expect(seenSignals[0]).toBeUndefined()
  })
})
