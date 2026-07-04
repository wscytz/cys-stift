'use client'

/**
 * Wiki-links ([[另一张卡标题]]) → 自动 references 关系箭头。
 *
 * Obsidian/wiki 风格双链:卡片正文写 `[[另一张卡]]` → 自动建一条 references
 * 关系箭头(from=本卡,to=标题精确匹配的卡)。让语义关系从「手画」变「写出来就成」,
 * 深化关系网(转义/语义关系是核心卖点,这是它的「生产」侧,互补 Backlink 的消费侧)。
 *
 * 纯本地解析:正则 `/\[\[([^\]]+)\]\]/g` 从 body 提取标题,**不碰 AI**(守 R2:body 不外发)。
 *
 * 同步策略(关键):每次重新解析,对比本卡现有的 `meta.wikilink=true && from===本卡`
 * 的 arrow,做 diff——新出现的建,不再存在的删。**手动 references arrow(无
 * meta.wikilink)绝不碰**(meta.wikilink 标记区分自动建与手动建)。
 *
 * 参考同款 host 查询模式:backlinks.ts。references 签名来自 relation-types.ts。
 */
import type { CanvasHost, CanvasElement } from '@cys-stift/canvas-engine'

/** references 关系签名(与 relation-types.ts 的 references 定义对齐)。 */
const REFERENCES_SIGNATURE = {
  color: 'blue',
  dash: 'dashed',
  arrowhead: 'none',
  text: 'references',
} as const

/**
 * 从正文提取所有 `[[标题]]` 的标题(去首尾空格,去重保序)。
 * 纯函数,无副作用——可独立单测。
 */
export function extractWikiLinks(body: string): string[] {
  const re = /\[\[([^\]]+)\]\]/g
  const seen = new Set<string>()
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    const title = m[1]!.trim()
    if (!title) continue // 空 [[]] / [[  ]] 忽略
    if (seen.has(title)) continue // 去重,保序(首次出现)
    seen.add(title)
    out.push(title)
  }
  return out
}

export interface SyncWikiLinkArrowsResult {
  created: number
  removed: number
}

export interface SyncWikiLinkArrowsParams {
  /** CanvasHost(upsert/remove/batch/getElements)。 */
  host: CanvasHost
  /** 卡标题查询(从 CardService)。返回 undefined 表示该 id 无卡。 */
  getCardTitle: (cardId: string) => string | undefined
  /** 本卡 id(箭头的 from)。 */
  sourceCardId: string
  /** 本卡当前正文。 */
  body: string
}

/**
 * 同步本卡的双链箭头:
 *  1. 解析 body 提取目标标题
 *  2. 标题→卡 id(精确大小写不敏感匹配;同标题取 id 字典序首;排除本卡自身)
 *  3. 查现有 wikilink arrow:host.getElements() filter arrow && from===source && meta.wikilink===true
 *  4. diff:desired(目标 id 集合) vs existing(现有 arrow 的 to 集合)
 *       - 建 desired - existing(已有的同 to 不重复建)
 *       - 删 existing - desired
 *  5. 整个 diff 包在 host.batch 内(单 undo 步)
 *  6. 返回 {created, removed} 计数
 *
 * **绝不触碰** 手动 references arrow(无 meta.wikilink)——diff 只看 wikilink 标记的箭头。
 */
