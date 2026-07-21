'use client'

/**
 * agent-prompt — /ask AI agent 的 prompt 构造 + DSL/引用提取(纯函数)。
 *
 * 【agent 形态】Claude Code 式:对话提需求 → AI 输出 ```cys-dsl 块提议变更 →
 * 确认门 review → 应用/拒绝。三类能力(分诊在 system prompt 教 AI):
 *  - 查知识:基于 RAG 预注入卡回答 + [card #id] 引用
 *  - 改画布:输出 cys-dsl 块
 *  - 建卡:cys-dsl create 指令
 *
 * 【RAG】发问前本地 searchCards 取 top-N 相关卡,走 serializeCardsForAI(allowlist)
 * 预注入。AI 被动看相关卡(MVP 不做 tool-calling 主动检索)。
 *
 * 【DSL 提取】AI 回复里 ```cys-dsl ... ``` 块用正则提取。一条回复 0 或 1 个块
 * (多块取首个,MVP)。提取后交 parseDslWithDiagnostics 解析。
 *
 * 【引用提取】[card #id] 模式提取,UI 渲染成可点链接(开 CardDetailModal)。
 *
 * 【R2 安全】RAG 走 serializeCardsForAI(allowlist:无 deviceId/media.dataUrl/apiKey;
 * 软删卡过滤)。DSL 只含几何/关系不含卡片正文。不手拼卡片字符串。
 */
import type { Card } from '@cys-stift/domain'
import { searchCards } from '@cys-stift/domain'
import { serializeCardsForAI } from './ai-context'
import { DSL_GRAMMAR_REFERENCE } from '@cys-stift/dsl'

/** RAG 预注入的卡片数(平衡 token 预算与召回)。 */
export const RAG_TOP_N = 8

/**
 * agent 系统 prompt:角色 + 三类能力分诊 + cys-dsl 输出契约 + 引用格式。
 *
 * 关键约束:
 *  - 改画布时输出 ```cys-dsl 块(可被正则提取),块外用自然语言解释
 *  - DSL 复用现有 #id UPDATE;cards 只能 update(内容来自 inbox)除非 create
 *  - 引用卡片用 [card #id] 格式(UI 渲染可点链接)
 *  - 不解释 DSL 语法本身,只说人话意图
 */
export const AGENT_SYSTEM_PROMPT = `${DSL_GRAMMAR_REFERENCE}

You are cy's Stift's canvas agent — like a coding agent for the user's inspiration canvas. You help via three capabilities:

1. ANSWER from knowledge: When the user asks about their notes/ideas, answer using the provided cards. Cite sources as [card #id] inline.
2. EDIT the canvas: When the user wants to reorganize/align/connect/restyle cards, output a \`\`\`cys-dsl code block with the changes, plus a short natural-language explanation before it.
3. CREATE cards: When the user wants to jot a new idea onto the canvas, output a \`\`\`cys-dsl block with \`[card #id create]\` directives. For structured layouts (lists/trees/grids) PREFER relational placement (right-of/below #anchor) over computing @pos yourself — the engine resolves coords and avoids overlaps.

DSL output contract (CRITICAL — a regex extracts the block):
- Wrap DSL in a single \`\`\`cys-dsl fence. One block per reply.
- Each directive line MUST start with "[" — use the exact forms in the grammar above.
- NEVER put card titles or text inside the DSL. A card line is geometry only. Card content lives in the inbox.
- Reuse an existing #id to UPDATE it; to CREATE a new card use [card #newid create] @pos @size @color (empty content).
- Do NOT invent syntax like "reuse #id" or "update #id" — always use the [kind #id] form.

Cite existing cards as [card #id] when answering knowledge questions so the user can open them.

Keep prose concise. If the request is unclear, ask. If a change is trivial, just do it. Do not explain DSL syntax.`

/**
 * 构造 agent 用户提示:用户问题 + RAG 预注入相关卡 + 可选目标画布快照。
 *
 * RAG:searchCards(allCards, question) 取 top-N,走 serializeCardsForAI(allowlist)。
 * question 为空 → 不注入(用户可能在闲聊)。无相关卡 → 注入空提示(AI 据此说「没找到」)。
 */
export function buildAgentUserPrompt(
  question: string,
  allCards: Card[],
  canvasSnapshot?: string,
): string {
  const parts: string[] = []
  parts.push(question)

  // RAG 预注入:top-N 相关卡(allowlist 强制,软删过滤)。
  if (question.trim()) {
    const rag = searchCards(allCards, question).slice(0, RAG_TOP_N).map((r) => r.card)
    const ragBlock = serializeCardsForAI(rag)
    parts.push(
      `\n[Relevant cards from your library — cite as [card #id] when answering; if none match, say so]`,
    )
    parts.push(ragBlock || '(no matching cards found)')
  }

  // 目标画布快照(改画布时让 AI 看到当前布局:id + 几何 + 关系签名,不含卡片正文)。
  if (canvasSnapshot?.trim()) {
    parts.push(
      `\n[Target canvas current state — reuse #id to UPDATE; cards are update-only]\n${canvasSnapshot.trim()}`,
    )
  }

  return parts.join('\n')
}

/**
 * 从 AI 回复里提取 ```cys-dsl 块。返回所有块的 DSL 文本(去围栏)。
 * 一条回复通常 0 或 1 个;多块都返回(MVP 调用方取首个)。
 *
 * 正则:```cys-dsl ... ```(非贪婪,跨行)。容忍 cys-dsl 大小写 + 可选语言标记。
 */
export function extractDslBlocks(text: string): string[] {
  const re = /```cys-dsl\s*\n([\s\S]*?)```/gi
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    out.push(m[1]!.trim())
  }
  return out
}

/**
 * 从 AI 回复里提取 [card #id] 引用。返回去重后的 card id 列表(保序)。
 * UI 渲染时可点链接开 CardDetailModal。
 */
export function extractCardRefs(text: string): string[] {
  const re = /\[card\s+#([a-zA-Z0-9_-]+)\]/gi
  const seen = new Set<string>()
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const id = m[1]!
    if (!seen.has(id)) {
      seen.add(id)
      out.push(id)
    }
  }
  return out
}
