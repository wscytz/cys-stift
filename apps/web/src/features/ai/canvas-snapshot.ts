'use client'

/**
 * Canvas snapshot — geometry + titles encoding for AI (P6 v0.33.1; Phase 0 / T4
 * 2026-06-22 refactored from tldraw Editor → CanvasHost + CardService).
 *
 * Serializes the canvas (cards + free-form shapes) into a structured snapshot +
 * a text block the AI can reason about for DSL layout / cluster / suggest.
 *
 * Design decisions:
 * - Card TITLES are included (AI needs content to group/cluster) — read from
 *   CardService, never from the host element (which carries geometry only).
 * - Hand-draw (freedraw) is included as **position + an R2-safe shape
 *   descriptor** (discrete label like circle/arrow + scalar geometric ratios)
 *   computed locally — NEVER the raw point sequence (R2: hand-draw is vector;
 *   also keeps bulk point data out of the AI view). No vision models (permanent
 *   decision).
 * - media binary / deviceId / soft-deleted cards are never in the snapshot
 *   (soft-deleted cards aren't on the host; deviceId isn't geometry).
 */
import type { CanvasId, CardId, CardService } from '@cys-stift/domain'
import type { CanvasHost, CanvasElement } from '@cys-stift/canvas-engine'
import { classifyFreedraw, recognizeShape, freedrawPointsOf } from '@cys-stift/canvas-engine'
import { serializeElement } from '@cys-stift/dsl'

// ── Shape interfaces ─────────────────────────────────────────────────────────

export interface SnapshotCard {
  id: string
  x: number
  y: number
  w: number
  h: number
  color?: string
  title: string
  /** 卡片正文(总是采集;是否输出给 AI 由 formatCanvasSnapshot 的 includeContent 决定)。 */
  body?: string
  /** 结构化字段元数据(只给 AI 信号,**不含正文**):@code 语言+块数 / @quote 署名 / @tags 值 / @links 条数。
   *  快照刻意不发 code 正文 / quote 全文 / link URL —— AI 知道卡带什么结构但编不出内容
   *  (privacy + token + 防 AI「恢复丢失内容」时编造覆盖真实数据)。 */
  codeLanguages?: string[]
  quoteAttributions?: string[]
  tagValues?: string[]
  linkCount?: number
}

export interface SnapshotArrow {
  id: string
  from: string
  to: string
  label?: string
  /** 关系签名(语义三维:颜色 + 线型 + 箭头形)。AI 改签名需要先看到现状。 */
  color?: string
  dash?: 'solid' | 'dashed' | 'dotted'
  arrowhead?: 'arrow' | 'triangle' | 'none'
  /** 自由箭头 bbox(无 from/to 时线段几何由 bbox 编码;w/h 可负表方向)。
   *  关系箭头不设(端点由 from/to 引用算)。 */
  x?: number
  y?: number
  w?: number
  h?: number
}

export type FreeShape =
  | { kind: 'rect'; id: string; x: number; y: number; w: number; h: number; color?: string }
  | { kind: 'text'; id: string; x: number; y: number; w: number; h: number; text: string; color?: string }
  | {
      kind: 'freedraw'
      id: string
      x: number
      y: number
      /** R2-safe shape descriptor (discrete label + confidence, NEVER points). */
      shape?: 'circle' | 'rect' | 'triangle' | 'check' | 'arrow' | 'unknown'
      shapeConfidence?: number
      /** Scalar geometric ratios — privacy-safe (not point data). */
      features?: { straightness: number; closure: number; elongation: number; pointCount: number }
    }

