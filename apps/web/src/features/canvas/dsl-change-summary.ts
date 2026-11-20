import type { CardId, CardService } from '@cys-stift/domain'
import type { CanvasElement, InMemoryCanvasHost } from '@cys-stift/canvas-engine'
import type { DslOp } from '@wscytz/dsl'

/** A card change that is invisible to `diffCanvasSnapshots` (content/meta). */
export interface DslNonGeomChange {
  opIndex: number
  cardId: string
  title: string
  fields: string[]
}

/**
 * Collect applied `@title/@content/@type/@tags/...` changes for card update ops.
 * The CanvasElement only carries geometry/meta, so these live on CardService and
 * must be diffed separately from the canvas snapshot.
 */
export function collectDslContentChanges(
  ops: readonly DslOp[],
  service: CardService,
  untitled: string,
  appliedIndices?: ReadonlySet<number>,
): DslNonGeomChange[] {
  const changes: DslNonGeomChange[] = []
  ops.forEach((op, index) => {
    if (appliedIndices && !appliedIndices.has(index)) return
    if (op.type !== 'card' || op.delete || op.create) return
    const current = service.get(op.cardId as CardId)
    const fields: string[] = []
    if (op.title !== undefined && op.title !== current?.title) fields.push('title')
    if (op.content !== undefined && op.content !== current?.body) fields.push('content')
    if (op.cardType !== undefined && op.cardType !== current?.type) fields.push('type')
    if (op.tags !== undefined && JSON.stringify(op.tags) !== JSON.stringify((current?.tags ?? []).map((tag) => tag.value))) fields.push('tags')
    if (op.links !== undefined && JSON.stringify(op.links) !== JSON.stringify((current?.links ?? []).map((link) => link.url))) fields.push('links')
    if (op.code !== undefined && JSON.stringify(op.code) !== JSON.stringify(current?.codeSnippets ?? [])) fields.push('code')
    if (op.quotes !== undefined && JSON.stringify(op.quotes) !== JSON.stringify(current?.quotes ?? [])) fields.push('quotes')
    if (fields.length > 0) {
      changes.push({
        opIndex: index,
        cardId: String(op.cardId),
        title: current?.title ?? op.title ?? untitled,
        fields,
      })
    }
  })
  return changes
}

/**
 * Collect applied card/free meta changes (group/href/layoutAnchor/compute) by
 * comparing the pre-apply element and the projected host after apply.
 *
 * `layoutAnchor` is omitted when geometry already changed: it is a solver
 * by-product in that case, and reporting both would duplicate the same row.
 */
export function collectDslMetaChanges(
  ops: readonly DslOp[],
  results: readonly { opIndex: number; status: string }[],
  beforeElements: readonly CanvasElement[],
  afterHost: InMemoryCanvasHost,
  titleById: ReadonlyMap<string, string>,
  service: CardService,
  untitled: string,
): DslNonGeomChange[] {
  const changes: DslNonGeomChange[] = []
  const beforeById = new Map(beforeElements.map((element) => [element.id, element]))
  for (const result of results) {
    if (result.status !== 'applied') continue
    const op = ops[result.opIndex]
    if (!op) continue
    if (op.type === 'free') {
      if (!op.id || op.delete) continue
      const id = op.id
      const beforeElement = beforeById.get(id)
      const afterElement = afterHost.getElement(id)
      if (!beforeElement || !afterElement) continue
      const fields = (['group', 'compute'] as const).filter(
        (key) => JSON.stringify(beforeElement.meta?.[key]) !== JSON.stringify(afterElement.meta?.[key]),
      )
      if (fields.length > 0) {
        changes.push({
          opIndex: result.opIndex,
          cardId: id,
          title: ('text' in op && typeof op.text === 'string' && op.text) || id,
          fields: [...fields],
        })
      }
      continue
    }
    if (op.type !== 'card' || op.create || op.delete) continue
    const id = String(op.cardId)
    const beforeElement = beforeById.get(id)
    const afterElement = afterHost.getElement(id)
    if (!beforeElement || !afterElement) continue
    const geometryChanged =
      beforeElement.x !== afterElement.x ||
      beforeElement.y !== afterElement.y ||
      beforeElement.w !== afterElement.w ||
      beforeElement.h !== afterElement.h
    const metaKeys = geometryChanged
      ? (['group', 'href'] as const)
      : (['group', 'href', 'layoutAnchor'] as const)
    const fields = metaKeys.filter(
      (key) => JSON.stringify(beforeElement.meta?.[key]) !== JSON.stringify(afterElement.meta?.[key]),
    )
    if (fields.length > 0) {
      changes.push({
        opIndex: result.opIndex,
        cardId: id,
        title: titleById.get(id) ?? service.get(op.cardId as CardId)?.title ?? untitled,
        fields: [...fields],
      })
    }
  }
  return changes
}
