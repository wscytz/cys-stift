'use client'

/**
 * Canvas binding — spec §6.11 contract: the SQLite `cards.canvasPosition`
 * column is the single source of truth, NOT the engine's store.
 *
 *   load  : DB cards → host elements → host   (applyWithoutEcho so it
 *           doesn't trip our own 'user'-source writeback listener)
 *   write : host.onUserChange('user') → debounce ~300ms → moveToCanvas → DB
 *
 * The element id IS the domain CardId; the engine-specific id format
 * (tldraw 'shape:' prefix) is handled inside the adapter.
 *
 * Phase 0 / T2 (2026-06-22): refactored to depend on CanvasHost instead of
 * the tldraw Editor directly. Behaviour identical to the pre-refactor version
 * (mergeRemoteChanges→applyWithoutEcho, store.listen→onUserChange, etc.).
 */
import type {
  Card,
  CardId,
  CanvasId,
  CanvasPosition,
  CardService,
  CaptureSource,
} from '@cys-stift/domain'
import type { CanvasElement, CanvasHost } from '@cys-stift/canvas-engine'

const WRITEBACK_DEBOUNCE_MS = 300
const DEFAULT_W = 240
const DEFAULT_H = 120

// ── id helpers (pure; kept for double-click-bridge + tests) ──────────────────
// The 'shape:' prefix is a tldraw convention; these stay as pure string ops so
// callers that hold a raw tldraw shape id (e.g. a hit-test result) can recover
// the card id without going through the host.

/** tldraw shape ids are prefixed 'shape:' — encode the card id after it. */
export function cardShapeIdOf(cardId: CardId): string {
  return `shape:${cardId}`
}

/** Inverse of cardShapeIdOf — recover the domain CardId from a shape id. */
export function cardIdFromShapeId(shapeId: string): CardId {
  return String(shapeId).replace(/^shape:/, '') as unknown as CardId
}

// ── domain Card ↔ host element ───────────────────────────────────────────────

/** Domain Card → host CanvasElement (geometry only; content lives in CardService). */
export function cardToElement(card: Card): CanvasElement {
  const p = card.canvasPosition
  return {
    id: String(card.id),
    kind: 'card',
    x: p?.x ?? 0,
    y: p?.y ?? 0,
    w: p?.w ?? DEFAULT_W,
    h: p?.h ?? DEFAULT_H,
    rotation: p?.rotation ?? 0,
  }
}

/** host element (a card) → CanvasPosition, preserving the card's existing z. */
export function elementToCardPosition(
  el: CanvasElement,
  canvasId: CanvasId,
  existingZ: number,
): CanvasPosition {
  return {
    canvasId,
    x: el.x,
    y: el.y,
    w: el.w,
    h: el.h,
    z: existingZ,
    rotation: el.rotation,
  }
}

// ── load / sync ──────────────────────────────────────────────────────────────

/**
 * Load all cards on `canvasId` into the host, oldest-z first so stacking
 * matches. Marked no-echo so it never re-triggers the writeback listener.
 */
export function loadCardsIntoEditor(
  host: CanvasHost,
  service: CardService,
  canvasId: CanvasId,
): void {
  // spec §1.4: archived + soft-deleted cards are hidden from the canvas.
  const cards = [...service.listOnCanvas(canvasId)]
    .filter((c) => !c.archived && !c.deletedAt)
    .sort((a, b) => (a.canvasPosition?.z ?? 0) - (b.canvasPosition?.z ?? 0))
  if (cards.length === 0) return
  host.applyWithoutEcho(() => {
    for (const card of cards) {
      // B3 (v0.26.4): the DB is the source of truth. If the element already
      // exists (restored from the snapshot) but its position/z/rotation drifted
      // from the DB, reconcile to the DB position rather than skipping.
      const existing = host.getElement(String(card.id))
      const db = card.canvasPosition
      if (existing) {
        const drift =
          existing.x !== db?.x ||
          existing.y !== db?.y ||
          existing.w !== (db?.w ?? DEFAULT_W) ||
          existing.h !== (db?.h ?? DEFAULT_H) ||
          existing.rotation !== (db?.rotation ?? 0)
        if (drift) host.upsert(cardToElement(card))
      } else {
        host.upsert(cardToElement(card))
      }
    }
  })
}

