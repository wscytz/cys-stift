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
  const signature = (elements: CanvasElement[]) => JSON.stringify(freeformElementsOf(elements))
  let lastPersistedSignature: string | null = null
  let lastQueuedSignature: string | null = null
  let saveSequence = 0
  // OPFS writes are async. Serialize them so an undo snapshot queued after a
  // pre-undo save cannot finish first and then be overwritten by the older
  // write when the two writable handles resolve out of order.
  let saveChain: Promise<void> = Promise.resolve()
  // 已知的 freeform 元素 id —— 用来判定 removed 的 id 是 freeform 还是 card。
  const knownFreeformIds = new Set<string>()
  // 2026-11-17 备案缺陷 4 合并安全阀:本标签已删除(echo 删除)或已撤销(undo
  // 静默撤走)的 freeform id。写前合并磁盘快照时,这些 id 的磁盘残留不可并回,
  // 否则刚删/刚撤销的笔画会被旧快照复活。id 唯一生成,无需过期机制。
  const tombstonedIds = new Set<string>()
  // hydrate 前用户已绘制但 unbind 时 load 未回:捕获当前 host 的 freeform 元素,
  // 让迟到的 load .then 合并「持久化 ∪ 新建」做一次 save。否则这些笔画会永久丢失
  // (load .then 在 disposed 后短路 return,cleanup 又因 !hydrated 不 flush)。
  let pendingAtDisposal: CanvasElement[] | null = null

  const enqueueSave = (elements: CanvasElement[]) => {
    const nextSignature = signature(elements)
    const sequence = ++saveSequence
    lastQueuedSignature = nextSignature
    saveChain = saveChain
      .catch(() => undefined)
      .then(async () => {
        try {
          // 2026-11-17 备案缺陷 4:写前合并磁盘最新快照。双标签同画布时,本标签
          // hydrate 早于另一标签落盘,直接全量覆盖会抹掉对方新笔迹(静默数据丢失;
          // wikilink 自动同步还会在陈旧标签上放大此问题)。同 id 以本标签 host 状态
          // 为准;AI/DSL apply 的权威投影保存仍走 store.save(投影即真相,不合并)。
          // 残余边界:另一标签删除且本标签 host 仍留有该元素时,并集会复活它——
          // 删除竞态远窄于原先的必然覆盖,跨标签实时同步需另立方案。
          const remote = await store.load(canvasId)
          const merged = (() => {
            const byId = new Map<string, CanvasElement>()
            for (const el of remote?.elements ?? []) {
              if (tombstonedIds.has(el.id)) continue // 本标签已删/已撤销:磁盘残留不复活
              byId.set(el.id, el)
            }
            for (const el of elements) byId.set(el.id, el)
            return Array.from(byId.values())
          })()
          const ok = await store.save(canvasId, merged)
          if (ok !== false) {
            lastPersistedSignature = nextSignature
          } else if (sequence === saveSequence) {
            // Allow a later history event to retry after a quota/IO failure.
            lastQueuedSignature = lastPersistedSignature
          }
        } catch (error) {
          console.warn('[canvas-freeform-binding] save failed', error)
          if (sequence === saveSequence) lastQueuedSignature = lastPersistedSignature
        }
      })
  }

  const doSave = () => {
    timer = null
    if (disposed && !flushing) return
    enqueueSave(freeformElementsOf(host.getElements()))
  }

  // cleanup 时允许在 disposed 之后再 flush 一次(见下方 unbind)。
  let flushing = false

  const scheduleSave = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(doSave, debounceMs)
  }

  const refreshKnownFreeformIds = (elements: CanvasElement[]) => {
    knownFreeformIds.clear()
    for (const el of freeformElementsOf(elements)) knownFreeformIds.add(el.id)
  }

  // 订阅用户源变更。立即建立(hydrate 期间也收,但只标记 dirty 不 save)。
  const unsub = host.onUserChange(({ updated, removed }) => {
    let relevant = false
    for (const el of updated) {
      if (isFreeformElement(el)) {
        knownFreeformIds.add(el.id)
        tombstonedIds.delete(el.id) // 重画/重做同 id 时解除墓碑
        relevant = true
      } else {
        knownFreeformIds.delete(el.id) // card:确保不在集合里
      }
    }
    for (const id of removed) {
      if (knownFreeformIds.has(id)) {
        knownFreeformIds.delete(id)
        tombstonedIds.add(id) // 已删:磁盘残留不得在后续合并中复活
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

  // Undo/redo restores through applyWithoutEcho, so onUserChange is silent.
  // Replace any pending pre-undo snapshot with the current host state and
  // persist that state through the same debounce path.
  const unsubHistory = host.onHistoryChange?.((change) => {
    if (disposed) return
    // push is emitted before the user mutation. The ordinary onUserChange
    // listener owns debounce scheduling; treating push as a restore would
    // cancel an unrelated pending freeform write.
    if (change === 'push') return
    const elements = host.getElements()
    // applyWithoutEcho restore bypasses onUserChange, so refresh the removal
    // index as well as scheduling persistence. Otherwise undoing a deletion
    // followed by deleting the restored element again is silently lost.
    // 2026-11-17:同步维护墓碑——undo 撤走的 id 入墓碑(磁盘残留不得复活),
    // undo/redo 恢复的 id 解除墓碑。
    const previousKnown = new Set(knownFreeformIds)
    refreshKnownFreeformIds(elements)
    for (const id of previousKnown) {
      if (!knownFreeformIds.has(id)) tombstonedIds.add(id)
    }
    for (const id of knownFreeformIds) {
      if (!previousKnown.has(id)) tombstonedIds.delete(id)
    }
    if (!hydrated) { dirtyDuringHydrate = true; return }
    if (timer) { clearTimeout(timer); timer = null }
    if (signature(elements) === lastQueuedSignature) return
    scheduleSave()
  }) ?? (() => {})

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
    lastPersistedSignature = signature(host.getElements())
    lastQueuedSignature = lastPersistedSignature
    hydrated = true
    // hydrate 期间用户已改过 → 保存合并态(持久化 + 新建)。
    if (dirtyDuringHydrate) {
      dirtyDuringHydrate = false
      scheduleSave()
    }
  })

  // 2026-11-17 备案缺陷 2:防抖 500ms 窗口内关标签/切后台不跑 React cleanup,
  // 最后一整笔会丢(笔迹只存在于 host,未落 OPFS)。pagehide /
  // visibilitychange(hidden)时立即 flush;OPFS 写不保证完成,但
  // visibilitychange 通常早于页面关闭触发,是窗口内最好的兜底时机。
  const flushNow = () => {
    if (!timer) return
    clearTimeout(timer)
    timer = null
    // 已 hydrate 才 flush(未 hydrate 时 flush 会用不完整的 host 状态覆盖持久化)。
    if (hydrated) {
      flushing = true
      doSave()
      flushing = false
    }
  }
  document.addEventListener('pagehide', flushNow)
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') flushNow()
  }
  document.addEventListener('visibilitychange', onVisibilityChange)

  return () => {
    disposed = true
    document.removeEventListener('pagehide', flushNow)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    unsub()
    unsubHistory()
    flushNow()
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
