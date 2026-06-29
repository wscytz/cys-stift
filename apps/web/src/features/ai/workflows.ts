'use client'

/**
 * AI 工作流模板(W-T4)——画布上的 3 个 AI 预设工作流:
 *
 * 1. **聚类重排**(cluster):复用 canvas page 的 handleAICluster,本模块只做导出
 *    说明(逻辑在 page 内,因为它绑定 adapter/service/toast 闭环)。详见 page。
 * 2. **生成关系**(relate):复用 handleAutoRelate(选中≥2 卡,本地 autoRelate,
 *    无网络)。同上,逻辑在 page 内。
 * 3. **总结大纲**(outline)——本模块实现的新工作流:
 *    读当前画布卡片 → serializeCardsForAI(allowlist + 软删过滤,无 deviceId /
 *    无 media.dataUrl,遵守 AI 隐私铁律,无 vision)→ streamText 出 Markdown
 *    大纲 → 写入 inbox 一张新卡。
 *
 * 设计:cluster/relate 是「改动画布」的工作流(几何/箭头),它们的入口逻辑
 * 强绑定 canvas page 的 adapter + service + toast,抽到模块里反而要传一堆
 * 上下文。本模块只封装 outline(纯读 + 写一张卡,不碰画布几何);cluster/
 * relate 由 page 直接调现有 handler。
 *
 * 隐私铁律(同 cluster.ts):走 serializeCardsForAI,不手拼字符串,不传
 * deviceId / media.dataUrl / apiKey。永久不做 vision。
 */

import type { CanvasId, CardService } from '@cys-stift/domain'
import { serializeCardsForAI } from './ai-context'
import { getCurrentAI, isAIReady } from './ai-settings-provider'
import { streamText } from './stream-text'

export interface SummarizeOutlineResult {
  /** false = AI 未就绪或卡片太少(已静默 no-op,调用方决定是否提示)。 */
  ok: boolean
  /** ok=true 但 AI 返回空内容(调用方提示 outlineEmpty)。 */
  empty?: boolean
}

/**
 * 总结大纲:把当前画布上的卡片喂给 AI,生成 Markdown 大纲,写入 inbox 新卡。
 *
 * - 隐私:走 serializeCardsForAI(allowlist + 软删过滤)。不传 deviceId /
 *   media.dataUrl。无 vision。
 * - 门控:isAIReady false → 直接返回 { ok: false }(不静默抛错,由调用方
 *   决定是否弹 AiSetupCard;调用方在调本函数前应已过 shouldShowAiSetup 门)。
 * - 卡片太少(<2)→ { ok: false },无意义。
 * - 用户 signal 经 streamText 内部合并 timeout,任一 abort 都 abort。
 *
 * @returns 大纲写入 inbox 新卡(inbox,不上画布几何)。
 */
export async function summarizeOutline(
  opts: {
    service: CardService
    canvasId: CanvasId
    signal?: AbortSignal
  },
): Promise<SummarizeOutlineResult> {
  const cfg = getCurrentAI()
  if (!cfg || !isAIReady(cfg)) return { ok: false }

  // 软删 + 归档过滤:与 canvas page handleAICluster 口径一致。
  const cards = opts.service
    .listOnCanvas(opts.canvasId)
    .filter((c) => !c.archived && !c.deletedAt)
  if (cards.length < 2) return { ok: false }

  // 走 serializeCardsForAI(allowlist + 软删过滤,无 deviceId / 无 media.dataUrl)。
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

  // 写入 inbox 新卡(无 canvasPosition → 落 inbox,不污染当前画布几何)。
  // source 用 manual(web)——与用户手建同源,不含 deviceId 之外的敏感信息。
  opts.service.create({
    title: '大纲总结',
    body: content,
    source: { kind: 'manual', deviceId: 'web' },
  })

  return { ok: true }
}
