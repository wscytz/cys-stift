/**
 * 「复制为 AI 提示词」——转义双向桥的出口。把当前画布打包成一段可直接粘进
 * ChatGPT/Claude 网页版的提示词:画布快照文本(formatCanvasSnapshot)+ DSL 语法
 * 说明 + 可执行指令集。不依赖内置 AI——任何 LLM 粘进去都能驱动画布编辑。
 *
 * R2 安全:formatCanvasSnapshot 内部已守 freedraw 只发 shape 标签不发点坐标;
 * deviceId/media.dataUrl/软删除卡 由 serializeCardsForAI allowlist 过滤。
 */
import type { CanvasHost } from '@cys-stift/canvas-engine'
import type { CanvasId, CardService } from '@cys-stift/domain'
import { snapshotCanvas, formatCanvasSnapshot } from './canvas-snapshot'
import { DSL_GRAMMAR_REFERENCE as GRAMMAR } from './dsl-grammar'

export function buildCanvasPrompt(
  host: CanvasHost,
  service: CardService,
  canvasId: CanvasId,
): string {
  const snapshot = snapshotCanvas(host, service, canvasId)
  const canvasText = formatCanvasSnapshot(snapshot)
  return `You are operating an inspiration canvas. Below is the current canvas state described in a text DSL. You can read it and propose edits by returning DSL lines.

${GRAMMAR}

## Current canvas
${canvasText}

## Your task
Propose a new arrangement by returning ONLY DSL lines (one element per line, no prose, no markdown fences). Reposition, add rect/text/arrow, or connect cards with semantic arrows. Keep card ids stable.`
}
