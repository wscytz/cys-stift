import { describe, it, expect, vi } from 'vitest'
import { retryUntilValid, buildDslCorrection } from '../retry-until-valid'
import type { DslDiagnostic } from '../dsl-parser'

const ERR = (line: number, text: string, message: string): DslDiagnostic => ({ line, text, message })

describe('retryUntilValid', () => {
  it('returns immediately when first parse ok (attempts=1, accepted=true)', async () => {
    const produce = vi.fn().mockResolvedValue('[card #a]\n')
    const parse = vi.fn().mockReturnValue({ ok: true, errors: [] })
    const r = await retryUntilValid({
      initialMessages: [{ role: 'user', content: 'q' }],
      produce,
      parse,
      buildCorrection: buildDslCorrection,
    })
    expect(r.accepted).toBe(true)
    expect(r.attempts).toBe(1)
    expect(r.text).toBe('[card #a]\n')
    expect(produce).toHaveBeenCalledTimes(1)
  })

  it('retries until ok (bad → bad → good, attempts=3)', async () => {
    const produce = vi.fn()
      .mockResolvedValueOnce('bad1')
      .mockResolvedValueOnce('bad2')
      .mockResolvedValueOnce('good')
    const parse = vi.fn()
      .mockReturnValueOnce({ ok: false, errors: [ERR(1, 'bad1', 'missing #id')] })
      .mockReturnValueOnce({ ok: false, errors: [ERR(1, 'bad2', 'missing #id')] })
      .mockReturnValueOnce({ ok: true, errors: [] })
    const r = await retryUntilValid({
      initialMessages: [{ role: 'user', content: 'q' }],
      produce,
      parse,
      buildCorrection: buildDslCorrection,
    })
    expect(r.accepted).toBe(true)
    expect(r.attempts).toBe(3)
    expect(r.text).toBe('good')
  })

  it('exhausts budget → accepted=false + lastErrors (bad×3)', async () => {
    const produce = vi.fn().mockResolvedValue('bad')
    const parse = vi.fn().mockReturnValue({ ok: false, errors: [ERR(1, 'bad', 'x')] })
    const r = await retryUntilValid({
      initialMessages: [{ role: 'user', content: 'q' }],
      produce,
      parse,
      buildCorrection: buildDslCorrection,
      maxAttempts: 3,
    })
    expect(r.accepted).toBe(false)
    expect(r.attempts).toBe(3)
    expect(r.lastErrors).toEqual([ERR(1, 'bad', 'x')])
  })

  it('appends bad output + correction to messages on retry (produce receives them)', async () => {
    const seen: { role: string; content: string }[][] = []
    const produce = vi.fn(async (messages: { role: string; content: string }[]) => {
      seen.push(messages)
      return messages.length === 1 ? 'bad' : 'good' // 首次坏,二次好
    })
    const parse = vi.fn((text: string) => (text === 'good' ? { ok: true, errors: [] } : { ok: false, errors: [ERR(2, 'bad', 'missing @pos')] }))
    await retryUntilValid({
      initialMessages: [{ role: 'user', content: 'Q' }],
      produce,
      parse,
      buildCorrection: buildDslCorrection,
    })
    // 第二次 produce 收到:原 user + assistant(bad) + user(correction 含 "missing @pos")
    expect(seen[1]).toHaveLength(3)
    expect(seen[1]![1]).toEqual({ role: 'assistant', content: 'bad' })
    expect(seen[1]![2]!.role).toBe('user')
    expect(seen[1]![2]!.content).toContain('missing @pos')
  })

  it('honors maxAttempts override', async () => {
    const produce = vi.fn().mockResolvedValue('bad')
    const parse = vi.fn().mockReturnValue({ ok: false, errors: [ERR(1, 'bad', 'x')] })
    const r = await retryUntilValid({
      initialMessages: [{ role: 'user', content: 'q' }],
      produce,
      parse,
      buildCorrection: buildDslCorrection,
      maxAttempts: 2,
    })
    expect(r.attempts).toBe(2)
    expect(produce).toHaveBeenCalledTimes(2)
  })
})

describe('buildDslCorrection', () => {
  it('formats errors as "Line N: text — message", caps to 8', () => {
    const errs: DslDiagnostic[] = Array.from({ length: 12 }, (_, i) => ERR(i + 1, `t${i}`, `m${i}`))
    const out = buildDslCorrection(errs)
    expect(out).toContain('Line 1: "t0" — m0')
    expect(out).toContain('invalid cys-dsl')
    // 前 8 条(line 1..8),不含第 9 条
    expect(out).toContain('Line 8: "t7" — m7')
    expect(out).not.toContain('Line 9:')
  })
})

describe('retryUntilValid — network errors', () => {
  it('retries on non-AbortError and succeeds on retry', async () => {
    let calls = 0
    const result = await retryUntilValid({
      initialMessages: [{ role: 'user', content: 'q' }],
      produce: async () => { calls++; if (calls === 1) throw new Error('network'); return 'ok' },
      parse: (t) => ({ ok: t === 'ok', errors: [] }),
      buildCorrection: () => 'fix',
    })
    expect(result.accepted).toBe(true)
    expect(result.attempts).toBe(2)
  })

  it('rethrows AbortError without retry', async () => {
    // 真实 streamText abort 抛 DOMException(不继承 Error),用合成实例复现 bug。
    const e = new DOMException('aborted', 'AbortError')
    await expect(retryUntilValid({
      initialMessages: [{ role: 'user', content: 'q' }],
      produce: async () => { throw e },
      parse: () => ({ ok: true, errors: [] }),
      buildCorrection: () => 'fix',
    })).rejects.toThrow('aborted')
  })

  it('exhausts attempts on repeated network errors', async () => {
    const result = await retryUntilValid({
      initialMessages: [{ role: 'user', content: 'q' }],
      produce: async () => { throw new Error('network') },
      parse: () => ({ ok: true, errors: [] }),
      buildCorrection: () => 'fix',
    })
    expect(result.accepted).toBe(false)
    expect(result.attempts).toBe(3)
    expect(result.failureReason).toBe('network')
  })
})

