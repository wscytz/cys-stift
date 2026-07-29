import type { MessageKey } from '@/lib/i18n/messages'

type T = (
  key: MessageKey,
  params?: Record<string, string | number | null | undefined>,
) => string

/**
 * 把 AI 运行失败的裸技术 message 映射到用户看得懂的友好文案(本地化)。
 *
 * 背景:provider 抛的 Error.message 是英文技术串("Failed to fetch"、
 * "Ollama 404: {...model not found...}"、"HTTP 401"),直接塞进 `ai.error`
 * 会让首次用 AI 的内测用户(尤其零成本 Ollama 路径)一头雾水。这里按签名
 * 归类到既有的友好文案键。**兜底回 ai.error(保留原 message)**——映射本身
 * 出 bug 也不会比现状更差。
 *
 * 覆盖首次最常撞的几类:认证失败 / 模型不存在(尤 Ollama 未 pull)/ 限流超
 * 配额 / 网络连接(fetch 失败、超时、CORS、ECONNREFUSED)。
 */
export function friendlyAIError(message: string, t: T): string {
  const m = (message || '').toLowerCase()
  if (/401|unauthor|invalid (api )?key|incorrect (api )?key|authentication|bad (api )?key/.test(m))
    return t('ai.errorAuth')
  if (/404|not found|does not exist|model.*(found|exist)|no model|ollama pull|try pulling/.test(m))
    return t('ai.errorModel')
  if (/429|rate.?limit|too many requests|quota|insufficient/.test(m))
    return t('ai.errorRateLimit')
  if (/failed to fetch|fetch failed|networkerror|network|timeout|timed out|econnrefused|econnreset|cors|ollama_origins|connection|socket hang up/.test(m))
    return t('ai.outputNetwork')
  return t('ai.error', { error: message })
}
