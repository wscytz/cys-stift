'use client'
/**
 * canvas-thumb — 缩略图 + diff 分组 共享子组件。
 *
 * 从 agent-confirm-card.tsx 抽出,让 AgentConfirmCard(/ask + companion)
 * 与 AiConfirmDialog(画布三 action)共用同一套缩略图渲染,DRY。
 *
 * 缩略图:简化 Canvas 2D,只画元素 bbox(card 矩形 + arrow 线 + rect/text 框),
 * 不画标题/正文。before/after 并排对比用。
 */
import { useEffect, useRef } from 'react'
import { readToken, type CanvasElement } from '@cys-stift/canvas-engine'

/** 元素摘要(diff/缩略图标签用)。 */
export function summarizeEl(el: CanvasElement): string {
  if (el.kind === 'card') return `card #${el.id} @(${el.x},${el.y})`
  if (el.kind === 'arrow') return el.from && el.to ? `arrow ${el.from}→${el.to}` : `arrow #${el.id}`
  return `${el.kind} #${el.id}`
}

/** 一张卡单个内容字段(标题/正文)的前后变化。新卡无 before。 */
export interface ContentFieldChange {
  before?: string
  after?: string
}

/**
 * 卡片内容变更项。DSL `@title`/`@content` 改动几何 diff 看不见(CanvasElement 无内容字段),
 * 用这条独立的 content diff 让用户在确认门看到"正文/标题将怎么改"。`created` 标记建卡
 * (无 before,只展示将写入的内容)。
 */
export interface ContentChange {
  cardId: string
  created: boolean
  title?: ContentFieldChange
  body?: ContentFieldChange
}

export interface AgentContentDiffLabels {
  section: string
  newCard: string
  titleField: string
  bodyField: string
  emptyMark: string
}

/**
 * 专门的对话内容修改预览 —— 区别于几何缩略图。逐卡展示标题/正文的 before(划掉)→ after。
 * 纯内容编辑(@title/@content 无 @pos)时这是确认门的主体视图(几何缩略图那栏会隐藏)。
 */
export function AgentContentDiff({
  changes,
  labels,
}: {
  changes: ContentChange[]
  labels: AgentContentDiffLabels
}) {
  return (
    <section className="ac__content">
      <p className="ac__group-label">{labels.section}</p>
      {changes.map((c) => {
        const showTitle = !!c.title && (c.title.before !== undefined || c.title.after !== undefined)
        const showBody = !!c.body && (c.body.before !== undefined || c.body.after !== undefined)
        if (!showTitle && !showBody) return null
        return (
          <div className="ac__content-card" key={c.cardId}>
            <p className="ac__content-id">
              #{c.cardId}
              {c.created ? ` · ${labels.newCard}` : ''}
            </p>
            {showTitle && (
              <ContentRow
                field={labels.titleField}
                before={c.title!.before}
                after={c.title!.after}
                created={c.created}
                emptyMark={labels.emptyMark}
              />
            )}
            {showBody && (
              <ContentRow
                field={labels.bodyField}
                before={c.body!.before}
                after={c.body!.after}
                created={c.created}
                emptyMark={labels.emptyMark}
              />
            )}
          </div>
        )
      })}
    </section>
  )
}

function ContentRow({
  field,
  before,
  after,
  created,
  emptyMark,
}: {
  field: string
  before?: string
  after?: string
  created: boolean
  emptyMark: string
}) {
  const afterText = after ?? ''
  return (
    <div className="ac__content-row">
      <span className="ac__content-field">{field}</span>
      <div className="ac__content-text">
        {!created && before !== undefined && (
          <p className="ac__content-before">{before === '' ? emptyMark : before}</p>
        )}
        <p className="ac__content-after">{afterText === '' ? emptyMark : afterText}</p>
      </div>
    </div>
  )
}