describe('retryUntilValid — provider termination reasons', () => {
  it('stops immediately on length truncation instead of burning all retries', async () => {
    const produce = vi.fn().mockResolvedValue({
      content: 'partial dsl',
      finishReason: 'length' as const,
      stopReason: 'length',
    })
    const result = await retryUntilValid({
      initialMessages: [{ role: 'user', content: 'q' }],
      produce,
      parse: () => ({ ok: false, errors: [ERR(1, 'partial', 'unterminated')] }),
      buildCorrection: () => 'fix',
    })
    expect(result.accepted).toBe(false)
    expect(result.attempts).toBe(1)
    expect(result.failureReason).toBe('truncated')
    expect(result.finishReason).toBe('length')
    expect(result.stopReason).toBe('length')
    expect(produce).toHaveBeenCalledTimes(1)
  })

  it('stops immediately on refusal and exposes the provider message', async () => {
    const produce = vi.fn().mockResolvedValue({
      content: '',
      finishReason: 'refusal' as const,
      stopReason: 'refusal',
      refusal: '内容无法处理',
    })
    const result = await retryUntilValid({
      initialMessages: [{ role: 'user', content: 'q' }],
      produce,
      parse: () => ({ ok: false, errors: [ERR(0, '', 'empty output')] }),
      buildCorrection: () => 'fix',
    })
    expect(result.accepted).toBe(false)
    expect(result.attempts).toBe(1)
    expect(result.failureReason).toBe('refusal')
    expect(result.refusal).toBe('内容无法处理')
    expect(produce).toHaveBeenCalledTimes(1)
  })

  it('does not silently accept even parseable text when provider reports length', async () => {
    const result = await retryUntilValid({
      initialMessages: [{ role: 'user', content: 'q' }],
      produce: async () => ({ content: 'complete', stopReason: 'max_tokens' }),
      parse: () => ({ ok: true, errors: [] }),
      buildCorrection: () => 'fix',
    })
    expect(result.accepted).toBe(false)
    expect(result.failureReason).toBe('truncated')
    expect(result.finishReason).toBe('length')
    expect(result.stopReason).toBe('max_tokens')
  })
})

describe('retryUntilValid — edge cases (逻辑测试批)', () => {
  it('混合:网络错(0)→ parse 错(1,喂 correction)→ 成功(2)', async () => {
    let calls = 0
    const seen: string[][] = []
    const result = await retryUntilValid({
      initialMessages: [{ role: 'user', content: 'q' }],
      produce: async (messages) => {
        calls++
        seen.push(messages.map((m) => m.content))
        if (calls === 1) throw new Error('network')
        if (calls === 2) return 'bad'
        return 'ok'
      },
      parse: (t) => (t === 'ok' ? { ok: true, errors: [] } : { ok: false, errors: [ERR(1, 'bad', 'wrong')] }),
      buildCorrection: (errs) => `fix:${errs[0]!.message}`,
    })
    expect(result.accepted).toBe(true)
    expect(result.attempts).toBe(3)
    // 网络错(attempt 1)重试同 messages(无 correction);parse 错(attempt 2)喂了 correction
    expect(seen[1]).toEqual(['q'])
    expect(seen[2]).toContain('fix:wrong')
  })

  it('produce 抛 string(非 Error 非 DOMException)→ 当网络错重试,非 AbortError', async () => {
    let calls = 0
    const result = await retryUntilValid({
      initialMessages: [{ role: 'user', content: 'q' }],
      produce: async () => { calls++; if (calls === 1) throw 'string error'; return 'ok' },
      parse: (t) => ({ ok: t === 'ok', errors: [] }),
      buildCorrection: () => 'fix',
    })
    expect(result.accepted).toBe(true)
    expect(result.attempts).toBe(2)
  })

  it('produce 抛 null → 当网络错重试(不炸)', async () => {
    let calls = 0
    const result = await retryUntilValid({
      initialMessages: [{ role: 'user', content: 'q' }],
      produce: async () => { calls++; if (calls === 1) throw null; return 'ok' },
      parse: (t) => ({ ok: t === 'ok', errors: [] }),
      buildCorrection: () => 'fix',
    })
    expect(result.accepted).toBe(true)
    expect(result.attempts).toBe(2)
  })

  it('AbortError 在重试中途(attempt 1)→ 立即冒出,不再重试', async () => {
    let calls = 0
    await expect(retryUntilValid({
      initialMessages: [{ role: 'user', content: 'q' }],
      produce: async () => {
        calls++
        if (calls === 1) throw new Error('network')
        throw new DOMException('aborted', 'AbortError')
      },
      parse: () => ({ ok: true, errors: [] }),
      buildCorrection: () => 'fix',
    })).rejects.toThrow('aborted')
    expect(calls).toBe(2)
  })
})
