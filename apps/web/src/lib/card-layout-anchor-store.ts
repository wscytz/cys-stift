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
 * 程序化重排作用域：DSL/关系求解写回新几何时，store 无法仅凭
 * “anchor 未变 + 几何变了”区分用户拖拽与程序化重排（两者形状相同）。
 * applyLayout 在这一段显式声明“这是程序化写入”，清锚回调直接放行。
 * 同步作用域：异常也会恢复深度，避免一次失败让后续拖拽永远不清锚。
 */
let programmaticLayoutDepth = 0

export function withLayoutAnchorPreserved<T>(fn: () => T): T {
  programmaticLayoutDepth++
  try {
    return fn()
  } finally {
    programmaticLayoutDepth--
  }
}

/**
 * 用户几何变更的规范化：只有“anchor 没变、几何变了”才清除。
 * - previous 不存在（新卡/DSL create）→ 保留（DSL 刚写入的 anchor 不能被误清）。
 * - anchor 变化（DSL 重新求解/换锚）→ 保留。
 * - 几何没变（纯内容/样式 upsert）→ 保留。
 * - DSL 程序化重排（withLayoutAnchorPreserved）→ 保留。
 * - 否则是用户拖拽/缩放/对齐 → 清掉这张卡的 layoutAnchor。
 */
export function clearLayoutAnchorOnUserGeometryChange(
  el: CanvasElement,
  previous: CanvasElement | undefined,
): CanvasElement {
  if (programmaticLayoutDepth > 0) return el
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
 *
 * 落盘时机：
 * - 元素变化后 debounce 写回；
 * - 页面隐藏/卸载（pagehide / visibilitychange=hidden）时同步 flush 待写内容 ——
 *   Tauri 窗口关闭、浏览器关标签、切后台不保证 React cleanup 会跑，只靠 unbind 会丢最后一笔；
 * - 解绑时无条件 flush（画布切换 / 组件卸载）。
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
  let disposed = false

  const ensureAnchors = () => {
    if (applying) return
    const currentCards = host.getElements().filter((el) => el.kind === 'card')
    const currentIds = new Set(currentCards.map((el) => el.id))

    // 卡片从元素集消失（删除/撤销重建/换内容）→ 立即丢弃它的内存种子，不能等
    // debounce 落盘才更新：同一 id 在窗口期内被复用（删除后立刻重建、DSL 重放同一
    // 批 #id、undo 后重新 apply）时，新卡不应继承旧卡的锚（旧关系还魂）。
    for (const id of [...known]) {
      if (currentIds.has(id)) continue
      known.delete(id)
      delete stored[id]
    }

    const toSeed: CanvasElement[] = []
    for (const el of currentCards) {
      if (known.has(el.id)) continue
      known.add(el.id)
      const anchor = stored[el.id]
      // 元素已自带锚（DSL 新建/换锚、undo 恢复）→ 以元素为准，不覆盖。
      if (!anchor || el.meta?.layoutAnchor !== undefined) continue
      toSeed.push(el)
    }
    if (toSeed.length === 0) return

    applying = true
    try {
      host.applyWithoutEcho(() => {
        for (const el of toSeed) {
          const anchor = stored[el.id]
          if (!anchor) continue
          host.upsert({ ...el, meta: { ...(el.meta ?? {}), layoutAnchor: anchor } })
        }
      })
    } finally {
      applying = false
    }
  }

  // 首次绑定：已有卡片立即补；卡片还没 hydrate 时 known 为空，后续 onElementsChange 再补。
  ensureAnchors()

  let timer: ReturnType<typeof setTimeout> | null = null
  let pending = false

  const flush = () => {
    // 必须 clearTimeout：pagehide/visibility 的提前 flush 若只把 timer 置 null，
    // 已排队的旧 timeout 会在 unbind 之后再次触发，把解绑后的 host 状态写回。
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    pending = false
    stored = collectCardLayoutAnchors(host.getElements())
    saveCardLayoutAnchors(canvasId, stored)
  }
  const schedule = () => {
    if (disposed) return
    ensureAnchors()
    pending = true
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(flush, debounceMs)
  }
  const unsub = host.onElementsChange
    ? host.onElementsChange(schedule)
    : host.onUserChange(schedule)
  // 绑定期间元素可能已被静默改过（种子被元素自带锚替代/存储里有过期条目）：
  // 排一次 flush 让 sidecar 与当前元素集自愈。只在已有卡片时排 —— 空画布可能是
  // 卡片还没 hydrate，此时 flush 会把尚未 merge 的 sidecar 当空表擦掉（reload 丢锚）。
  if (host.getElements().some((el) => el.kind === 'card')) schedule()

  // 页面隐藏/卸载兜底：只 flush 有 pending 变更的（避免每次切后台都写一遍）。
  const flushIfPending = () => {
    if (pending) flush()
  }
  const onPageHide = () => flushIfPending()
  const onVisibilityChange = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      flushIfPending()
    }
  }
  const listenWindow = typeof window !== 'undefined'
  const listenDocument = typeof document !== 'undefined'
  if (listenWindow) window.addEventListener('pagehide', onPageHide)
  if (listenDocument) document.addEventListener('visibilitychange', onVisibilityChange)

  return () => {
    if (disposed) return
    disposed = true
    if (listenWindow) window.removeEventListener('pagehide', onPageHide)
    if (listenDocument) document.removeEventListener('visibilitychange', onVisibilityChange)
    unsub()
    flush()
  }
}