/**
 * Subscribe to user-driven element changes and debounce-write positions back to
 * the DB. Returns an unsubscribe.
 */
export function bindCardWriteback(
  host: CanvasHost,
  service: CardService,
  canvasId: CanvasId,
): () => void {
  const pending = new Map<string, CanvasElement>()
  let timer: ReturnType<typeof setTimeout> | null = null

  const cancelPending = () => {
    pending.clear()
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  const flush = () => {
    timer = null
    for (const el of pending.values()) {
      const cardId = el.id as CardId
      const card = service.get(cardId)
      // B5 (v0.26.4): guard against clobbering a concurrent restore / move.
      if (!card) continue
      if (card.deletedAt) continue
      if (card.archived) continue
      if (card.canvasPosition?.canvasId !== canvasId) continue
      const z = card.canvasPosition?.z ?? 0
      service.moveToCanvas(cardId, elementToCardPosition(el, canvasId, z))
    }
    pending.clear()
  }

  const scheduleFlush = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(flush, WRITEBACK_DEBOUNCE_MS)
  }

  const unsub = host.onUserChange(({ updated, removed }) => {
    for (const el of updated) {
      if (el.kind === 'card') pending.set(el.id, el)
    }
    // 画布 Delete/橡皮 擦掉卡元素 = 把卡「送回 inbox」(清 canvasPosition),
    // 不是删卡。原因:引擎 undo 只恢复 host 元素,不会回滚 DB 的 deletedAt ——
    // 如果这里 softDelete,Undo 后画布上看似恢复了,但 DB 已标记 deletedAt,
    // 切画布/reload 卡就永久丢失(静默数据丢失)。removeFromCanvas 让卡回 inbox
    // 可找回,且与 CardDetailModal 的「送回 inbox」语义一致。
    // 真正的删卡(softDelete)只走 CardDetailModal 的显式「删除」(带 confirm)。
    for (const id of removed) {
      const card = service.get(id as CardId)
      if (card && !card.deletedAt && card.canvasPosition?.canvasId === canvasId) {
        service.removeFromCanvas(id as CardId)
      }
    }
    if (pending.size > 0) scheduleFlush()
  })

  // Undo/redo restores the host through applyWithoutEcho, so neither the
  // pending drag snapshot nor the ordinary user-change listener sees it.
  // Cancel the stale debounce first, then reconcile the restored geometry.
  const unsubHistory = host.onHistoryChange?.((change) => {
    // A normal push happens before the corresponding host mutation. It must
    // not cancel pending writes from an earlier, unrelated card edit.
    if (change === 'push') return
    cancelPending()
    reconcileCanvasHistory(host, service, canvasId)
  }) ?? (() => {})

  // Review fix (v0.37.0): flush synchronously before unsubscribing so a card
  // dragged then immediately followed by a canvas switch / route change / tab
  // close doesn't lose its last position.
  return () => {
    if (timer) { clearTimeout(timer); flush() }
    unsubHistory()
    unsub()
  }
}

/**
 * Sync CardService → host: add elements missing from the host (e.g. sent to
 * canvas from inbox), remove elements no longer on this canvas (sent back to
 * inbox / archived / soft-deleted). No-echo so the writeback listener ignores.
 */
