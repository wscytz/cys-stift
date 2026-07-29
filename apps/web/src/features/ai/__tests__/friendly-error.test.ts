import { describe, expect, it } from 'vitest'
import { friendlyAIError } from '../friendly-error'
import type { MessageKey } from '@/lib/i18n/messages'

// 假 t:返回 key 本身(ai.error 拼上 error 参数),便于断言映射落到哪个文案键。
const t = (
  key: MessageKey,
  params?: Record<string, string | number | null | undefined>,
): string => (key === 'ai.error' ? `ai.error:${params?.error}` : key)

describe('friendlyAIError — 裸技术 message → 友好文案', () => {
  it('网络 / fetch 失败 / 超时 / CORS / 拒连 → ai.outputNetwork', () => {
    expect(friendlyAIError('Failed to fetch', t)).toBe('ai.outputNetwork')
    expect(friendlyAIError('The operation timed out after 30000ms', t)).toBe('ai.outputNetwork')
    expect(friendlyAIError('CORS request not http', t)).toBe('ai.outputNetwork')
    expect(friendlyAIError('connect ECONNREFUSED 127.0.0.1:11434', t)).toBe('ai.outputNetwork')
  })

  it('认证失败(401 / key 无效)→ ai.errorAuth', () => {
    expect(friendlyAIError('HTTP 401 Unauthorized', t)).toBe('ai.errorAuth')
    expect(friendlyAIError('Incorrect API key provided', t)).toBe('ai.errorAuth')
  })

  it('模型不存在(Ollama 未 pull / 404)→ ai.errorModel', () => {
    expect(
      friendlyAIError('Ollama 404: {"error":"model \\"llama3.2:3b\\" not found, try pulling it"}', t),
    ).toBe('ai.errorModel')
  })

  it('限流 / 超配额(429 / quota)→ ai.errorRateLimit', () => {
    expect(friendlyAIError('HTTP 429 Too Many Requests', t)).toBe('ai.errorRateLimit')
    expect(friendlyAIError('You exceeded your current quota', t)).toBe('ai.errorRateLimit')
  })

  it('未知错误 → 兜底 ai.error 保留原 message(不比现状差)', () => {
    expect(friendlyAIError('Something weird happened', t)).toBe('ai.error:Something weird happened')
  })
})
