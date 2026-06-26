import type { CanvasElement } from '@cys-stift/canvas-engine'
import { normalizeBox } from '@cys-stift/canvas-engine'
import { inferRelationType } from './relation-types'

/**
 * 画布 → Markdown 文档(数据可迁移,信念4「本地数据随时可导出开放格式,不做锁定」)。
 *
 * 把画布转成人可读的 Markdown:按 frame 主题分区(几何包含——卡片 bbox 在 frame
 * bbox 内即"属于"该分区,与渲染层分区语义同源),无 frame 的散卡顶层,每张卡含
 * title + body + 相关关系(Backlink 同款查 from/to)。转义 Markdown 特殊字符防注入。
 *
 * 纯函数:不碰 AI、不外发、不依赖 host(只吃 elements + getCardInfo/getCardTitle)。
 * 与 buildOutline 互补:Outline 是结构树给面板用,canvasToMarkdown 是线性文档给人读/导出。
 * R2 安全:只读 card 的 title/body/type(allowlist 已注册进 AI context 的字段),freedraw
 * 不出现(只占位无内容),arrow 只出关系标签 + 端点标题。
 */

/** 卡片信息(同引擎 CardInfo,但加 id + tags 供 markdown 用)。 */
export interface MarkdownCardInfo {
  title: string
  body: string
  type: string
  pinned: boolean
}

export interface CanvasToMarkdownOptions {
  /** card id → 卡片信息(title/body/type/pinned)。无则该卡只出 title 占位。 */
  getCardInfo: (id: string) => MarkdownCardInfo | null
  /** card id → 标题(Backlink 端点显示用,getCardInfo 已含但分离更清晰)。 */
  getCardTitle?: (id: string) => string | undefined
  /** 画布名(文档 H1 + 文件名)。 */
  canvasName?: string
}

/**
 * 把画布元素转成 Markdown 字符串。
 *
 * 结构:H1 画布名 → 按 frame 分区的 ## 段(每段含几何包含的卡)→ 顶层散卡 →
 * 每张卡 ### title + 元信息行(type/pinned)+ body + 相关关系列表。
 * frame 之间/散卡按 z 序(getElements 已 sortByLayer)。
 */
export function canvasToMarkdown(
  elements: CanvasElement[],
  opts: CanvasToMarkdownOptions,
): string {
  const { getCardInfo, getCardTitle, canvasName } = opts
  const lines: string[] = []
  lines.push(`# ${escapeMd(canvasName || 'Canvas')}`)
  lines.push('')

  // frame 分区 + 散卡分类。
  const frames = elements.filter((e) => e.kind === 'frame')
  const cards = elements.filter((e) => e.kind === 'card')

  // 标记每张卡属于哪个 frame(取首个几何包含的 frame;z 序 frame 在底,先建的先匹配)。
  const cardFrame = new Map<string, CanvasElement | null>() // cardId → frame(null=散卡)
  for (const card of cards) {
    const cb = normalizeBox(card)
    let belongs: CanvasElement | null = null
    for (const frame of frames) {
      if (belongsTo(card, frame)) {
        belongs = frame
        break
      }
    }
    cardFrame.set(card.id, belongs)
  }

  // 关系索引:每张卡 → 相关关系列表(双向,Backlink 同款)。
  const relations = new Map<string, { dir: 'in' | 'out'; other: string; label: string }[]>()
  for (const el of elements) {
    if (el.kind !== 'arrow' || !el.from || !el.to) continue
    const rel = inferRelationType(el)
    const label = rel ? rel.id : 'related'
    const fromTitle = getCardTitle?.(el.from) ?? getCardInfo(el.from)?.title
    const toTitle = getCardTitle?.(el.to) ?? getCardInfo(el.to)?.title
    pushRel(relations, el.from, 'out', toTitle ?? '(card)', label)
    pushRel(relations, el.to, 'in', fromTitle ?? '(card)', label)
  }

  // 按 frame 分区输出。
  const renderedCards = new Set<string>()
  for (const frame of frames) {
    const sectionTitle = frame.text || '(untitled section)'
    lines.push(`## ${escapeMd(sectionTitle)}`)
    lines.push('')
    for (const card of cards) {
      if (cardFrame.get(card.id) === frame && !renderedCards.has(card.id)) {
        renderCard(card, getCardInfo, relations.get(card.id) ?? [], lines)
        renderedCards.add(card.id)
        lines.push('')
      }
    }
  }
  // 散卡(不属于任何 frame 且未渲染)。
  const loose = cards.filter((c) => !renderedCards.has(c.id))
  if (loose.length > 0) {
    if (frames.length > 0) {
      lines.push('## 其他')
      lines.push('')
    }
    for (const card of loose) {
      renderCard(card, getCardInfo, relations.get(card.id) ?? [], lines)
      renderedCards.add(card.id)
      lines.push('')
    }
  }

  return lines.join('\n')
}

/** 几何包含判定(card bbox 在 frame bbox 内)。 */
function belongsTo(card: CanvasElement, frame: CanvasElement): boolean {
  const cb = normalizeBox(card)
  const fb = normalizeBox(frame)
  return (
    cb.x >= fb.x &&
    cb.y >= fb.y &&
    cb.x + cb.w <= fb.x + fb.w &&
    cb.y + cb.h <= fb.y + fb.h
  )
}

function pushRel(
  map: Map<string, { dir: 'in' | 'out'; other: string; label: string }[]>,
  id: string,
  dir: 'in' | 'out',
  other: string,
  label: string,
): void {
  const arr = map.get(id) ?? []
  arr.push({ dir, other, label })
  map.set(id, arr)
}

function renderCard(
  card: CanvasElement,
  getCardInfo: (id: string) => MarkdownCardInfo | null,
  rels: { dir: 'in' | 'out'; other: string; label: string }[],
  lines: string[],
): void {
  const info = getCardInfo(card.id)
  const title = info?.title || '(untitled)'
  lines.push(`### ${escapeMd(title)}`)
  // 元信息行(type + pinned)。
  const meta: string[] = []
  if (info) meta.push(`type: ${escapeMd(info.type)}`)
  if (info?.pinned) meta.push('★ pinned')
  if (meta.length > 0) lines.push(`> ${meta.join(' · ')}`)
  if (info?.body && info.body.trim()) {
    lines.push('')
    lines.push(escapeMdBody(info.body))
  }
  if (rels.length > 0) {
    lines.push('')
    lines.push('**关系:**')
    for (const r of rels) {
      const arrow = r.dir === 'in' ? '←' : '→'
      lines.push(`- ${arrow} ${escapeMd(r.other)} (${escapeMd(r.label)})`)
    }
  }
}

/** 转义行内 Markdown 特殊字符(title/meta/label 用)。 */
function escapeMd(s: string): string {
  return s.replace(/([\\`*_{}[\]()#+\-.!|<>])/g, '\\$1')
}

/** body 保留换行(多段),仅转义可能破坏结构的字符(# 开头行转义防误标题)。 */
function escapeMdBody(body: string): string {
  return body
    .split('\n')
    .map((ln) => (ln.startsWith('#') ? '\\' + ln : ln))
    .join('\n')
}

/** Markdown 文件名(画布名 + .md,清理非法文件名字符)。 */
export function markdownFileName(canvasName: string): string {
  const clean = (canvasName || 'canvas').replace(/[\\/:*?"<>|]/g, '_').trim()
  return `${clean || 'canvas'}.md`
}