export function syncCardsToEditor(
  host: CanvasHost,
  service: CardService,
  canvasId: CanvasId,
): void {
  host.applyWithoutEcho(() => {
    const wanted = service
      .listOnCanvas(canvasId)
      .filter((c) => !c.archived && !c.deletedAt)
    const wantedIds = new Set(wanted.map((c) => String(c.id)))
    // Add missing.
    for (const card of wanted) {
      if (host.getElement(String(card.id))) continue
      host.upsert(cardToElement(card))
    }
    // Remove orphaned card elements (on canvas but no longer in CardService here).
    for (const el of host.getElements()) {
      if (el.kind !== 'card') continue
      if (!wantedIds.has(el.id)) host.remove(el.id)
    }
  })
}

/**
 * Add a card to the host (e.g. just created via double-click). No-echo so it
 * doesn't trip the writeback listener.
 */
export function addCardShape(host: CanvasHost, card: Card): void {
  if (host.getElement(String(card.id))) return
  host.applyWithoutEcho(() => host.upsert(cardToElement(card)))
}

/** Sync a card's size onto its host element (e.g. after a modal edit). */
export function updateCardShape(host: CanvasHost, card: Card): void {
  if (!host.getElement(String(card.id))) return
  host.applyWithoutEcho(() => host.upsert(cardToElement(card)))
}

/** Remove a card's element (e.g. after archive / soft-delete, both hide it). */
export function removeCardShape(host: CanvasHost, cardId: CardId): void {
  if (!host.getElement(String(cardId))) return
  host.applyWithoutEcho(() => host.remove(String(cardId)))
}

/**
 * Create a card on the canvas at (x, y). Shared by DSL paste (opts.id given,
 * title may be empty) and right-click create (no opts.id, title from input).
 * Invariant preserved: element id === CardId.
 *
 * - opts.id given (DSL path):
 *   - already in service → moveToCanvas (geometry update only, no rebuild).
 *   - not present         → createWithId (mint the supplied id).
 *   - host missing element → upsert cardToElement (no-echo) so the canvas shows it.
 * - opts.id absent (right-click path):
 *   - service.create mints the id; addCardShape adds it to the host.
 */
export function createCardOnCanvas(
  service: CardService,
  host: CanvasHost,
  canvasId: CanvasId,
  opts: { id?: string; title: string; x: number; y: number; w?: number; h?: number },
): Card {
  const w = opts.w ?? DEFAULT_W
  const h = opts.h ?? DEFAULT_H
  const pos: CanvasPosition = {
    canvasId,
    x: opts.x,
    y: opts.y,
    w,
    h,
    z: 0,
    rotation: 0,
  }
  const source = { kind: 'manual', deviceId: 'web' } as CaptureSource

  if (opts.id) {
    const existing = service.get(opts.id as CardId)
    if (existing) {
      service.moveToCanvas(opts.id as CardId, pos)
    } else {
      service.createWithId(opts.id as CardId, {
        title: opts.title,
        source,
        canvasPosition: pos,
      })
    }
    // host may not yet have the element (e.g. brand-new card, or restored card
    // whose element was pruned) — ensure the canvas shows it.
    if (!host.getElement(opts.id)) {
      host.applyWithoutEcho(() => host.upsert(cardToElement(service.get(opts.id as CardId)!)))
    }
    return service.get(opts.id as CardId)!
  }

  const card = service.create({ title: opts.title, source, canvasPosition: pos })
  addCardShape(host, card)
  return card
}

