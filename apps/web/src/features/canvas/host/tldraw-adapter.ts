'use client'

/**
 * TldrawAdapter — CanvasHost 的 tldraw 实现(Phase 0 / Task 2)。
 *
 * host 层**唯一** import @tldraw/tldraw 的文件。把 CanvasHost 的语义操作映射到
 * tldraw Editor:
 *   upsert/remove/getElements  ↔ create/update/deleteShape + getCurrentPageShapes
 *   batch                      ↔ editor.batch
 *   applyWithoutEcho           ↔ store.mergeRemoteChanges   (回写循环抑制)
 *   onUserChange               ↔ store.listen({source:'user'}) → UserChange
 *   getView/setView            ↔ getCamera/setCamera + InstanceState(isGridMode)
 *
 * id 约定集中在此:CanvasElement.id = cardId(无前缀);tldraw shape id = `shape:<id>`。
 * 业务代码不再需要 `cardShapeIdOf`/`cardIdFromShapeId`——它们退为此文件的私有 helper。
 *
 * 行为必须与改造前 canvas-binding.ts / apply-layout.ts 直接调 editor **完全一致**。
 */
import { type Editor, type TLShape } from '@tldraw/tldraw'
import type {
  CanvasElement,
  CanvasHost,
  CanvasView,
  UserChange,
} from './canvas-host'

// ── id 转换(host 的裸 id ↔ tldraw 'shape:' 前缀)──────────────────────────────

function toShapeId(id: string): unknown {
  return `shape:${id}`
}
function fromShapeId(shapeId: unknown): string {
  return String(shapeId).replace(/^shape:/, '')
}

// ── tldraw shape → CanvasElement ─────────────────────────────────────────────

/** 把一个 tldraw shape 映射成 CanvasElement;无法识别的返回 null(调用方过滤)。 */
function shapeToElement(shape: TLShape): CanvasElement | null {
  const id = fromShapeId(shape.id)
  const p = (shape.props ?? {}) as Record<string, unknown>
  const base = {
    id,
    x: shape.x,
    y: shape.y,
    rotation: shape.rotation ?? 0,
  }
  switch (shape.type) {
    case 'card':
      return {
        ...base,
        kind: 'card',
        w: (p.w as number) ?? 240,
        h: (p.h as number) ?? 120,
      }
    case 'geo': {
      const geo = p.geo as string
      const w = (p.w as number) ?? 100
      const h = (p.h as number) ?? 100
      const color = p.color as string | undefined
      if (geo === 'rectangle') return { ...base, kind: 'rect', w, h, color }
      if (geo === 'ellipse') return { ...base, kind: 'ellipse', w, h, color }
      // geo 'line' / 其他 → line(legacy)
      return { ...base, kind: 'line', w, h, color }
    }
    case 'note':
      return {
        ...base,
        kind: 'note',
        w: 200,
        h: 200,
        color: p.color as string | undefined,
        text: (p.text as string) ?? '',
      }
    case 'text':
      return {
        ...base,
        kind: 'text',
        w: (p.w as number) ?? 100,
        h: (p.h as number) ?? 40,
        text: (p.text as string) ?? '',
      }
    case 'arrow': {
      const s = p.start as { boundShapeId?: string } | undefined
      const e = p.end as { boundShapeId?: string } | undefined
      return {
        ...base,
        kind: 'arrow',
        w: 0,
        h: 0,
        color: p.color as string | undefined,
        from: s?.boundShapeId ? fromShapeId(s.boundShapeId) : undefined,
        to: e?.boundShapeId ? fromShapeId(e.boundShapeId) : undefined,
        text: (p.text as string) ?? '',
      }
    }
    case 'draw':
      return {
        ...base,
        kind: 'freedraw',
        w: (p.w as number) ?? 0,
        h: (p.h as number) ?? 0,
        meta: { segments: p.segments },
      }
    default:
      return null
  }
}

// ── CanvasElement → tldraw shape 创建/更新载荷 ───────────────────────────────

/** CanvasElement.kind → tldraw shape type 名。 */
function kindToTldrawType(kind: CanvasElement['kind']): string {
  if (kind === 'rect' || kind === 'ellipse' || kind === 'line') return 'geo'
  if (kind === 'freedraw') return 'draw'
  return kind // card / note / text / arrow
}

