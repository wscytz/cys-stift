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
    // 路由/元数据透传(深拷贝嵌套可变部分,防快照与 host 共享引用):
    // 此前裁掉 → AI 触碰过的元素丢失 meta(group/href/compute/freedraw 点序列)与弯折形态,
    // 后续组级锚解析失败、箭头变直线、笔迹拖拽/缩放永久失效。
    ...(element.route ? { route: element.route } : {}),
    ...(element.curve ? { curve: structuredClone(element.curve) } : {}),
    ...(element.elbow ? { elbow: element.elbow.map((p) => ({ ...p })) } : {}),
    // structuredClone 真·深拷:meta.points 是嵌套可变数组,浅拷会与 host 元素共享
    // 内层引用(引擎 snapshot 契约同款"时序炸弹"防御,见 in-memory-host snapshot)。
    ...(element.meta ? { meta: structuredClone(element.meta) } : {}),
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
    // card h 是引擎派生值(render 每次 syncCardHeights 静默自愈,不发事件);
    // 字体晚到等会让 h 在无人编辑时漂移 → 归一,否则 AI 确认门在预览与 Apply
    // 之间被假阳性拒绝("Element changed after preview",2026-11-17 真机复现)。
    .map((element) => (element.kind === 'card' ? { ...element, h: 0 } : element))
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
      // echo 写入(echoing 保持默认 true):让 AI 变更进 undo 栈(batch 合并为一步)+ 触发
      // onUserChange(面板刷新 / freeform 删除索引收录 / DB debounce 回写)。
      // 此前 applyWithoutEcho 导致事件面集体失明——undo 一步跳回 AI 前(整表替换=布局全没)、
      // Minimap/Outline/Companion 等全部陈旧、AI 新建箭头删除后不落盘(重载复活)。
      // persist 已单独落库,echo 的 debounce 回写值与之一致,无冲突;restore() 保持
      // applyWithoutEcho 不变——错误补偿本就要"当什么都没发生",不入栈不发声是故意的。
      host.batch(() => {
        for (const action of actions) host.upsert(toCanvasElement(action.next))
      })
    },
    compensate: () => restore(),
  }
}