export function syncWikiLinkArrows(params: SyncWikiLinkArrowsParams): SyncWikiLinkArrowsResult {
  const { host, getCardTitle, sourceCardId, body } = params

  // 1. 解析 body 提取目标标题
  const desiredTitles = extractWikiLinks(body)

  // 2. 标题 → 卡 id。匹配范围 = 画布上的 card 元素(host.getElements kind==='card')。
  //    精确大小写不敏感匹配;同标题取 id 字典序首(稳定);排除本卡自身。
  const cardElements = host.getElements().filter((e) => e.kind === 'card')
  // 按标题(小写)建倒排:index → 候选 id 列表(排序后取首)
  const titleToIds = new Map<string, string[]>()
  for (const el of cardElements) {
    const title = getCardTitle(el.id)
    if (title === undefined) continue
    const key = title.trim().toLowerCase()
    if (!key) continue
    const arr = titleToIds.get(key)
    if (arr) arr.push(el.id)
    else titleToIds.set(key, [el.id])
  }
  for (const arr of titleToIds.values()) arr.sort() // 字典序,保证取首稳定

  const desiredTargetIds = new Set<string>()
  for (const title of desiredTitles) {
    const candidates = titleToIds.get(title.trim().toLowerCase())
    if (!candidates || candidates.length === 0) continue // 无匹配忽略
    const first = candidates[0]!
    if (first === sourceCardId) {
      // 排除本卡自身:若字典序首恰好是本卡,取下一个(若有)
      const next = candidates[1]
      if (!next) continue
      desiredTargetIds.add(next)
    } else {
      desiredTargetIds.add(first)
    }
  }

  // 3. 查现有 wikilink arrow(from===sourceCardId && meta.wikilink===true)
  const existingWikiArrows: CanvasElement[] = []
  for (const el of host.getElements()) {
    if (el.kind !== 'arrow') continue
    if (el.from !== sourceCardId) continue
    if (el.meta?.wikilink !== true) continue
    existingWikiArrows.push(el)
  }
  const existingTargets = new Set<string>(existingWikiArrows.map((a) => a.to).filter((to): to is string => to !== undefined))

  // 4. diff
  const toCreate: string[] = [] // 目标 id
  for (const targetId of desiredTargetIds) {
    if (!existingTargets.has(targetId)) toCreate.push(targetId)
  }
  const toRemove: CanvasElement[] = [] // arrow 元素
  for (const a of existingWikiArrows) {
    if (a.to === undefined) continue // 无 to 的 wikilink 箭头(异常数据),不删
    if (!desiredTargetIds.has(a.to)) toRemove.push(a)
  }

  // 5. 批量应用(单 undo 步)
  let created = 0
  let removed = 0
  host.batch(() => {
    for (const targetId of toCreate) {
      const arrowId = 'arrow-wikilink-' + genId()
      host.upsert({
        id: arrowId,
        kind: 'arrow',
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        rotation: 0,
        from: sourceCardId,
        to: targetId,
        color: REFERENCES_SIGNATURE.color,
        dash: REFERENCES_SIGNATURE.dash,
        arrowhead: REFERENCES_SIGNATURE.arrowhead,
        text: REFERENCES_SIGNATURE.text,
        meta: { wikilink: true },
      })
      created++
    }
    for (const a of toRemove) {
      host.remove(a.id)
      removed++
    }
  })

  return { created, removed }
}

export interface SyncAllWikiLinksParams {
  /** CanvasHost(upsert/remove/batch/getElements)。 */
  host: CanvasHost
  /** 卡标题查询(从 CardService)。返回 undefined 表示该 id 无卡。 */
  getCardTitle: (cardId: string) => string | undefined
  /** 卡正文查询(从 CardService)。返回 undefined 表示该卡 body 缺失(跳过,不抛)。 */
  getCardBody: (cardId: string) => string | undefined
  /** 当前画布上需要 sync 的卡 id 列表(典型 = host.getElements() filter kind==='card')。 */
  canvasCardIds: string[]
}

/**
 * 批量同步多张卡的双链箭头(canvas hydrate 用)。
 *
 * 策略:遍历 canvasCardIds,每卡调 syncWikiLinkArrows(复用单卡 diff 逻辑),
 * 合一个**外层 host.batch**(单 undo 步)。嵌套 batch 不重复推快照(in-memory-host
 * 的 wasCoalescing 门控 + SelfBuiltAdapter 同款契约),所以即便内部每卡各自 batch,
 * 最终 undo 历史只多 1 步。
 *
 * 计数为各卡 created/removed 的总和。
 *
 * **何时调**:canvas hydrate 完成后(adapter ready + freeform load 完成,卡 id 稳定),
 * debounce 200ms 调一次(避免 hydrate race)。不在每次卡编辑时调(那是 syncWikiLinkArrows
 * 的 per-card 职责,见 CardDetailModal.onSave / wbSave)。
 *
 * **空列表**:canvasCardIds=[] 直接 return {0,0},不调 batch(no-op)。
 */
export function syncAllWikiLinks(params: SyncAllWikiLinksParams): SyncWikiLinkArrowsResult {
  const { host, getCardTitle, getCardBody, canvasCardIds } = params

  if (canvasCardIds.length === 0) return { created: 0, removed: 0 }

  let created = 0
  let removed = 0
  host.batch(() => {
    for (const cardId of canvasCardIds) {
      const body = getCardBody(cardId)
      if (body === undefined) continue // 卡被删 / body 缺失:跳过不抛
      const r = syncWikiLinkArrows({
        host,
        getCardTitle,
        sourceCardId: cardId,
        body,
      })
      created += r.created
      removed += r.removed
    }
  })

  return { created, removed }
}

