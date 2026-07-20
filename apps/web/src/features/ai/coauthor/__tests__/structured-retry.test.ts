import { describe, expect, it } from 'vitest'
import { retryStructured } from '../structured-retry'
import { AIProviderHttpError } from '../../types'

describe('retryStructured', () => {
  it('keeps a bounded decoder path list in its one correction attempt', async () => {
    const corrections: Array<string | undefined> = []
    const result = await retryStructured(
      async (correction) => {
        corrections.push(correction)
        return { content: corrections.length === 1 ? 'bad' : 'good' }
      },
      (text) => text === 'good' ? { ok: true as const, value: text } : { ok: false as const, errors: ['$.items[0].action', '$.items[1].evidence'] },
    )
    expect(result).toMatchObject({ ok: true, value: 'good', attempts: 2 })
    expect(corrections[1]).toContain('$.items[0].action')
  })

  it.each([
    [new DOMException('slow', 'TimeoutError'), 'timeout'],
    [new DOMException('cancelled', 'AbortError'), 'abort'],
    [new Error('401 Unauthorized'), 'auth'],
    [new Error('429 rate limit'), 'rate-limit'],
    [new Error('quota exceeded'), 'quota'],
    [new Error('Failed to fetch'), 'offline'],
  ] as const)('classifies terminal provider failures: %s', async (error, failure) => {
    const result = await retryStructured(async () => { throw error }, () => ({ ok: true as const, value: 'never' }))
    expect(result).toMatchObject({ ok: false, failure, attempts: 1 })
  })

  it('retries one rate-limit response only when Retry-After is explicit', async () => {
    const sleeps: number[] = []
    let calls = 0
    const result = await retryStructured(
      async () => {
        calls++
        if (calls === 1) throw new AIProviderHttpError('rate limited', 429, 250)
        return { content: 'ok' }
      },
      (text) => ({ ok: true as const, value: text }),
      { sleep: async (ms) => { sleeps.push(ms) } },
    )
    expect(result).toEqual({ ok: true, value: 'ok', attempts: 2 })
    expect(sleeps).toEqual([250])
  })

  it('does not retry a 429 without Retry-After', async () => {
    let calls = 0
    const result = await retryStructured(
      async () => { calls++; throw new AIProviderHttpError('rate limited', 429) },
      () => ({ ok: true as const, value: 'never' }),
    )
    expect(result).toEqual({ ok: false, failure: 'rate-limit', attempts: 1 })
    expect(calls).toBe(1)
  })

  it('classifies an unrecognized transport error as network', async () => {
    const result = await retryStructured(async () => { throw new Error('socket closed') }, () => ({ ok: true as const, value: 'never' }))
    expect(result).toEqual({ ok: false, failure: 'network', attempts: 1 })
  })

  it.each([
    [{ content: '', finishReason: 'refusal' as const }, 'refusal'],
    [{ content: '', finishReason: 'content_filter' as const }, 'content-filter'],
    [{ content: '{', finishReason: 'length' as const }, 'truncated'],
  ] as const)('does not retry terminal structured responses: %s', async (response, failure) => {
    let attempts = 0
    const result = await retryStructured(async () => { attempts++; return response }, () => ({ ok: false as const, errors: ['$'] }))
    expect(result).toMatchObject({ ok: false, failure, attempts: 1 })
    expect(attempts).toBe(1)
  })
})
