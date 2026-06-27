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

const GRAMMAR = `Canvas DSL grammar (one element per line):
  [card #id] @pos(x, y) @size(w, h) @color(red|yellow|blue|black|white|gray|grey)
  [rect #id] @pos(x, y) @size(w, h) @color(c)
  [text #id] @pos(x, y) @text("...") @color(c)
  [frame #id] @pos(x, y) @size(w, h) @text("title") @color(c)   # themed group/section container
  [arrow #id] from #a to #b @label("...") @color(c) @dash(solid|dashed|dotted) @arrowhead(arrow|triangle|none)
  [arrow #id] @pos(x, y) @size(w, h) @color(c)   # free arrow (no from/to)
  # arrow route (optional, to bend or elbow around obstacles):
  #   @route(curve) @curve(cx,cy)                 # smooth quadratic curve via one control point
  #   @route(elbow) @elbow(x,y;x,y)               # 1-2 corner points (semicolon-separated)
  #   (omit @route for a straight line)
Rules: card is update-only (content comes from elsewhere, you may reposition but not create orphan cards);
  lines starting with # are comments and ignored; colors are the 6 Bauhaus tokens only.`

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