export interface CanvasSnapshotOutput {
  cards: SnapshotCard[]
  arrows: SnapshotArrow[]
  freeShapes: FreeShape[]
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Serialize the current canvas (via the host) into a structured snapshot the AI
 * can reason about. Cards get position + title (from CardService); freeform
 * shapes are described geometrically. Freedraw is position-only (no points).
 *
 * Pure function of the host + service — no side-effects, no network, no engine
 * import.
 */
export function snapshotCanvas(
  host: CanvasHost,
  service: CardService,
  /** canvasId 当前未使用(实现读 host 全量元素,不按 canvasId 过滤)。保留为可选:
   *  ① 现有 22 调用点传 CanvasId 仍兼容;② 调用方无需构造占位 id(如 buildCanvasPrompt
   *  的「复制为提示词」路径);③ 供未来 per-canvas scope 过滤用。删参数要改 22 处,YAGNI。 */
  _canvasId?: CanvasId,
): CanvasSnapshotOutput {
  const cards: SnapshotCard[] = []
  const arrows: SnapshotArrow[] = []
  const freeShapes: FreeShape[] = []

  for (const el of host.getElements()) {
    const x = Math.round(el.x)
    const y = Math.round(el.y)
    switch (el.kind) {
      case 'card': {
        // Title/body from CardService (content source of truth), not the element.
        const card = service.get(el.id as CardId)
        cards.push({
          id: el.id,
          x,
          y,
          w: Math.round(el.w),
          h: Math.round(el.h),
          color: el.color,
          title: card?.title ?? '',
          body: card?.body,
          // 结构化字段只采元数据(语言/署名/标签值/链接数),正文/全文不发 —— 见 SnapshotCard 注释。
          codeLanguages: card?.codeSnippets?.map((c) => c.language).filter((l) => !!l && l.length > 0),
          quoteAttributions: card?.quotes?.map((q) => q.attribution ?? '').filter((a) => a.length > 0),
          tagValues: card?.tags?.map((t) => t.value).filter((v) => v.length > 0),
          linkCount: card?.links?.length ?? 0,
        })
        break
      }
      case 'arrow': {
        // 关系箭头(from/to 都有)只携带端点引用;自由箭头(无 from/to)用 bbox
        // 编码线段(w/h 可负表方向),否则 formatCanvasSnapshot 重建时几何丢失。
        const hasEndpoints = !!(el.from && el.to)
        arrows.push({
          id: el.id,
          from: el.from ?? '',
          to: el.to ?? '',
          label: el.text,
          color: el.color,
          dash: el.dash,
          arrowhead: el.arrowhead,
          ...(hasEndpoints ? {} : { x, y, w: Math.round(el.w), h: Math.round(el.h) }),
        })
        break
      }
      case 'rect':
        freeShapes.push({ kind: 'rect', id: el.id, x, y, w: Math.round(el.w), h: Math.round(el.h), color: el.color })
        break
      case 'text':
        freeShapes.push({ kind: 'text', id: el.id, x, y, w: Math.round(el.w), h: Math.round(el.h), text: el.text ?? '', color: el.color })
        break
      case 'freedraw': {
        // Position always + R2-safe shape descriptor (discrete label + scalar
        // ratios; NEVER the point sequence). Recognition runs locally via the
        // canvas-engine; any failure degrades to position-only (no throw).
        const fs: Extract<FreeShape, { kind: 'freedraw' }> = { kind: 'freedraw', id: el.id, x, y }
        try {
          const pts = freedrawPointsOf(el)
          if (pts && pts.length > 0) {
            const classify = classifyFreedraw(pts)
            if (classify.kind === 'arrow') {
              fs.shape = 'arrow'
              fs.shapeConfidence = classify.confidence
            } else {
              // decoration/unknown → narrow to a specific 2D shape via $1.
              const rec = recognizeShape(pts.map(([px, py]) => ({ x: px, y: py })))
              fs.shape = rec.shape
              fs.shapeConfidence = rec.confidence
            }
            fs.features = classify.features
          }
        } catch {
          // Recognition must never block the snapshot — fall back to position-only.
        }
        freeShapes.push(fs)
        break
      }
      default:
        // line/image (legacy) — not surfaced to the AI.
        break
    }
  }

  return { cards, arrows, freeShapes }
}

/**
 * Format the snapshot as a human+AI readable text block (for prompts).
 * Grammar stays close to the round-trip DSL (serializeCanvas) so the model
 * sees a consistent shape; card titles are annotated on a second line.
 *
 * `includeContent`(默认 false):为 true 时每张卡追加 `  content: …` 行(卡片正文)。
 * content 行不以 `[kind ` 开头,parser 逐行静默跳过,round-trip 安全。隐私上 body
 * 已在 AI_CARD_FIELDS allowlist(RAG 本就发 body),这里只是同源数据的另一通道;
 * 默认关 = 省 token + 保守;用户在设置开「AI 包含卡片正文」后 /ask/排版/cluster 才带。
 */
export function formatCanvasSnapshot(
  snapshot: CanvasSnapshotOutput,
  opts?: { includeContent?: boolean },
): string {
  const includeContent = opts?.includeContent === true
  const parts: string[] = []

  parts.push(
    `Canvas: ${snapshot.cards.length} cards, ${snapshot.arrows.length} arrows, ${snapshot.freeShapes.length} free shapes`,
  )
  // B:字段面说明 + 约束。让 AI 知道结构化字段存在但内容不随快照,重新输出卡时保持原样、别编造。
  // 集中在此处而非各 prompt —— 所有注入快照的路径(ask/canvas/companion/dsl-dialog)自动带上。
  parts.push(
    `Note: cards may carry @code/@quote/@links/@tags structured fields whose CONTENT is NOT in this snapshot — only metadata lines (code: N blocks/langs, quote: N, tags: …, links: N) appear below each card. When re-emitting a card, PRESERVE its existing structured fields as-is; do NOT invent or replace content you cannot see. Restrict yourself to layout/relations unless the user explicitly asks to edit a card's content.`,
  )

  for (const c of snapshot.cards) {
    // 重建 CanvasElement 调 serializeElement(唯一文法源:AI 看到的 = parser 能读回的)。
    // header 行 + card `  title: ...` / `  content: ...` 行被 parser 逐行静默跳过,不影响 round-trip。
    const el: CanvasElement = {
      id: c.id, kind: 'card', x: c.x, y: c.y, w: c.w, h: c.h, rotation: 0, color: c.color,
    }
    parts.push(serializeElement(el))
    parts.push(`  title: ${c.title || '(untitled)'}`)
    if (includeContent && c.body) {
      parts.push(`  content: ${c.body}`)
    }
    // 结构化字段元数据(只在非空时输出,避免噪声)。annotation 行不以 `[kind ` 开头,
    // parser 逐行静默跳过,round-trip 安全。code 只发语言+块数,不发正文;quote 只发
    // 条数(+首条署名),不发全文;links 只发条数,不发 URL —— 防止 AI 编造覆盖真实内容。
    if (c.codeLanguages && c.codeLanguages.length > 0) {
      parts.push(`  code: ${c.codeLanguages.length} blocks (${c.codeLanguages.join(', ')})`)
    }
    if (c.quoteAttributions && c.quoteAttributions.length > 0) {
      const first = c.quoteAttributions[0]
      parts.push(`  quote: ${c.quoteAttributions.length}${first ? ` (${first})` : ''}`)
    }
    if (c.tagValues && c.tagValues.length > 0) {
      parts.push(`  tags: ${c.tagValues.join('; ')}`)
    }
    if (c.linkCount && c.linkCount > 0) {
      parts.push(`  links: ${c.linkCount}`)
    }
  }

  for (const a of snapshot.arrows) {
    // 关系箭头(有 from/to):x/y/w/h=0,serializeElement 输出 `from #a to #b`(无 size)。
    // 自由箭头(无 from/to):带 bbox,serializeElement 输出 `@pos+@size`(w/h 可负表方向)。
    const el: CanvasElement = {
      id: a.id, kind: 'arrow',
      x: a.x ?? 0, y: a.y ?? 0, w: a.w ?? 0, h: a.h ?? 0,
      rotation: 0,
      from: a.from, to: a.to, text: a.label, color: a.color, dash: a.dash, arrowhead: a.arrowhead,
    }
    parts.push(serializeElement(el))
  }

  for (const fs of snapshot.freeShapes) {
    // 重建 CanvasElement 调 serializeElement(唯一文法源,保证 AI 看到的 = parser 能读回的)。
    const el: CanvasElement =
      fs.kind === 'rect'
        ? { id: fs.id, kind: 'rect', x: fs.x, y: fs.y, w: fs.w, h: fs.h, rotation: 0, color: fs.color }
        : fs.kind === 'text'
          ? { id: fs.id, kind: 'text', x: fs.x, y: fs.y, w: fs.w, h: fs.h, rotation: 0, text: fs.text, color: fs.color }
          : { id: fs.id, kind: 'freedraw', x: fs.x, y: fs.y, w: 0, h: 0, rotation: 0 }
    parts.push(serializeElement(el))
    // freedraw: append a R2-safe shape annotation line when recognized (mirrors
    // the card `title:` pattern). The parser skips annotation lines (they don't
    // start with `[kind `), so this stays round-trip-safe. NEVER point data.
    if (fs.kind === 'freedraw' && fs.shape) {
      const pct = Math.round((fs.shapeConfidence ?? 0) * 100)
      parts.push(`  shape: ${fs.shape} (${pct}%)`)
    }
  }

  return parts.join('\n')
}
