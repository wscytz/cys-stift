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
