import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { streamText, mergeSignalWithTimeout } from '../stream-text'
import type { AIConfig, AIProvider } from '../types'

// mergeSignalWithTimeout 纯函数:把用户 signal + 内部 timeout 合并成一个
// AbortSignal。任一 abort 都 abort,且 cleanup 清 timer。timeout abort 用
// DOMException('TimeoutError') 区别于用户取消的 AbortError。
// P0 修复:provider fetch 无超时 → 网络静默挂起 → streamText 永挂 →
// 按钮永久卡 busy。这里在 streamText 入口统一加 timeout。
describe('mergeSignalWithTimeout', () => {
  it('timeoutMs 后以 TimeoutError abort', async () => {
    const { signal } = mergeSignalWithTimeout(undefined, 50)
    expect(signal.aborted).toBe(false)
    await new Promise((r) => setTimeout(r, 80))
    expect(signal.aborted).toBe(true)
    expect((signal.reason as Error).name).toBe('TimeoutError')
  })

  it('input signal 已 aborted 时立即 abort 并沿用其 reason', () => {
    const ac = new AbortController()
    ac.abort(new DOMException('user cancel', 'AbortError'))
    const { signal } = mergeSignalWithTimeout(ac.signal, 5000)
    expect(signal.aborted).toBe(true)
    expect((signal.reason as Error).name).toBe('AbortError')
  })

  it('input signal 后续 abort 会转发(reason 沿用原 signal)', async () => {
    const ac = new AbortController()
    const { signal } = mergeSignalWithTimeout(ac.signal, 5000)
    expect(signal.aborted).toBe(false)
    ac.abort(new DOMException('user cancel', 'AbortError'))
    expect(signal.aborted).toBe(true)
    expect((signal.reason as Error).name).toBe('AbortError')
  })

  it('cleanup 清掉 timer(不 abort)', async () => {
    const { signal, cleanup } = mergeSignalWithTimeout(undefined, 50)
    cleanup()
    await new Promise((r) => setTimeout(r, 80))
    expect(signal.aborted).toBe(false)
  })
})

// streamText 内部调用 registerDefaultProviders() + aiProviderFactory.create(cfg)。
// 这里直接 spy aiProviderFactory.create,返回一个 mock provider,以观测
// 合并后的 signal 是否被传给 provider.streamText 的第 3 参数位。
// 注意:streamText 现在传的是 merged.signal(合并了 30s timeout),不是原 signal,
// 所以断言用「原 signal abort → provider 收到的 signal 也 abort」联动,而非身份相等。
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
    // streamText 传的是合并 timeout 后的 signal,不是原 ac.signal 身份;
    // 但二者联动:ac abort → provider 收到的 signal 也应 abort。
    const providerSignal = seenSignals[0]
    expect(providerSignal).toBeInstanceOf(AbortSignal)
    expect(providerSignal).not.toBe(ac.signal)
    expect(providerSignal?.aborted).toBe(false)
    ac.abort()
    expect(providerSignal?.aborted).toBe(true)
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
    // 不传 signal 时,streamText 仍会构造一个合并 timeout 的 signal 传下去
    // (不再是 undefined)。P0 修复的核心:即使无用户 signal,也有 30s 兜底。
    const providerSignal = seenSignals[0]
    expect(providerSignal).toBeInstanceOf(AbortSignal)
    expect(providerSignal?.aborted).toBe(false)
  })

  it('provider 永挂时,streamText 在 timeoutMs 后抛 TimeoutError(不永挂)', async () => {
    // 模拟 P0 场景:provider.streamText 永不 resolve/reject(网络静默挂起)。
    // streamText 必须靠内部 timeout 兜底 reject,否则按钮永久卡 busy。
    const mockProvider: AIProvider = {
      id: 'openai',
      name: 'OpenAI',
      defaultBaseUrl: 'https://api.openai.com/v1',
      defaultModel: 'gpt-4o-mini',
      models: ['gpt-4o-mini'],
      streamText: vi.fn().mockImplementation((_req, _onDelta, signal) => {
        return new Promise((_resolve, reject) => {
          // 模拟 fetch 永不返回 —— 监听 signal,timeout abort 时才 reject。
          // 真实 provider 是 fetch 收到 aborted signal 抛 AbortError;这里
          // 直接把 timeout reason 透传出去,验证 streamText 把它抛上来。
          signal?.addEventListener('abort', () => {
            reject(signal.reason)
          })
        })
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
    const t0 = Date.now()
    const cfg = {
      provider: 'openai',
      apiKey: 'sk-x',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      enabled: true,
    } as AIConfig
    // 第 5 参 timeoutMs = 50ms;不传用户 signal(走 undefined)。
    await expect(
      streamTextMocked(cfg, { system: 's', user: 'u' }, () => {}, undefined, 50),
    ).rejects.toThrow(/timed out/i)
    const elapsed = Date.now() - t0
    // 应在 ~50ms 附近 reject,绝不能永挂(>2s 就说明 timeout 没生效)。
    expect(elapsed).toBeLessThan(2000)
  })
})