export interface ResyncWikiLinksForTitleChangeParams {
  /** CanvasHost(upsert/remove/batch/getElements)。 */
  host: CanvasHost
  /** 卡标题查询(从 CardService)。返回 undefined 表示该 id 无卡。 */
  getCardTitle: (cardId: string) => string | undefined
  /** 卡正文查询(从 CardService)。返回 undefined 视作空 body。 */
  getCardBody: (cardId: string) => string | undefined
  /** 当前画布上需要检查的卡 id 列表(典型 = host.getElements() filter kind==='card')。 */
  canvasCardIds: string[]
  /** 改名前的旧标题。 */
  oldTitle: string
  /** 改名后的新标题。 */
  newTitle: string
}

/**
 * 卡标题重命名后,re-sync 受影响卡的双链箭头(spec D2)。
 *
 * 触发场景:卡 R 从 "oldTitle" 改名为 "newTitle"。引用 R 的卡分两类:
 *  - body 含 `[[oldTitle]]`:R 改名前匹配 R,R 改名后不再匹配 → 这些卡的 wikilink
 *    arrow 可能 stale(指向 R 但 body 已不匹配),需 re-sync 清理。
 *  - body 含 `[[newTitle]]`:R 改名前不匹配(找不到),R 改名后匹配 R → 这些卡可能
 *    需要新建 wikilink arrow 到 R,需 re-sync 建立。
 *
 * 策略:
 *  1. 用 `extractWikiLinks(body)` 提取每卡的 wikilink 列表(纯函数,与匹配一致)。
 *  2. filter 到 body 的 links 含 oldTitle 或 newTitle 的卡(大小写不敏感比较,
 *     与 syncWikiLinkArrows 的 title→id 匹配口径一致)。
 *  3. 对每个受影响卡调 syncWikiLinkArrows(它自己做 diff,复用既有逻辑)。
 *  4. 单外层 host.batch(单 undo 步)。嵌套 batch 不重复推快照,与 syncAllWikiLinks 同款契约。
 *
 * 返回各受影响卡 created/removed 的总和。
 *
 * **何时调**:CardDetailModal.onSave / wbSave 检测到 title 真变(oldTitle !== newTitle)
 * 时调。同 title 重保存不触发。
 *
 * **空/whitespace 标题**:oldTitle.trim() 与 newTitle.trim() 都为空 → no-op(无可比对物)。
 * **空 canvasCardIds**:直接 return {0,0},不调 batch。
 *
 * **与 saved 卡自身 syncWikiLinkArrows 的关系**:saved 卡的 body 里若有 `[[oldTitle]]`
 * 或 `[[newTitle]]`,它也会被本函数 re-sync(它的自引用可能匹配/失配)。这不会和
 * onSave 已调的 per-card syncWikiLinkArrows 冲突——diff 是幂等的(第二次跑无变化)。
 */
export function resyncWikiLinksForTitleChange(
  params: ResyncWikiLinksForTitleChangeParams,
): SyncWikiLinkArrowsResult {
  const { host, getCardTitle, getCardBody, canvasCardIds, oldTitle, newTitle } = params

  // 空 canvasCardIds 或 双空 title → no-op
  const oldKey = oldTitle.trim().toLowerCase()
  const newKey = newTitle.trim().toLowerCase()
  if (canvasCardIds.length === 0) return { created: 0, removed: 0 }
  if (!oldKey && !newKey) return { created: 0, removed: 0 }

  // 预 filter:body 含 [[oldTitle]] 或 [[newTitle]] 的卡(用 extractWikiLinks 做规范化,
  // 大小写不敏感比较,与 syncWikiLinkArrows 的 title→id 匹配口径一致)。
  const affectedIds: string[] = []
  for (const cardId of canvasCardIds) {
    const body = getCardBody(cardId) ?? ''
    const links = extractWikiLinks(body)
    const hit = links.some((l) => {
      const k = l.toLowerCase()
      return k === oldKey || k === newKey
    })
    if (hit) affectedIds.push(cardId)
  }

  if (affectedIds.length === 0) return { created: 0, removed: 0 }

  let created = 0
  let removed = 0
  host.batch(() => {
    for (const cardId of affectedIds) {
      const body = getCardBody(cardId) ?? ''
      const r = syncWikiLinkArrows({
        host,
        getCardTitle,
        sourceCardId: cardId,
        body,
      })
      created += r.created
      removed += r.removed
    }
  })

  return { created, removed }
}

/** 箭头 id 生成(与 auto-relate 同款;browser/vitest jsdom 都有 crypto.randomUUID)。 */
function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2)
}
