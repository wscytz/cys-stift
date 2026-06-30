'use client'

/**
 * relation-recommend — 本地启发式关系推荐(智能关系推荐 · Batch C 选项 A)。
 *
 * 【缺口】详情页看一张卡时,反链区只显示【已经连上】的关系;RelationPicker 是用户
 * 主动搜卡建关系;auto-relate 只对画布上【已选】的卡批量建;cluster 走 AI 读整画布。
 * 没有任何能力回答"这张卡【可能】还和谁相关、但还没连"。本模块填补它:纯本地、零
 * AI、即时,给当前卡算出最可能相关的 N 张候选 + 推荐理由 + 建议关系类型。
 *
 * 【打分信号】(中英文都 work)
 *  - title-mention(标题互提,中文主力):current 正文提到 other 标题,或反之。子串
 *    includes,中文友好(中文没空格,tokenise 会整句成块,子串匹配才有效)。
 *  - title-similar(标题相似):标题 token 集 Jaccard ≥ 阈值。tokenSet 对英文取整词、
 *    对中文取相邻二元组 bigram,让中英混合标题相似度可算。
 *  - shared-tag(标签重合):共享 tag value(每共享一个加分)。
 *  - content-overlap(内容重合):正文 ASCII 词交集 ≥ 阈值。只用 ASCII 词(中文 bigram
 *    在长正文噪声大),保证可预测。
 *
 * 【建议关系类型】复用 inferRelationTypeFromContext(关键词→类型):命中 blocks/
 * references 等关键词就建议那个具体类型,否则默认 related-to(最通用)。这让推荐
 * 不只是"相关",还带类型建议。
 *
 * 【R2 安全】只读 title/body/tags,绝不碰 deviceId/media.dataUrl/软删除状态。
 *
 * 纯函数,可单测;调用方(card-detail)用 useGlobalEdges 的已有边做 exclude,
 * 避免重复推荐已连接的卡。文本工具自包含(与 relation-inference 同风格,不依赖
 * domain 内部 normalise),零新依赖。
 */
import type { Card } from '@cys-stift/domain'
import { inferRelationTypeFromContext } from './relation-inference'
import { relationTypeById, type RelationType } from './relation-types'

export type RecommendReason = 'title-mention' | 'title-similar' | 'shared-tag' | 'content-overlap' | 'ai'

export interface RelationRecommendation {
  otherCardId: string
  /** 总分(各信号加权);用于排序。 */
  score: number
  /** 命中的信号(可多个),驱动「为什么推荐」文案。 */
  reasons: RecommendReason[]
  /** 建议的关系类型:关键词命中则建议具体类型,否则 related-to(最通用)。 */
  suggestedType: RelationType
  /** AI 候选才填:模型给出的一句理由(reasons 含 'ai' 时用)。本地启发式不填。 */
  aiReason?: string
}

export interface RecommendOptions {
  /** 最多返回几条(默认 5)。 */
  limit?: number
  /** 已经和 current 有关系的卡 id —— 不重复推荐(调用方从 globalEdges 算)。 */
  excludeCardIds?: Set<string>
  /** 最低分阈值(默认 0:至少命中一个信号才进结果)。 */
  minScore?: number
}

const DEFAULT_RELATED = relationTypeById('related-to')!

/** 最低标题长度:短于它不参与「互提」子串匹配(避免单字误命中,如「吃」)。 */
const MIN_TITLE_LEN = 2
/** 标题相似 Jaccard 阈值:≥ 此值才算「标题相近」。 */
const TITLE_SIMILAR_THRESHOLD = 0.34
/** 内容重合:ASCII 词共享数 ≥ 此值才算「内容相关」。 */
const CONTENT_OVERLAP_MIN = 3

// 信号权重
const W_TITLE_MENTION = 3
const W_TITLE_SIMILAR = 2
const W_SHARED_TAG = 1.5
const W_CONTENT_OVERLAP = 1

// ── 文本工具(自包含,零依赖 domain 内部) ────────────────────────────────────

