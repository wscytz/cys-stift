import { describe, it, expect, vi, beforeEach } from 'vitest'

// mock ai-settings-provider:isAIReady true + 返回 cfg
vi.mock('@/features/ai/ai-settings-provider', () => ({
  getCurrentAI: () => ({ provider: 'openai', model: 'm', apiKey: 'k', baseUrl: '' }),
  isAIReady: () => true,
}))
// mock streamText:可控制返回内容
const streamTextSpy = vi.fn()
vi.mock('@/features/ai/stream-text', () => ({
  streamText: (...args: unknown[]) => streamTextSpy(...args),
}))
// mock ai-context:返回固定 serialized
vi.mock('@/features/ai/ai-context', () => ({
  serializeCardsForAI: (cards: unknown[]) => `SERIALIZED:${(cards as { id: string }[]).length}`,
}))

import { generateOutline } from '../workflows'

function makeService(cards: { id: string }[], created: unknown[]) {
  return {
    listOnCanvas: () => cards,
    create: (input: unknown) => { created.push(input) },
  } as unknown as Parameters<typeof generateOutline>[0]['service']
}

describe('generateOutline', () => {
  beforeEach(() => streamTextSpy.mockReset())

  it('ok 返回 markdown,不建卡(service.create 未被调)', async () => {
    streamTextSpy.mockResolvedValue({ content: '## Topic\n- a\n- b' })
    const created: unknown[] = []
    const svc = makeService([{ id: '1' }, { id: '2' }], created)
    const res = await generateOutline({ service: svc, canvasId: 'c' as never })
    expect(res.ok).toBe(true)
    expect(res.empty).toBeFalsy()
    expect(res.markdown).toBe('## Topic\n- a\n- b')
    expect(created).toHaveLength(0) // 关键:不建卡(确认门后才建)
  })

  it('AI 返回空 → { ok: true, empty: true }', async () => {
    streamTextSpy.mockResolvedValue({ content: '   ' })
    const svc = makeService([{ id: '1' }, { id: '2' }], [])
    const res = await generateOutline({ service: svc, canvasId: 'c' as never })
    expect(res).toEqual({ ok: true, empty: true })
  })

  it('卡片太少(<2)→ { ok: false }', async () => {
    const svc = makeService([{ id: '1' }], [])
    const res = await generateOutline({ service: svc, canvasId: 'c' as never })
    expect(res.ok).toBe(false)
    expect(streamTextSpy).not.toHaveBeenCalled()
  })

  it('首次空、二次成功 → 重试后返 markdown(Task 3 retry)', async () => {
    streamTextSpy
      .mockResolvedValueOnce({ content: '   ' })
      .mockResolvedValueOnce({ content: '## Topic\n- a' })
    const svc = makeService([{ id: '1' }, { id: '2' }], [])
    const res = await generateOutline({ service: svc, canvasId: 'c' as never })
    expect(res.ok).toBe(true)
    expect(res.empty).toBeFalsy()
    expect(res.markdown).toBe('## Topic\n- a')
    expect(streamTextSpy).toHaveBeenCalledTimes(2)
  })

  it('反复空 → 耗尽 3 次后 empty(Task 3 retry)', async () => {
    streamTextSpy.mockResolvedValue({ content: '' })
    const svc = makeService([{ id: '1' }, { id: '2' }], [])
    const res = await generateOutline({ service: svc, canvasId: 'c' as never })
    expect(res).toEqual({ ok: true, empty: true })
    expect(streamTextSpy).toHaveBeenCalledTimes(3)
  })

  it('provider reports length → stops once and exposes terminal reason', async () => {
    streamTextSpy.mockResolvedValue({
      content: 'partial markdown',
      finishReason: 'length',
      stopReason: 'max_tokens',
    })
    const svc = makeService([{ id: '1' }, { id: '2' }], [])
    const res = await generateOutline({ service: svc, canvasId: 'c' as never })
    expect(res).toEqual({ ok: true, empty: true, failureReason: 'truncated' })
    expect(streamTextSpy).toHaveBeenCalledTimes(1)
  })

  it('网络错重试成功(Task 3 + Task 1 网络 retry)', async () => {
    streamTextSpy
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ content: '## Topic\n- a' })
    const svc = makeService([{ id: '1' }, { id: '2' }], [])
    const res = await generateOutline({ service: svc, canvasId: 'c' as never })
    expect(res.ok).toBe(true)
    expect(res.markdown).toBe('## Topic\n- a')
    expect(streamTextSpy).toHaveBeenCalledTimes(2)
  })
})
