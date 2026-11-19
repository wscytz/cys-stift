/**
 * Card layout-anchor sidecar（v11，相对锚持久化）。
 *
 * 为什么需要它：card 的几何以 DB canvasPosition 为单一可信源，`canvas-freeform-store`
 * 明确过滤 card；`CanvasPosition` 也没有 meta 字段。于是 `CanvasElement.meta.layoutAnchor`
 * 只在 host 内存里活着，reload 就丢。这个 store 用 localStorage 按画布存一份
 * cardId → { id, dir, gap } 的 sidecar，加载 card 后 merge 回 meta，元素变化时 debounce 回写。
 *
 * 边界：
 * - 只是布局意图的附属状态，不替代 DB canvasPosition；几何仍以 DB 为准。
 * - 写入失败（隐私模式 / quota）静默降级：关系导出会回退 @pos，不阻塞画布。
 * - .cystift 导出暂不包含此 sidecar；后续需要时在 export-service 里补字段。
 */
import type { CanvasElement, CanvasHost } from '@cys-stift/canvas-engine'

export type CardLayoutAnchor = { id: string; dir: 'right-of' | 'below'; gap: number }

const KEY_PREFIX = 'cys-stift.card-anchors.'
const ID_RE = /^[a-zA-Z0-9_:-]+$/

function storageKey(canvasId: string): string {
  return `${KEY_PREFIX}${canvasId}`
}

function validAnchor(value: unknown): CardLayoutAnchor | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || !ID_RE.test(record.id)) return undefined
  if (record.dir !== 'right-of' && record.dir !== 'below') return undefined
  if (typeof record.gap !== 'number' || !Number.isFinite(record.gap)) return undefined
  return { id: record.id, dir: record.dir, gap: record.gap }
}

/** 读某画布的 card anchors；坏数据/隐私模式 → 空对象。 */
export function loadCardLayoutAnchors(canvasId: string): Record<string, CardLayoutAnchor> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(storageKey(canvasId))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, CardLayoutAnchor> = {}
    for (const [cardId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!ID_RE.test(cardId)) continue
      const anchor = validAnchor(value)
      if (anchor) out[cardId] = anchor
    }
    return out
  } catch {
    return {}
  }
}

/** 覆盖写某画布的 anchors；空对象删 key。失败静默（best-effort）。 */
export function saveCardLayoutAnchors(
  canvasId: string,
  anchors: Record<string, CardLayoutAnchor>,
): void {
  if (typeof window === 'undefined') return
  try {
    if (Object.keys(anchors).length === 0) window.localStorage.removeItem(storageKey(canvasId))
    else window.localStorage.setItem(storageKey(canvasId), JSON.stringify(anchors))
  } catch {
    /* privacy mode / quota: keep the canvas usable */
  }
}

/** 从当前元素集收集 card anchors；无效 meta 自动跳过。 */
export function collectCardLayoutAnchors(
  elements: readonly CanvasElement[],
): Record<string, CardLayoutAnchor> {
  const out: Record<string, CardLayoutAnchor> = {}
  for (const el of elements) {
    if (el.kind !== 'card') continue
    const anchor = validAnchor(el.meta?.layoutAnchor)
    if (anchor) out[el.id] = anchor
  }
  return out
}

/**
 * 用户几何变更的规范化：只有“anchor 没变、几何变了”才清除。
 * - previous 不存在（新卡/DSL create）→ 保留（DSL 刚写入的 anchor 不能被误清）。
 * - anchor 变化（DSL 重新求解/换锚）→ 保留。
 * - 几何没变（纯内容/样式 upsert）→ 保留。
 * - 否则是用户拖拽/缩放/对齐 → 清掉这张卡的 layoutAnchor。
 */
export function clearLayoutAnchorOnUserGeometryChange(
  el: CanvasElement,
  previous: CanvasElement | undefined,
): CanvasElement {
  if (el.kind !== 'card' || !el.meta || el.meta.layoutAnchor === undefined) return el
  if (!previous) return el
  if (JSON.stringify(previous.meta?.layoutAnchor) !== JSON.stringify(el.meta.layoutAnchor)) return el
  if (
    previous.x === el.x &&
    previous.y === el.y &&
    previous.w === el.w &&
    previous.h === el.h
  ) {
    return el
  }
  const meta = { ...el.meta }
  delete meta.layoutAnchor
  return { ...el, meta }
}

/**
 * 绑定：先把已存 anchors merge 回 card elements（applyWithoutEcho，不触发回写/undo），
 * 再订阅元素变化，debounce 把当前 anchors 写回 localStorage。返回解绑函数（会同步 flush）。
 */
export function bindCardLayoutAnchorPersistence(
  host: CanvasHost,
  canvasId: string,
  debounceMs = 300,
): () => void {
  let stored = loadCardLayoutAnchors(canvasId)
  // 已知卡片 id：只对“新出现的卡”补 stored anchor；用户拖拽清掉的锚不会被重新补回。
  const known = new Set<string>()
  let applying = false

  const ensureAnchors = () => {
    if (applying) return
    const currentCards = host.getElements().filter((el) => el.kind === 'card')
    const currentIds = new Set(currentCards.map((el) => el.id))
    for (const id of [...known]) if (!currentIds.has(id)) known.delete(id)
    const newCards = currentCards.filter((el) => !known.has(el.id))
    if (newCards.length === 0) return
    applying = true
    host.applyWithoutEcho(() => {
      for (const el of newCards) {
        known.add(el.id)
        const anchor = stored[el.id]
        if (!anchor || el.meta?.layoutAnchor !== undefined) continue
        host.upsert({ ...el, meta: { ...(el.meta ?? {}), layoutAnchor: anchor } })
      }
    })
    applying = false
  }

  // 首次绑定：已有卡片立即补；卡片还没 hydrate 时 known 为空，后续 onElementsChange 再补。
  ensureAnchors()

  let timer: ReturnType<typeof setTimeout> | null = null
  const flush = () => {
    timer = null
    stored = collectCardLayoutAnchors(host.getElements())
    saveCardLayoutAnchors(canvasId, stored)
  }
  const schedule = () => {
    ensureAnchors()
    if (timer) clearTimeout(timer)
    timer = setTimeout(flush, debounceMs)
  }
  const unsub = host.onElementsChange
    ? host.onElementsChange(schedule)
    : host.onUserChange(schedule)

  return () => {
    if (timer) clearTimeout(timer)
    unsub()
    flush()
  }
}
