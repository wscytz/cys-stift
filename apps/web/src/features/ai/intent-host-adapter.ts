import type { CanvasElement, CanvasHost } from '@cys-stift/canvas-engine'
import type { CanvasId, Card, CardId, CardService, ColorToken } from '@cys-stift/domain'
import { canvasFreeformStore, type CanvasFreeformSnapshot } from '@/lib/canvas-freeform-store'
import type { IntentCanvasElement, IntentSnapshot } from './intent-ir'
import { hashIntentPlan, type IntentApplyPlan, type IntentCommitPort, type IntentPlanAction } from './apply-plan'

const SUPPORTED = new Set(['card', 'rect', 'frame', 'text', 'arrow', 'freedraw'])

export function toIntentElement(element: CanvasElement): IntentCanvasElement | null {
  if (!SUPPORTED.has(element.kind)) return null
  return {
    id: element.id,
    kind: element.kind as IntentCanvasElement['kind'],
    x: element.x, y: element.y, w: element.w, h: element.h,
    rotation: element.rotation,
    ...(element.color ? { color: element.color } : {}),
    ...(element.text !== undefined ? { text: element.text } : {}),
    ...(element.from ? { from: element.from } : {}),
    ...(element.to ? { to: element.to } : {}),
    ...(element.dash ? { dash: element.dash } : {}),
    ...(element.arrowhead ? { arrowhead: element.arrowhead } : {}),
  }
}

export function toCanvasElement(element: IntentCanvasElement): CanvasElement {
  return { ...element, rotation: element.rotation ?? 0 } as CanvasElement
}

export function intentRevision(elements: readonly CanvasElement[]): string {
  const normalized = elements
    .map(toIntentElement)
    .filter((element): element is IntentCanvasElement => !!element)
    .sort((a, b) => a.id.localeCompare(b.id))
  return `scene-${hashIntentPlan(normalized)}`
}

export function intentSnapshotFromHost(host: CanvasHost): IntentSnapshot {
  const source = host.getElements()
  return {
    revision: intentRevision(source),
    elements: source.map(toIntentElement).filter((element): element is IntentCanvasElement => !!element),
  }
}

export function previewIntentPlan(host: CanvasHost, plan: IntentApplyPlan): CanvasElement[] {
  const elements = new Map(host.getElements().map((element) => [element.id, structuredClone(element)]))
  for (const op of plan.ops) {
    if (op.status !== 'ready') continue
    for (const action of op.actions) elements.set(action.elementId, toCanvasElement(action.next))
  }
  return [...elements.values()]
}

function matchesGeometry(card: Card, next: IntentCanvasElement, canvasId: CanvasId): boolean {
  const position = card.canvasPosition
  return !!position && position.canvasId === canvasId && position.x === next.x && position.y === next.y && position.w === next.w && position.h === next.h
}

export function makeIntentCommitPort(args: {
  host: CanvasHost
  service: CardService
  canvasId: CanvasId
}): IntentCommitPort {
  const { host, service, canvasId } = args
  const previousCards = new Map<CardId, Card>()
  const previousHostElements = host.getElements().map((element) => structuredClone(element))
  let previousFreeform: CanvasFreeformSnapshot | null = null
  let freeformTouched = false

  const restore = async (): Promise<boolean> => {
    let ok = true
    for (const [id, card] of previousCards) {
      if (card.canvasPosition) service.moveToCanvas(id, card.canvasPosition)
      else service.removeFromCanvas(id)
      service.update(id, { color: card.color ?? null })
      const restored = service.get(id)
      if (!restored || JSON.stringify(restored.canvasPosition) !== JSON.stringify(card.canvasPosition) || restored.color !== card.color) ok = false
    }
    if (freeformTouched) {
      ok = previousFreeform
        ? (await canvasFreeformStore.save(canvasId, previousFreeform.elements)) && ok
        : (await canvasFreeformStore.remove(canvasId)) && ok
    }
    try {
      const previousIds = new Set(previousHostElements.map((element) => element.id))
      host.batch(() => {
        host.applyWithoutEcho(() => {
          for (const current of host.getElements()) {
            if (!previousIds.has(current.id)) host.remove(current.id)
          }
          for (const element of previousHostElements) host.upsert(structuredClone(element))
        })
      })
    } catch {
      ok = false
    }
    return ok
  }

  return {
    getRevision: () => intentRevision(host.getElements()),
    getElement: (id) => {
      const element = host.getElement(id)
      return element ? toIntentElement(element) ?? undefined : undefined
    },
    persist: async (actions: readonly IntentPlanAction[]) => {
      previousFreeform = await canvasFreeformStore.load(canvasId)
      const projected = new Map(host.getElements().map((element) => [element.id, structuredClone(element)]))
      for (const action of actions) projected.set(action.elementId, toCanvasElement(action.next))

      for (const action of actions.filter((candidate) => candidate.next.kind === 'card')) {
        const id = action.elementId as CardId
        const card = service.get(id)
        if (!card) {
          await restore()
          return { ok: false as const, code: 'conflict' as const, message: `Card ${id} no longer exists` }
        }
        if (!previousCards.has(id)) previousCards.set(id, structuredClone(card))
        service.moveToCanvas(id, {
          canvasId,
          x: action.next.x, y: action.next.y, w: action.next.w, h: action.next.h,
          z: card.canvasPosition?.z ?? 0,
          rotation: action.next.rotation ?? card.canvasPosition?.rotation ?? 0,
        })
        if (action.next.color) service.update(id, { color: action.next.color as ColorToken })
        const persisted = service.get(id)
        if (!persisted || !matchesGeometry(persisted, action.next, canvasId) || (action.next.color && persisted.color !== action.next.color)) {
          await restore()
          return { ok: false as const, code: 'storage' as const, message: `Could not persist card ${id}` }
        }
      }

      if (actions.some((action) => action.next.kind !== 'card')) {
        freeformTouched = true
        const ok = await canvasFreeformStore.save(canvasId, [...projected.values()].filter((element) => element.kind !== 'card'))
        if (!ok) {
          await restore()
          return { ok: false as const, code: 'storage' as const, message: 'Could not persist canvas geometry' }
        }
      }
      return { ok: true as const }
    },
    apply: (actions) => {
      host.batch(() => {
        host.applyWithoutEcho(() => {
          for (const action of actions) host.upsert(toCanvasElement(action.next))
        })
      })
    },
    compensate: () => restore(),
  }
}
