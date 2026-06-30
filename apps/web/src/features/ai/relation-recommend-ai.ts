'use client'

/**
 * relation-recommend-ai — AI 关系候选推荐(Batch C 选项 A 的 AI 增强)。
 *
 * 【定位】补本地启发式(relation-recommend.ts)的盲区:本地靠字面重合(标题子串/
 * Jaccard/标签/ASCII 词),抓不到「语义相关但字面无重合」的卡 —— 比如「做早餐」
 * vs「营养学笔记」,本地 0 分,AI 看标题语义能判断相关。本模块用 AI 做这一层粗筛。
 *
 * 【与 cluster.ts 的区别】cluster 是画布级批量(读整画布 → AI 分组 → 直接落 related-to
 * 箭头到 host)。本模块是**单卡视角**:当前卡 + 候选标题列表 → AI 返回最相关的 id →
 * 不直接落箭头,而是作为**候选**并入推荐列表,用户一键建(走 relation-builder 的
 * addRelation,与本地推荐同路径)。候选 ≠ 自动建关系,保持非破坏性。
 *
 * 【策略:标题粗筛(省 token)】发当前卡全文(serializeCardForAI allowlist)+ 候选池
 * 每张的 [card #id] title。不发候选卡正文(几百张正文太贵)。AI 从标题语义挑相关卡。
 *
 * 【R2 隐私】
 *  - 当前卡走 serializeCardForAI(allowlist 强制:只 title/body/tags 等,无 deviceId /
 *    media.dataUrl / apiKey;软删卡返回空)。
 *  - 候选池只发 id + title(不发 body / media / deviceId)。
 *  - 软删卡过滤(调用方 + serializeCardForAI 双重)。
 *  - 不手拼当前卡字符串(走 serializeCardForAI,避免漏字段/误发敏感)。
 *
 * 【纯函数分离】build(构造 prompt)+ parse(解析输出)都是纯函数,可单测;网络副作用
 * 在调用方(card-detail 的 handler 调 streamText)。仿 cluster.ts 的 build/parse/apply 分离。
 */
import type { Card } from '@cys-stift/domain'
import { serializeCardForAI } from './ai-context'
import type { RelationRecommendation } from '@/features/canvas/relation-recommend'
import { relationTypeById } from '@/features/canvas/relation-types'

const DEFAULT_RELATED = relationTypeById('related-to')!

/** AI 候选在推荐列表里的固定分(低于本地启发式命中,让本地优先排前,AI 补在后)。 */
export const AI_RECOMMEND_SCORE = 0.5

/** 最多让 AI 返回几条(避免刷屏;调用方 build 时候选池已去重已连接)。 */
export const AI_RECOMMEND_MAX = 5

/**
 * 系统 prompt:角色 + 输出格式 + id 白名单规则。与 cluster 同风格(防御性,强调 id
 * 必须来自列表、无则输出 []、只要 JSON)。
 */
export const AI_RECOMMEND_SYSTEM_PROMPT =
  'You are a relevance suggester for an inspiration canvas. Given one "current card" and a list of candidate cards (id + title), pick the candidates that are SEMANTICALLY related to the current card — even when they share no literal words. ' +
  'Output ONLY a JSON array (no markdown, no prose). Each element: {"id":"<candidate id>","reason":"<short, why related, in the card\'s language>"}. ' +
  `Rules: id MUST come from the candidate list; return at most ${AI_RECOMMEND_MAX}; only include genuinely related cards; if none, output []. ` +
  'Prefer cards whose topic connects to the current card beyond surface word overlap.'

/**
 * 构造 AI 推荐的用户提示。当前卡走 serializeCardForAI(allowlist);候选池每张
 * `[card #id] title`(只标题,省 token)。
 *
 * @returns 提示文本;当前卡为空 / 软删 / 候选池空 → ''(调用方据此跳过,不发空请求)。
 */
export function buildAIRecommendPrompt(current: Card, candidates: Card[]): string {
  // 软删卡 serializeCardForAI 返回 '' → 整个提示空,调用方跳过。
  const currentBlock = serializeCardForAI(current)
  if (!currentBlock.trim()) return ''
  if (candidates.length === 0) return ''

  const candidateList = candidates
    .map((c) => `[card #${String(c.id)}] ${c.title || '(untitled)'}`)
    .join('\n')

  return `Find cards semantically related to the current card from the candidates below.

Current card:
${currentBlock}

Candidates (id + title):
${candidateList}

Output JSON array only (max ${AI_RECOMMEND_MAX}, only genuinely related, use exact ids):`
}

/**
 * 解析 AI 推荐输出。坏 JSON / 非数组 / id 不在白名单 → 丢弃该项;全坏 → []。
 * `knownIds` = 候选池里实际出现过的 card id(只认这些,防模型编 id)。
 *
 * 输出转成 RelationRecommendation(与本地推荐同结构,score 固定 AI_RECOMMEND_SCORE,
 * reasons ['ai'],suggestedType 默认 related-to)。
 */
export function parseAIRecommendations(raw: string, knownIds: Set<string>): RelationRecommendation[] {
  let data: unknown
  try {
    data = JSON.parse(stripJsonFence(raw))
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []

  const seen = new Set<string>()
  const out: RelationRecommendation[] = []
  for (const item of data) {
    if (!item || typeof item !== 'object') continue
    const id = normalizeId((item as { id?: unknown }).id)
    if (!id || !knownIds.has(id) || seen.has(id)) continue
    seen.add(id)
    const reason = String((item as { reason?: unknown }).reason ?? '').slice(0, 200)
    out.push({
      otherCardId: id,
      score: AI_RECOMMEND_SCORE,
      reasons: ['ai'],
      suggestedType: DEFAULT_RELATED,
      ...(reason ? { aiReason: reason } : {}),
    })
  }
  return out
}

function stripJsonFence(raw: string): string {
  let s = raw.trim()
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  }
  return s.trim()
}

function normalizeId(id: unknown): string | null {
  if (typeof id === 'number') return String(id)
  if (typeof id === 'string') return id.trim()
  return null
}
