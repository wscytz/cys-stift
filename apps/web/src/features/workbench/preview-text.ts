import { markdownPreview } from '@cys-stift/canvas-engine'

/**
 * preview-text - 工作台卡片只显示首行，但剥离规则必须和画布/收件箱
 * 共用同一个 Markdown 预览器，避免不同页面分别露出 `###`、任务框或表格符号。
 */

/**
 * 剥 markdown 标记 -> 单行纯文本预览。
 * 取首个可读行(跳过空行 / hr / 代码围栏标记),剥内联标记,按 maxLen 截断。
 * 空 body 或全空 -> ''。
 */
export function plainPreview(md: string, maxLen: number): string {
  if (!md) return ''
  const preview = markdownPreview(md, Number.POSITIVE_INFINITY)
  const first = preview.split('\n').find((line) => line.trim())?.trim() ?? ''
  if (first.length <= maxLen) return first
  // plainPreview's public maxLen contract counts source characters and adds
  // the ellipsis as a separate visual marker (legacy callers rely on this).
  return first.slice(0, Math.max(0, maxLen)).trimEnd() + '…'
}

/**
 * 副标题(卡 subtitle 模式用):body 首个 `##` 副标题文本;无则首行(走 plainPreview 剥 markdown)。
 * 不匹配 `#`(H1,常是卡标题重复)或 `###`(更深层);只取 H2 作副标题。
 */
export function subtitleOf(body: string): string {
  if (!body) return ''
  const heading = body
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => /^##(?!#)(?:[ \t]*).+/.test(line))
  if (heading) {
    const value = plainPreview(heading.replace(/^##[ \t]*/, ''), 60)
    if (value) return value
  }
  return plainPreview(body, 60)
}
