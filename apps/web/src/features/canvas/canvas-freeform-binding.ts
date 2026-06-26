'use client'

/**
 * Canvas freeform binding — 把 host 的非卡片元素接到 canvasFreeformStore 持久化
 * (debt 收口 2026-06-23)。仿 canvas-binding(card 走 DB)的结构,但这里管
 * freeform(text / freedraw / arrow / rect):card 几何以 DB 为单一可信源,
 * 绝不进 freeform store(三层防双写:save 过滤 / store 内再过滤 / 此处 onUserChange 过滤)。
 *
 *   hydrate : store.load → applyWithoutEcho(upsert 非 card)  ——不触发 onUserChange
 *   save    : onUserChange(非 card 相关)→ debounce → store.save(当前全部非 card 元素)
 *
 * 竞态防护:
 *  - load 未完成前(hydrated=false)绝不 save,只标记 dirtyDuringHydrate;
 *    hydrate 完成后若 dirty,保存一次「持久化 + hydrate 期间新建」的合并态。
 *  - restore 用 applyWithoutEcho,避免 echo 回环触发 save。
 *  - restore 跳过与现有 card 同 id 的元素(防覆盖 card)。
 *  - disposed 守卫:卸载后迟到的 load 不再 upsert;cleanup 同步 flush pending save。
 */
import type { CanvasId } from '@cys-stift/domain'
import type { CanvasElement, CanvasHost } from '@cys-stift/canvas-engine'
import { canvasFreeformStore } from '@/lib/canvas-freeform-store'

const DEFAULT_DEBOUNCE_MS = 500

/** 非卡片元素判定(card 几何走 DB,不进本 store)。 */
export function isFreeformElement(el: CanvasElement): boolean {
  return el.kind !== 'card'
}

/** 过滤出非卡片元素,保持原有顺序(z 序)。 */
export function freeformElementsOf(elements: CanvasElement[]): CanvasElement[] {
  return elements.filter(isFreeformElement)
}

type Store = Pick<typeof canvasFreeformStore, 'load' | 'save' | 'remove'>

/**
 * 挂上 freeform 持久化。返回 unbind(组件 cleanup 调用)。
 * options.store 可注入(测试用);options.debounceMs 覆盖 save 防抖。
 */
export function attachCanvasFreeformPersistence(
  host: CanvasHost,
  canvasId: CanvasId,
  options?: { debounceMs?: number; store?: Store },
): () => void {
  const store = options?.store ?? canvasFreeformStore
  const debounceMs = options?.debounceMs ?? DEFAULT_DEBOUNCE_MS

  let disposed = false
  let hydrated = false
  let dirtyDuringHydrate = false
  let timer: ReturnType<typeof setTimeout> | null = null
  // 已知的 freeform 元素 id —— 用来判定 removed 的 id 是 freeform 还是 card。
  const knownFreeformIds = new Set<string>()
  // hydrate 前用户已绘制但 unbind 时 load 未回:捕获当前 host 的 freeform 元素,
  // 让迟到的 load .then 合并「持久化 ∪ 新建」做一次 save。否则这些笔画会永久丢失
  // (load .then 在 disposed 后短路 return,cleanup 又因 !hydrated 不 flush)。
  let pendingAtDisposal: CanvasElement[] | null = null

  const doSave = () => {
    timer = null
    if (disposed && !flushing) return
    void store.save(canvasId, freeformElementsOf(host.getElements()))
  }

  // cleanup 时允许在 disposed 之后再 flush 一次(见下方 unbind)。
  let flushing = false

  const scheduleSave = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(doSave, debounceMs)
  }

  // 订阅用户源变更。立即建立(hydrate 期间也收,但只标记 dirty 不 save)。
  const unsub = host.onUserChange(({ updated, removed }) => {
    let relevant = false
    for (const el of updated) {
      if (isFreeformElement(el)) {
        knownFreeformIds.add(el.id)
        relevant = true
      } else {
        knownFreeformIds.delete(el.id) // card:确保不在集合里
      }
    }
    for (const id of removed) {
      if (knownFreeformIds.has(id)) {
        knownFreeformIds.delete(id)
        relevant = true
      }
    }
    if (!relevant) return
    if (!hydrated) {
      dirtyDuringHydrate = true
      return
    }
    scheduleSave()
  })

  // 异步 hydrate:load → restore 非 card(applyWithoutEcho)→ 标记 hydrated。
  void store.load(canvasId).then((snapshot) => {
    if (disposed) {
      // unbind 时 load 未回 + 用户在此期间画过:把持久化快照与 unbind 时捕获的
      // 新建元素合并做一次 save(纯写,不 upsert host,disposed 后安全)。这救回
      // 「OPFS 慢 + 画一笔立刻切画布」会丢的笔画(真 bug)。
      if (pendingAtDisposal && dirtyDuringHydrate) {
        const merged = mergeNewIntoSnapshot(snapshot, pendingAtDisposal)
        void store.save(canvasId, merged)
      }
      return
    }
    if (snapshot && snapshot.elements.length > 0) {
      host.applyWithoutEcho(() => {
        for (const el of snapshot.elements) {
          if (!isFreeformElement(el)) continue // 双保险:不恢复 card
          const existing = host.getElement(el.id)
          if (existing && existing.kind === 'card') continue // 不覆盖同 id 的 card
          host.upsert(el)
          knownFreeformIds.add(el.id)
        }
      })
    }
    hydrated = true
    // hydrate 期间用户已改过 → 保存合并态(持久化 + 新建)。
    if (dirtyDuringHydrate) {
      dirtyDuringHydrate = false
      scheduleSave()
    }
  })

  return () => {
    disposed = true
    unsub()
    if (timer) {
      clearTimeout(timer)
      timer = null
      // 已 hydrate 才 flush(未 hydrate 时 flush 会用不完整的 host 状态覆盖持久化)。
      if (hydrated) {
        flushing = true
        doSave()
        flushing = false
      }
    }
    // 未 hydrate 但用户画过:捕获当前 freeform 元素,交给 load .then 合并保存
    // (此时 host 仍存活——unbind 在 self-canvas effect cleanup 的 adapter.detach
    // 之前跑,host.getElements() 安全)。
    if (!hydrated && dirtyDuringHydrate) {
      pendingAtDisposal = freeformElementsOf(host.getElements())
    }
  }
}

/**
 * 合并持久化快照与 hydrate 期间新建的元素:同 id 以新建为准(用户改动优先),
 * 其余取并集。纯函数,不碰 host。
 */
function mergeNewIntoSnapshot(
  snapshot: { elements: CanvasElement[] } | null | undefined,
  newer: CanvasElement[],
): CanvasElement[] {
  const byId = new Map<string, CanvasElement>()
  for (const el of snapshot?.elements ?? []) byId.set(el.id, el)
  for (const el of newer) byId.set(el.id, el) // 新建/改动覆盖
  return Array.from(byId.values())
}