/**
 * undo/redo 后的双向差集(reconcile):把「host 卡元素 ↔ service 卡片」拉回一致。
 *
 * undo/redo desync 根因(v0.38.0):引擎 undo 恢复 host 元素走 applyWithoutEcho
 * (设计上抑制 onUserChange 以避免回写 echo 循环),所以 onUserChange(removed) →
 * removeFromCanvas 的逆操作不会被触发:Delete 清了 DB canvasPosition,Undo 把卡
 * 元素放回 host,但 DB 仍无 canvasPosition → 下一次 syncCardsToEditor(任何 snap
 * 改动 / 切回画布)算 wantedIds 时不含此卡 → 再次把卡从 host 移除。用户「Undo 找回
 * 卡」视觉回弹一瞬又消失,心智被打破(卡可从 inbox 找回,非数据丢失,但体验回退)。
 *
 * 本函数做两个方向的差集(全程包在 applyWithoutEcho 内,repo.update → notify →
 * syncCardsToEditor 的 host 写不再触发 onUserChange,避免 echo 循环):
 *
 *   1. host → DB:对每个仍在 host 里的 *card* 元素,若 DB canvasPosition 缺失或指向
 *      别处,用 host 元素几何把它 move 回本画布;若卡是软删状态(eraser card 模式
 *      softDelete 后 undo),先 restore。归档卡跳过(用户主动归档,非 eraser)。
 *      仅 card:freeform(text/freedraw/arrow/rect)有自己的持久化,不走 DB canvasPosition。
 *   2. DB → host(修撤销卡复活):DB 有本画布的卡但 host 没有 → removeFromCanvas
 *      回 inbox。触发场景:undo 把卡从 host 撤掉,但 DB 仍 canvasPosition@本画布
 *      (undo 走 applyWithoutEcho,onUserChange 不触发,writeback 没清 DB)→ 不处理
 *      的话下次 syncCardsToEditor 读 DB wantedIds 含此卡 → upsert 回 host → 幽灵卡复活。
 *
 * 与上面 moveToCanvas(host 有 DB 无)配对:undo = remove,redo = move 回,闭环幂等。
 * 归档/软删卡在两个方向都跳过(归档卡本就不在 host;软删卡 deletedAt 已设,
 * listOnCanvas 是否含取决于 repo,统一跳过)。普通 history push 由
 * onUserChange 的 debounce 负责,不调用本函数,避免清掉其他卡片的待写位置。
 *
 * 由 bindCardWriteback 订阅 onHistoryChange,仅在 undo / redo 后调用。
 */
export function reconcileCanvasHistory(
  host: CanvasHost,
  service: CardService,
  canvasId: CanvasId,
): void {
  host.applyWithoutEcho(() => {
    // ── host → DB 方向:对每个 host 里的 card 元素,把 DB canvasPosition 拉回本画布 ──
    for (const el of host.getElements()) {
      if (el.kind !== 'card') continue
      const cardId = el.id as CardId
      const card = service.get(cardId)
      // 卡不在 DB(新建未落库 / 已真正删除)→ 跳过。
      if (!card) continue
      // eraser card 模式 softDelete 后 undo:host 恢复了卡元素,但 DB deletedAt 仍设。
      // restore 找回(清 deletedAt),让卡回到画布而非留在回收桶。
      // (redo 重新删除的不完美是预存限制,与 Delete 键 redo 同源,不新增问题。)
      if (card.deletedAt) {
        service.restore(cardId)
      }
      // 归档的卡不应回到画布(用户主动归档,非 eraser)。
      if (card.archived) continue
      const pos = card.canvasPosition
      const sameGeometry = pos?.canvasId === canvasId &&
        pos.x === el.x && pos.y === el.y &&
        pos.w === el.w && pos.h === el.h &&
        (pos.rotation ?? 0) === (el.rotation ?? 0)
      if (sameGeometry) continue // 已一致:幂等 no-op
      // DB 无 canvasPosition(被 Delete 清掉,undo 刚恢复 host 元素)或指向别画布
      // (跨画布 undo 边界,理论少见)→ 用 host 元素几何落回本画布。
      const z = pos?.z ?? 0
      service.moveToCanvas(cardId, elementToCardPosition(el, canvasId, z))
    }
    // ── DB → host 方向(修撤销卡复活):DB 有本画布的卡但 host 没有 → removeFromCanvas ──
    const hostCardIds = new Set(
      host.getElements().filter((e) => e.kind === 'card').map((e) => e.id),
    )
    for (const card of service.listOnCanvas(canvasId)) {
      if (card.deletedAt || card.archived) continue
      if (!hostCardIds.has(String(card.id))) {
        service.removeFromCanvas(card.id)
      }
    }
  })
}
