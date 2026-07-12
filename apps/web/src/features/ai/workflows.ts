'use client'

/**
 * AI 工作流模板(W-T4)——画布上的 3 个 AI 预设工作流:
 *
 * 1. **聚类重排**(cluster):复用 canvas page 的 handleAICluster,本模块只做导出
 *    说明(逻辑在 page 内,因为它绑定 adapter/service/toast 闭环)。详见 page。
 * 2. **生成关系**(relate):复用 handleAutoRelate(选中≥2 卡,本地 autoRelate,
 *    无网络)。同上,逻辑在 page 内。
 * 3. **generateOutline 生成大纲 markdown,建卡由画布确认门做**:读当前画布卡片 →
 *    serializeCardsForAI(allowlist + 软删过滤,无 deviceId / 无 media.dataUrl,
 *    遵守 AI 隐私铁律,无 vision)→ streamText 出 Markdown 大纲,返回给调用方。
 *    建卡时机在画布确认门 apply 时(用户预览 + 确认后才建 inbox 卡)。
 *
 * 设计:cluster/relate 是「改动画布」的工作流(几何/箭头),它们的入口逻辑
 * 强绑定 canvas page 的 adapter + service + toast,抽到模块里反而要传一堆
 * 上下文。本模块只封装 outline 的 AI 部分(纯读 + 返回 markdown);cluster/
 * relate 由 page 直接调现有 handler,outline 建卡由 AiConfirmDialog 做。
 *
 * 隐私铁律(同 cluster.ts):走 serializeCardsForAI,不手拼字符串,不传
 * deviceId / media.dataUrl / apiKey。永久不做 vision。
 */

import type { CanvasId, CardService } from '@cys-stift/domain'
import { serializeCardsForAI } from './ai-context'
import { getCurrentAI, isAIReady } from './ai-settings-provider'
import { streamText } from './stream-text'

export interface GenerateOutlineResult {
  /** false = AI 未就绪或卡片太少(调用方提示 outlineTooFew)。 */
  ok: boolean
  /** ok=true 但 AI 返回空(调用方提示 outlineEmpty)。 */
  empty?: boolean
  /** ok=true 且非空:大纲 markdown(调用方开确认门;确认后才建卡)。 */
  markdown?: string
}

/**
 * 生成大纲 markdown(只 AI,不建卡)—— 给画布确认门用。
 *
 * 只负责"读卡 → AI → 返回 markdown",建卡时机在画布确认门 apply 时。
 * 隐私:serializeCardsForAI allowlist + 软删过滤,无 deviceId/media.dataUrl,无 vision。
 */
export async function generateOutline(
  opts: { service: CardService; canvasId: CanvasId; signal?: AbortSignal },
): Promise<GenerateOutlineResult> {
  const cfg = getCurrentAI()
  if (!cfg || !isAIReady(cfg)) return { ok: false }

  const cards = opts.service
    .listOnCanvas(opts.canvasId)
    .filter((c) => !c.archived && !c.deletedAt)
  if (cards.length < 2) return { ok: false }

  const serialized = serializeCardsForAI(cards)

  const systemPrompt =
    'You are a summarization assistant. Given canvas cards, output a concise Markdown outline grouping them by theme. Group related cards under ## headings; list card titles as bullets. Output Markdown only — no preamble, no code fences.'

  const userPrompt = `Summarize these cards into a Markdown outline grouped by theme:\n\n${serialized}`

  const result = await streamText(
    cfg,
    { system: systemPrompt, user: userPrompt, temperature: 0.3 },
    () => {},
    opts.signal,
  )

  const content = result?.content?.trim()
  if (!content) return { ok: true, empty: true }
  return { ok: true, markdown: content }
}