export function DiffGroup({ color, label, items }: { color: 'blue' | 'red' | 'yellow'; label: string; items: string[] }) {
  return (
    <section className={`ac__group ac__group--${color}`}>
      <p className="ac__group-label">{label}</p>
      <ul className="ac__group-items">
        {items.slice(0, 8).map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </section>
  )
}

/** 简化缩略图:Canvas 2D 画元素 bbox。card=矩形,arrow=线(按端点卡中心),其他=框。 */
export function Thumb({ elements, label }: { elements: CanvasElement[]; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const W = cv.width, H = cv.height
    ctx.clearRect(0, 0, W, H)
    if (elements.length === 0) return
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const el of elements) {
      // 算 bbox 范围 → 投影到缩略图。关系箭头(有 from/to)不贡献自己的 bbox ——
      // 其几何来自两端点卡,而卡已在 bbox 内;若把 arrow 的 el.x(端点编码,常 0)算进去,
      // 会把 minX/minY 拉到 0 缩小投影。
      if (el.kind === 'arrow' && el.from && el.to) continue
      minX = Math.min(minX, el.x); minY = Math.min(minY, el.y)
      maxX = Math.max(maxX, el.x + (el.w || 0)); maxY = Math.max(maxY, el.y + (el.h || 0))
    }
    const pad = 8
    const sx = (W - pad * 2) / Math.max(1, maxX - minX)
    const sy = (H - pad * 2) / Math.max(1, maxY - minY)
    const s = Math.min(sx, sy)
    const ox = pad - minX * s, oy = pad - minY * s
    for (const el of elements) {
      ctx.strokeStyle = el.kind === 'card' ? readToken('--color-black', '#0a0a0a') : el.kind === 'arrow' ? readToken('--color-red', '#d40000') : readToken('--color-gray', '#6b6b6b')
      ctx.fillStyle = el.kind === 'card' ? readToken('--color-white-soft', '#ffffff') : 'transparent'
      ctx.lineWidth = 1
      if (el.kind === 'arrow' && el.from && el.to) {
        // 关系箭头:按 from/to 卡中心画红线(x/y 是端点编码,非 bbox,不能当矩形画)。
        const from = elements.find((e) => e.id === el.from)
        const to = elements.find((e) => e.id === el.to)
        if (!from || !to) continue // 悬空 arrow(端点缺)→ skip
        const fx = (from.x + (from.w || 20) / 2) * s + ox
        const fy = (from.y + (from.h || 20) / 2) * s + oy
        const tx = (to.x + (to.w || 20) / 2) * s + ox
        const ty = (to.y + (to.h || 20) / 2) * s + oy
        ctx.beginPath()
        ctx.moveTo(fx, fy)
        ctx.lineTo(tx, ty)
        ctx.stroke()
        continue
      }
      const x = el.x * s + ox, y = el.y * s + oy
      const w = (el.w || 20) * s, h = (el.h || 20) * s
      ctx.fillRect(x, y, w, h)
      ctx.strokeRect(x, y, w, h)
    }
  }, [elements])
  return (
    <div className="ac__thumb">
      <canvas ref={canvasRef} width={140} height={90} className="ac__thumb-canvas" />
      <span className="ac__thumb-label">{label}</span>
    </div>
  )
}

/** AgentConfirmCard + AiConfirmDialog 共用的 .ac CSS(从 agent-confirm-card 原样搬)。 */
export const confirmStyles = `
.ac { border: var(--border-hairline); border-radius: var(--radius-sm); padding: var(--space-2); margin: var(--space-2) 0; background: var(--color-white); max-width: 100%; box-sizing: border-box; min-width: 0; }
.ac--error { border-color: var(--color-red); }
.ac__title { margin: 0 0 var(--space-2); font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-black-soft); }
.ac__diff { display: flex; flex-direction: column; gap: var(--space-1); margin-bottom: var(--space-2); }
.ac__group { padding: var(--space-1) var(--space-2); border-left: var(--space-quarter) solid var(--color-gray); }
.ac__group--blue { border-left-color: var(--color-blue); }
.ac__group--red { border-left-color: var(--color-red); }
.ac__group--yellow { border-left-color: var(--color-yellow); }
.ac__group-label { margin: 0 0 2px; font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-black-soft); }
.ac__group-items { margin: 0; padding: 0 0 0 var(--space-2); list-style: none; }
.ac__group-items li { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-gray); }
.ac__nochange { margin: 0; font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-gray); }
.ac__thumbs { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2); overflow-x: auto; flex-wrap: nowrap; min-width: 0; }
.ac__thumb { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.ac__thumb-canvas { border: var(--border-hairline); background: var(--color-gray-soft); max-width: 100%; height: auto; display: block; flex-shrink: 0; }
.ac__thumb-label { font-family: var(--font-mono); font-size: 10px; color: var(--color-gray); text-transform: uppercase; letter-spacing: 0.08em; }
.ac__arrow { color: var(--color-gray); font-family: var(--font-mono); }
.ac__edit { width: 100%; font-family: var(--font-mono); font-size: var(--font-size-xs); border: var(--border-hairline); padding: var(--space-1); border-radius: var(--radius-sm); resize: vertical; margin-bottom: var(--space-2); }
.ac__actions { display: flex; gap: var(--space-1); flex-wrap: wrap; }
.ac__errors { margin: 0 0 var(--space-2); padding-left: var(--space-3); font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-red); }
.ac__content { display: flex; flex-direction: column; gap: var(--space-1); margin-bottom: var(--space-2); }
.ac__content-card { padding: var(--space-1) 0; border-top: var(--border-hairline); }
.ac__content-card:first-of-type { border-top: none; padding-top: 0; }
.ac__content-id { margin: 0 0 var(--space-1); font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-black-soft); text-transform: lowercase; }
.ac__content-row { display: flex; gap: var(--space-2); align-items: flex-start; }
.ac__content-field { flex-shrink: 0; width: 3rem; font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-gray); text-transform: uppercase; letter-spacing: 0.08em; padding-top: 1px; }
.ac__content-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.ac__content-before { margin: 0; font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-gray); text-decoration: line-through; word-break: break-word; white-space: pre-wrap; }
.ac__content-after { margin: 0; font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-black-soft); word-break: break-word; white-space: pre-wrap; }
`
