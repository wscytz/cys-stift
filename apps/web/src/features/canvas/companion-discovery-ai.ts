/**
 * AI 深挖 prompt + parser(Plan A T4)。
 *
 * 给一组发现卡(duplicate/relation/orphan)调一次 AI,让它给一句话说明这组卡的关联,
 * 可选回填一个语义 relationType。本地预筛零成本已亮出候选;深挖是按需的「问 AI 解释」。
 *
 * R2 隐私:用户 prompt 只经 serializeCardsForAI(allowlist),deviceId / media.dataUrl /
 * apiKey / 软删卡永不进 prompt。test 里有反向断言把守。
 *
 * structuredOutput:true —— 结构化任务关 DeepSeek 思考(思考吃 token 致输出截断),
 * 见 features/ai/types.ts 的 AIRequest.structuredOutput 注释。
 */
import type { Card } from '@cys-stift/domain'
import { serializeCardsForAI } from '@/features/ai/ai-context'
import type { RelationTypeId } from './relation-types'

export interface DeepenResult {
  note: string
  relationType?: RelationTypeId
}

/** AI 深挖 system prompt:分析一组卡的关联,返回 JSON。 */
export const DEEPEN_SYSTEM_PROMPT = `You analyze a small group of cards on a local inspiration canvas and explain how they relate.
Return ONLY JSON: {"note": "<one short sentence in the user's locale explaining the relation>", "relationType": "<one of: blocks, references, derived-from, related-to, embeds — or omit if unclear>"}.
Do not include card content beyond what's given. Do not invent ids.`

const VALID_TYPES: RelationTypeId[] = ['blocks', 'references', 'derived-from', 'related-to', 'embeds']

/** 用户 prompt:卡片序列化(过 allowlist)+ locale 指令。R2:serializeCardsForAI 已剥离 deviceId/dataUrl/apiKey/软删。 */
export function buildDeepenUserPrompt(cards: Card[], locale: 'zh' | 'en'): string {
  const lang = locale === 'zh' ? '中文' : 'English'
  return `${serializeCardsForAI(cards)}\n\nExplain the relationship in ${lang} (one short sentence). Return JSON only.`
}

/** 从 AI 原始输出(可能裹文本)提 JSON。失败/空 → null。 */
export function parseDeepenResult(raw: string): DeepenResult | null {
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const obj = JSON.parse(m[0]) as { note?: unknown; relationType?: unknown }
    const note = typeof obj.note === 'string' ? obj.note.trim() : ''
    const rt = typeof obj.relationType === 'string' && VALID_TYPES.includes(obj.relationType as RelationTypeId)
      ? (obj.relationType as RelationTypeId) : undefined
    if (!note && !rt) return null
    return { note, relationType: rt }
  } catch {
    return null
  }
}
