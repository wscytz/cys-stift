/**
 * Canvas → Markdown 导出(数据可迁移信念)。转义+语义关系的复合产物:
 * card → 章节(## title + body);语义关系箭头(blocks/references/derived-from/
 * related-to)→ markdown 交叉引用链接。无关系的 card 按画布 y 坐标上→下排序。
 * 非 card 元素(rect/text/freedraw/自由箭头)无 markdown 语义,忽略。
 */
import type { CanvasHost } from '@cys-stift/canvas-engine'
import type { CardId, CardService } from '@cys-stift/domain'
import { resolveExportElements, getSafeFileName, type ExportScope } from './export-bounds'
import { inferRelationType } from './relation-types'
import { downloadFile } from '@/lib/download'

export interface MarkdownExportOptions {
  scope?: ExportScope
}

interface CardNode {
  id: string
  title: string
  body: string
  y: number
}

export function exportCanvasMarkdown(
  host: CanvasHost,
  service: CardService,
  _canvasId: string,
  canvasName: string,
  opts: MarkdownExportOptions = {},
): string | null {
  const elements = resolveExportElements(host, opts.scope ?? 'diagram')
  const cardEls = elements.filter((e) => e.kind === 'card')
  if (cardEls.length === 0) return null

  const nodes: CardNode[] = []
  for (const el of cardEls) {
    const card = service.get(el.id as CardId)
    if (!card) continue
    nodes.push({
      id: el.id,
      title: card.title || '(untitled)',
      body: card.body ?? '',
      y: el.y,
    })
  }
  if (nodes.length === 0) return null

  const idToTitle = new Map(nodes.map((n) => [n.id, n.title]))
  const anchor = (title: string) =>
    title.toLowerCase().replace(/[^\w一-龥]+/g, '-').replace(/^-|-$/g, '')

  const relations = elements
    .filter((e) => e.kind === 'arrow' && e.from && e.to)
    .map((e) => ({ el: e, type: inferRelationType(e) }))
    .filter((r) => r.type && idToTitle.has(r.el.from!) && idToTitle.has(r.el.to!))

  nodes.sort((a, b) => a.y - b.y)

  const lines: string[] = []
  lines.push(`# ${canvasName || 'Canvas'}`)
  lines.push('')

  for (const node of nodes) {
    lines.push(`## ${node.title}`)
    if (node.body.trim()) {
      lines.push('')
      lines.push(node.body.trim())
    }
    const outgoing = relations.filter((r) => r.el.from === node.id)
    if (outgoing.length > 0) {
      lines.push('')
      for (const r of outgoing) {
        const targetTitle = idToTitle.get(r.el.to!)!
        const label = relationLabel(r.type!.id)
        lines.push(`- ${label}: [${targetTitle}](#${anchor(targetTitle)})`)
      }
    }
    lines.push('')
  }

  return lines.join('\n').trim() + '\n'
}

function relationLabel(id: string): string {
  switch (id) {
    case 'blocks': return 'blocks'
    case 'references': return 'references'
    case 'derived-from': return 'derived from'
    case 'related-to': return 'related to'
    default: return id
  }
}

export async function downloadMarkdown(md: string, canvasName: string): Promise<void> {
  if (typeof window === 'undefined') return
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
  // 走 downloadFile(分平台:桌面 Blob+a.click / Android Tauri SAF save),
  // 解决 Android WebView 不处理 Blob download 的静默失败。
  await downloadFile(`${getSafeFileName(canvasName)}.md`, blob)
}