function normalise(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const CJK = /[一-鿿]/
const ASCII_WORD = /[a-z0-9]/

/**
 * 文本 → token 集合(标题相似用)。中英文混合都可用:
 *  - ASCII 连续字母/数字 → 整词(如 "react"、"hooks")
 *  - CJK 连续汉字 → 相邻二元组 bigram(如 "做早餐" → "做早","早餐")
 *  - 其余(标点/空格)→ 分隔
 * bigram 让中文标题相似度可算(Jaccard 有意义);content-overlap 不用它(bigram
 * 在长正文噪声大,那里只用 ASCII 整词)。
 */
function tokenSet(text: string): Set<string> {
  const s = normalise(text)
  const out = new Set<string>()
  let word = ''
  let cjk = ''
  const flushWord = () => { if (word) { out.add(word); word = '' } }
  const flushCjk = () => {
    if (cjk.length >= 2) {
      for (let i = 0; i < cjk.length - 1; i++) out.add(cjk.slice(i, i + 2))
    }
    cjk = ''
  }
  for (const ch of s) {
    if (CJK.test(ch)) { flushWord(); cjk += ch }
    else if (ASCII_WORD.test(ch)) { flushCjk(); word += ch }
    else { flushWord(); flushCjk() }
  }
  flushWord()
  flushCjk()
  return out
}

/** 仅 ASCII 整词集合(content-overlap 用,避免中文 bigram 噪声)。 */
function asciiWordSet(text: string): Set<string> {
  const out = new Set<string>()
  for (const m of normalise(text).matchAll(/[a-z0-9]+/g)) out.add(m[0])
  return out
}

/** 标签 value 集合(归一化后,空值过滤)。 */
function tagSet(card: Card): Set<string> {
  return new Set((card.tags ?? []).map((t) => normalise(t.value)).filter(Boolean))
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  const union = a.size + b.size - inter
  return union === 0 ? 0 : inter / union
}

// ── 主函数 ────────────────────────────────────────────────────────────────────

/**
 * 给当前卡推荐「可能相关但还没连」的候选卡。纯函数,零 AI。
 *
 * - 跳过:软删除卡 / 自己 / excludeCardIds 里的(已连接的卡,调用方从 globalEdges 算)。
 * - 每张候选累加命中信号的加权分;至少命中一个信号(score>0)才进结果。
 * - 按 score desc 排序(平分按 otherCardId 稳定),取前 limit 条。
 */
export function recommendRelations(
  current: Card,
  allCards: Card[],
  options: RecommendOptions = {},
): RelationRecommendation[] {
  const { limit = 5, excludeCardIds, minScore = 0 } = options

  const curId = String(current.id)
  const curTitle = normalise(current.title)
  const curBody = normalise(current.body)
  const curTitleTokens = tokenSet(current.title)
  const curBodyAscii = asciiWordSet(current.body)
  const curTags = tagSet(current)

  const results: RelationRecommendation[] = []

  for (const other of allCards) {
    if (other.deletedAt) continue
    const oid = String(other.id)
    if (oid === curId) continue
    if (excludeCardIds?.has(oid)) continue

    const otherTitle = normalise(other.title)
    const otherBody = normalise(other.body)
    const reasons: RecommendReason[] = []
    let score = 0

    // 1) 标题互提(子串,中文主力信号):双向任一命中即记一次。
    const mentionCurInOther = curTitle.length >= MIN_TITLE_LEN && otherBody.includes(curTitle)
    const mentionOtherInCur = otherTitle.length >= MIN_TITLE_LEN && curBody.includes(otherTitle)
    if (mentionCurInOther || mentionOtherInCur) {
      reasons.push('title-mention')
      score += W_TITLE_MENTION
    }

    // 2) 标题相似(token 集 Jaccard)
    if (curTitle && otherTitle) {
      const j = jaccard(curTitleTokens, tokenSet(other.title))
      if (j >= TITLE_SIMILAR_THRESHOLD) {
        reasons.push('title-similar')
        score += W_TITLE_SIMILAR
      }
    }

    // 3) 标签重合(每共享一个加分)
    if (curTags.size > 0) {
      const shared = [...curTags].filter((t) => tagSet(other).has(t)).length
      if (shared > 0) {
        reasons.push('shared-tag')
        score += W_SHARED_TAG * shared
      }
    }

    // 4) 内容重合(ASCII 词交集)
    if (curBodyAscii.size > 0) {
      const otherAscii = asciiWordSet(other.body)
      const overlap = [...curBodyAscii].filter((w) => otherAscii.has(w)).length
      if (overlap >= CONTENT_OVERLAP_MIN) {
        reasons.push('content-overlap')
        score += W_CONTENT_OVERLAP
      }
    }

    if (reasons.length === 0 || score <= minScore) continue

    const inferred = inferRelationTypeFromContext(current, other)
    results.push({
      otherCardId: oid,
      score,
      reasons,
      suggestedType: inferred ?? DEFAULT_RELATED,
    })
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.otherCardId < b.otherCardId ? -1 : 1
  })
  return results.slice(0, limit)
}