/** CanvasElement → tldraw props(只含 tldraw 需要的几何/样式;不含卡片内容)。 */
function elementProps(el: CanvasElement): Record<string, unknown> {
  switch (el.kind) {
    case 'card':
      return { w: el.w, h: el.h }
    case 'rect':
      return { geo: 'rectangle', w: el.w, h: el.h, color: el.color ?? 'black' }
    case 'ellipse':
      return { geo: 'ellipse', w: el.w, h: el.h, color: el.color ?? 'black' }
    case 'line':
      return { geo: 'line', w: el.w, h: el.h, color: el.color ?? 'black' }
    case 'note':
      return { color: el.color ?? 'yellow', text: el.text ?? '' }
    case 'text':
      return { text: el.text ?? '' }
    case 'arrow':
      return {
        start: el.from
          ? {
              type: 'binding',
              boundShapeId: toShapeId(el.from),
              normalizedAnchor: { x: 0.5, y: 0.5 },
              isExact: false,
            }
          : undefined,
        end: el.to
          ? {
              type: 'binding',
              boundShapeId: toShapeId(el.to),
              normalizedAnchor: { x: 0.5, y: 0.5 },
              isExact: false,
            }
          : undefined,
        text: el.text ?? '',
        color: el.color ?? 'black',
      }
    case 'freedraw':
      return { segments: el.meta?.segments ?? [] }
    default:
      return {}
  }
}

// ── Adapter ─────────────────────────────────────────────────────────────────

export class TldrawAdapter implements CanvasHost {
  constructor(private readonly editor: Editor) {}

  getElements(): CanvasElement[] {
    return this.editor
      .getCurrentPageShapes()
      .map((s) => shapeToElement(s))
      .filter((e): e is CanvasElement => e !== null)
  }

  getElement(id: string): CanvasElement | undefined {
    const s = this.editor.getShape(toShapeId(id) as never)
    if (!s) return undefined
    return shapeToElement(s as TLShape) ?? undefined
  }

  upsert(el: CanvasElement): void {
    const sid = toShapeId(el.id) as never
    const existing = this.editor.getShape(sid)
    const payload = {
      id: sid,
      type: kindToTldrawType(el.kind) as never,
      x: el.x,
      y: el.y,
      rotation: el.rotation,
      props: elementProps(el),
    } as never
    if (existing) {
      this.editor.updateShape(payload)
    } else {
      this.editor.createShape(payload)
    }
  }

  remove(id: string): void {
    const sid = toShapeId(id) as never
    if (this.editor.getShape(sid)) this.editor.deleteShape(sid)
  }

  batch(fn: () => void): void {
    this.editor.batch(fn)
  }

  applyWithoutEcho(fn: () => void): void {
    this.editor.store.mergeRemoteChanges(fn)
  }

  onUserChange(cb: (c: UserChange) => void): () => void {
    return this.editor.store.listen(
      (entry) => {
        const updated: CanvasElement[] = []
        const removed: string[] = []
        // changes.updated: { [id]: [from, to] } —— [1] 是新状态。
        for (const change of Object.values(entry.changes.updated)) {
          const after = (change as unknown as [unknown, TLShape] | undefined)?.[1]
          if (after && (after as { typeName?: string }).typeName === 'shape') {
            const el = shapeToElement(after)
            if (el) updated.push(el)
          }
        }
        // changes.removed: { [id]: shape } —— 值是 shape 本身。
        for (const r of Object.values(entry.changes.removed)) {
          const shape = r as TLShape & { typeName?: string }
          if (shape?.typeName === 'shape') removed.push(fromShapeId(shape.id))
        }
        if (updated.length > 0 || removed.length > 0) {
          cb({ updated, removed })
        }
      },
      { source: 'user', scope: 'document' },
    )
  }

  getView(): CanvasView {
    const cam = this.editor.getCamera()
    const isSnap = Boolean(this.editor.getInstanceState().isGridMode)
    return {
      panX: cam.x,
      panY: cam.y,
      zoom: cam.z,
      gridMode: isSnap ? 'snap' : 'free',
    }
  }

  setView(v: CanvasView): void {
    this.editor.setCamera({ x: v.panX, y: v.panY, z: v.zoom })
    const isSnap = v.gridMode === 'snap'
    this.editor.updateInstanceState({ isGridMode: isSnap })
    this.editor.user.updateUserPreferences({ isSnapMode: isSnap })
  }
}
