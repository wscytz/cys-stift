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

/**
 * 归一化标题用于匹配。trim + lowercase(保守:不做去标点等激进变换,
 * 避免误把「(备注)」和「备注」当同一卡)。spec D4 明确「保守倾向」。
 */
export function normalizeTitle(s: string): string {
  return s.trim().toLowerCase()
}

/**
 * Levenshtein 编辑距离(经典 DP,纯函数)。
 * 用 full-matrix 实现(二维 DP);标题典型 <50 字,空间可接受。
 *
 * 用途:wikilink 模糊匹配的「距离」度量(spec D4)。
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m

  // prev = dp[i-1][*],curr = dp[i][*]
  let prev = new Array<number>(n + 1)
  let curr = new Array<number>(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j

  for (let i = 1; i <= m; i++) {
    curr[0] = i
    const ai = a.charCodeAt(i - 1)
    for (let j = 1; j <= n; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1
      curr[j] = Math.min(
        prev[j]! + 1, // 删除
        curr[j - 1]! + 1, // 插入
        prev[j - 1]! + cost, // 替换(或相等)
      )
    }
    // swap
    const tmp = prev
    prev = curr
    curr = tmp
  }
  return prev[n]!
}

export interface WikiLinkCandidate {
  id: string
  title: string
  /**
   * 候选卡所在画布 id(T5 跨画布双链)。
   * - 提供 canvasId 时,与 `matchWikiLinkTitle` 的 `currentCanvasId` 配合实现「同画布优先」。
   * - undefined 表示该卡不在任何画布(inbox)→ 永不享同画布优先,但仍参与匹配。
   */
  canvasId?: string
}

/**
 * 匹配 wikilink 标题到候选卡 id(spec D4 + D3 跨画布)。
 *
 * 策略(保守,优先精确 + 同画布优先):
 *  1. **精确(归一化 lowercase+trim)优先**:多个精确命中 → **同画布优先**
 *     (canvasId === currentCanvasId 的先选);同画布并列 → id 字典序首;排除 selfId。
 *  2. **模糊 fallback(仅当无精确)**:Levenshtein 距离 ≤ 2 且候选标题归一化后
 *     长度 ≥ 3(避免「Jo」「A」等短标题噪声误链)。取距离最小;**距离并列 → 同画布优先**;
 *     仍并列 → id 字典序首;排除 selfId。
 *  3. **无 ≥ 阈值** → undefined(不硬链——宁可少链,不要误链)。
 *
 * 同画布优先仅在「并列(同等匹配质量)」时触发——不跨质量阶(精确永远胜模糊,
 * 距离更小永远胜距离更大)。currentCanvasId 不传 → 无同画布偏好(向后兼容)。
 *
 * 纯函数,无副作用——可独立单测。
 */
export function matchWikiLinkTitle(
  title: string,
  candidates: WikiLinkCandidate[],
  selfId: string,
  currentCanvasId?: string,
): string | undefined {
  const target = normalizeTitle(title)
  if (!target) return undefined

  // 同画布优先比较器:currentCanvasId 提供时,canvasId 匹配的排前。
  const sameCanvasRank = (c: WikiLinkCandidate): number => {
    if (currentCanvasId === undefined) return 0 // 无偏好
    return c.canvasId === currentCanvasId ? 0 : 1
  }

  // 1. 精确匹配(归一化后相等)→ 同画布优先,然后字典序首
  const exactHits = candidates
    .filter((c) => c.id !== selfId && normalizeTitle(c.title) === target)
    .sort((a, b) => {
      const ra = sameCanvasRank(a)
      const rb = sameCanvasRank(b)
      if (ra !== rb) return ra - rb
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })
  if (exactHits.length > 0) return exactHits[0]!.id

  // 2. 模糊 fallback:距离 ≤ 2 且 长度 ≥ 3
  const FUZZY_MAX_DISTANCE = 2
  const FUZZY_MIN_LEN = 3

  const fuzzyHits: { id: string; distance: number; canvasId?: string }[] = []
  for (const c of candidates) {
    if (c.id === selfId) continue
    const norm = normalizeTitle(c.title)
    if (norm.length < FUZZY_MIN_LEN) continue // 短标题噪声跳过
    const distance = levenshtein(target, norm)
    if (distance > FUZZY_MAX_DISTANCE) continue
    fuzzyHits.push({ id: c.id, distance, canvasId: c.canvasId })
  }
  if (fuzzyHits.length > 0) {
    // 距离最小优先;距离并列 → 同画布优先;仍并列 → id 字典序首
    fuzzyHits.sort((a, b) => {
      if (a.distance !== b.distance) return a.distance - b.distance
      const ra =
        currentCanvasId !== undefined && a.canvasId === currentCanvasId ? 0 : 1
      const rb =
        currentCanvasId !== undefined && b.canvasId === currentCanvasId ? 0 : 1
      if (ra !== rb) return ra - rb
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })
    return fuzzyHits[0]!.id
  }
  return undefined
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
  /**
   * (T5 跨画布)所有画布上的候选卡池。提供时 → 用它作为匹配池(走跨画布逻辑);
   * 不提供 → 退回旧行为,从 host.getElements() 构建同画布候选(向后兼容)。
   * 每项需带 canvasId 才能识别跨画布;无 canvasId 的项(inbox)参与匹配但不享同画布优先。
   */
  allCards?: WikiLinkCandidate[]
  /**
   * (T5 跨画布)本卡所在画布 id。与 candidate.canvasId 配合识别「同画布 vs 跨画布」,
   * 决定 arrow 是否打 `meta.crossCanvas`。不提供 → 永不打 crossCanvas(向后兼容)。
   */
  currentCanvasId?: string
}

/**
 * 期望的 wikilink arrow 元信息(对应一张目标卡)。
 * - `bodyTitle`:body 里 `[[bodyTitle]]` 的拼写(原样保留,用于 cross-canvas 渲染 label)。
 * - `isCrossCanvas`:目标卡不在本画布(canvasId !== currentCanvasId 且两者都定义)。
 * - `targetCanvasId`:目标卡所在画布 id(undefined = inbox / 未知)。
 */
interface DesiredWikiLink {
  targetId: string
  bodyTitle: string
  isCrossCanvas: boolean
  targetCanvasId: string | undefined
}

/**
 * 比较现有 arrow 的 cross-canvas 元信息是否仍匹配期望。
 * 任一字段不同 → false(需重建)。所有字段相同 → true(保留)。
 */
function crossCanvasMetaMatches(
  arrow: CanvasElement,
  desired: DesiredWikiLink,
): boolean {
  const aCross = arrow.meta?.crossCanvas === true
  if (aCross !== desired.isCrossCanvas) return false
  // 只有跨画布 desired 才期望 arrow 上有 targetCanvasId;同画布 desired 的 arrow
  // 只打 {wikilink:true}(无 targetCanvasId),期望 undefined。
  // 否则 desired.targetCanvasId(=卡所在画布,如 'canvas-self')会和 arrow 上缺失的
  // 字段(undefined)比较失配 → 每次 sync 都误判 stale → 删旧+建新(arrow id 抖动,
  // 误导 toast 堆,undo 栈膨胀)。注:同画布 desired 的 targetCanvasId 仍保留(供
  // crossCanvas=true 路径用),只是不参与同画布比较。
  // 只有跨画布 desired 才期望 arrow 上有 targetCanvasId;同画布 desired 的 arrow
  // 只打 {wikilink:true}(无 targetCanvasId),期望 undefined。
  // 否则 desired.targetCanvasId(=卡所在画布,如 'canvas-self')会和 arrow 上缺失的
  // 字段(undefined)比较失配 → 每次 sync 都误判 stale → 删旧+建新(arrow id 抖动,
  // 误导 toast 堆,undo 栈膨胀)。注:同画布 desired 的 targetCanvasId 仍保留(供
  // crossCanvas=true 路径用),只是不参与同画布比较。
  const expectedCanvasId = desired.isCrossCanvas ? desired.targetCanvasId : undefined
  const aCanvasId = arrow.meta?.targetCanvasId as string | undefined
  if (aCanvasId !== expectedCanvasId) return false
  // targetTitle 只在 cross-canvas 时存(同画布 plain wikilink 不存);比较时按需。
  const expectedTitle = desired.isCrossCanvas ? desired.bodyTitle : undefined
  const aTitle = arrow.meta?.targetTitle as string | undefined
  if (aTitle !== expectedTitle) return false
  return true
}

/**
 * 同步本卡的双链箭头:
 *  1. 解析 body 提取目标标题
 *  2. 标题→卡 id 用 matchWikiLinkTitle(精确优先;无精确 → Levenshtein ≤ 2 模糊 fallback)
 *  3. 查现有 wikilink arrow:host.getElements() filter arrow && from===source && meta.wikilink===true
 *  4. diff:desired(目标 id + 期望 cross-canvas 元信息) vs existing(现有 arrow 的 to + meta)
 *       - 建 desired - existing(已有的同 to 且 meta 匹配的不重复建)
 *       - 删 existing - desired(to 不再期望)
 *       - **meta 失配重建**:existing 的 to 仍在 desired,但 crossCanvas/targetCanvasId/
 *         targetTitle 变了(如卡搬到别的画布)→ 删旧 + 建新(等价于「recreate」)。
 *       - **去重(T2 race 自愈)**:existing 里同一 to 出现 >1 条 wikilink arrow,
 *         只保留 id 字典序首,其余进 toRemove。
 *  5. 整个 diff 包在 host.batch 内(单 undo 步)
 *  6. 返回 {created, removed} 计数
 *
 * **绝不触碰** 手动 references arrow(无 meta.wikilink)——diff 只看 wikilink 标记的箭头。
 *
 * **跨画布(T5)**:`allCards` + `currentCanvasId` 提供时,匹配池扩到所有画布的卡,
 * 跨画布目标 arrow 打 `meta:{wikilink:true, crossCanvas:true, targetTitle, targetCanvasId}`
 * + text `→ 目标标题`(渲染时 portal 端点用,见 arrowEndpoints)。同画布目标 arrow 不打
 * crossCanvas,text 仍 `references`。
 */
export function syncWikiLinkArrows(params: SyncWikiLinkArrowsParams): SyncWikiLinkArrowsResult {
  const { host, getCardTitle, sourceCardId, body, allCards, currentCanvasId } = params

  // 1. 解析 body 提取目标标题
  const desiredTitles = extractWikiLinks(body)

  // 2. 标题 → 卡 id。
  //    有 allCards → 用它(跨画布候选池,每项已带 title + canvasId)。
  //    无 allCards → 退回 host.getElements() 同画布候选(向后兼容)。
  let candidates: WikiLinkCandidate[]
  if (allCards) {
    candidates = allCards
  } else {
    candidates = []
    for (const el of host.getElements().filter((e) => e.kind === 'card')) {
      const title = getCardTitle(el.id)
      if (title === undefined) continue
      candidates.push({ id: el.id, title })
    }
  }

  // 3. 匹配标题 → 期望 wikilink 列表(目标 id + cross-canvas 元信息)。
  //    多个 body 标题命中同一目标卡(如 [[Foo]] 和 [[foo]] 都精确匹配)→ 取首条(bodyTitle 保留首次拼写)。
  const desiredByTargetId = new Map<string, DesiredWikiLink>()
  for (const title of desiredTitles) {
    const matchedId = matchWikiLinkTitle(title, candidates, sourceCardId, currentCanvasId)
    if (matchedId === undefined) continue
    if (desiredByTargetId.has(matchedId)) continue
    const matched = candidates.find((c) => c.id === matchedId)
    const matchedCanvasId = matched?.canvasId
    const isCrossCanvas =
      currentCanvasId !== undefined &&
      matchedCanvasId !== undefined &&
      matchedCanvasId !== currentCanvasId
    desiredByTargetId.set(matchedId, {
      targetId: matchedId,
      bodyTitle: title,
      isCrossCanvas,
      targetCanvasId: matchedCanvasId,
    })
  }
  const desiredTargetIds = new Set(desiredByTargetId.keys())

  // 4. 查现有 wikilink arrow(from===sourceCardId && meta.wikilink===true)
  const existingWikiArrows: CanvasElement[] = []
  for (const el of host.getElements()) {
    if (el.kind !== 'arrow') continue
    if (el.from !== sourceCardId) continue
    if (el.meta?.wikilink !== true) continue
    existingWikiArrows.push(el)
  }

  // 5. diff(第 1 轮):目标不再期望 → 删;目标期望但 meta 失配 → 删(等下重建)。
  const toRemove: CanvasElement[] = []
  const toRemoveIds = new Set<string>()
  for (const a of existingWikiArrows) {
    if (a.to === undefined) {
      // 无 to 的 wikilink 箭头(异常数据)→ 不删(留给用户/其他流程清理)。
      continue
    }
    if (!desiredTargetIds.has(a.to)) {
      toRemove.push(a)
      toRemoveIds.add(a.id)
      continue
    }
    // to 仍在 desired → 检查 cross-canvas meta 是否仍匹配
    const desired = desiredByTargetId.get(a.to)!
    if (!crossCanvasMetaMatches(a, desired)) {
      toRemove.push(a)
      toRemoveIds.add(a.id)
    }
  }

  // 5b. 去重(T2 hydrate race 自愈):同一 to 出现 >1 条 wikilink arrow,
  //     保留 id 字典序首,其余进 toRemove。即便 body 仍 [[that_target]] 也去重
  //     (body 命中 → desiredTargetIds 含该 to → 不会进上面的 toRemove,但仍可能
  //     有多余副本需要清理——这里覆盖)。meta 失配已被 toRemove 收集的不重复加。
  const byTarget = new Map<string, CanvasElement[]>()
  for (const a of existingWikiArrows) {
    if (a.to === undefined) continue
    const arr = byTarget.get(a.to)
    if (arr) arr.push(a)
    else byTarget.set(a.to, [a])
  }
  for (const [, arr] of byTarget) {
    if (arr.length <= 1) continue
    const sorted = arr.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    for (let i = 1; i < sorted.length; i++) {
      if (!toRemoveIds.has(sorted[i]!.id)) {
        toRemove.push(sorted[i]!)
        toRemoveIds.add(sorted[i]!.id)
      }
    }
  }

  // 6. 算 toCreate = desired - 仍在 host 上的(meta-matched)arrow。
  //    「仍在」= existingWikiArrows 里该 to 的 arrow 至少有一条未被 toRemove 收。
  const keptTargets = new Set<string>()
  for (const a of existingWikiArrows) {
    if (a.to === undefined) continue
    if (toRemoveIds.has(a.id)) continue
    keptTargets.add(a.to)
  }
  const toCreate: DesiredWikiLink[] = []
  for (const [targetId, desired] of desiredByTargetId) {
    if (!keptTargets.has(targetId)) toCreate.push(desired)
  }

  // 7. 批量应用(单 undo 步)
  let created = 0
  let removed = 0
  host.batch(() => {
    for (const d of toCreate) {
      const arrowId = 'arrow-wikilink-' + genId()
      const isCross = d.isCrossCanvas
      host.upsert({
        id: arrowId,
        kind: 'arrow',
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        rotation: 0,
        from: sourceCardId,
        to: d.targetId,
        color: REFERENCES_SIGNATURE.color,
        dash: REFERENCES_SIGNATURE.dash,
        arrowhead: REFERENCES_SIGNATURE.arrowhead,
        // 跨画布:text 标目标标题(portal 渲染 label);同画布:references(原签名 text)。
        text: isCross ? `→ ${d.bodyTitle}` : REFERENCES_SIGNATURE.text,
        meta: isCross
          ? {
              wikilink: true,
              crossCanvas: true,
              targetTitle: d.bodyTitle,
              targetCanvasId: d.targetCanvasId,
            }
          : { wikilink: true },
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
  /** (T5 跨画布)所有画布候选卡池。透传给 syncWikiLinkArrows。 */
  allCards?: WikiLinkCandidate[]
  /** (T5 跨画布)本画布 id。透传给 syncWikiLinkArrows。 */
  currentCanvasId?: string
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
  const { host, getCardTitle, getCardBody, canvasCardIds, allCards, currentCanvasId } = params

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
        allCards,
        currentCanvasId,
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
  /** (T5 跨画布)所有画布候选卡池。透传给 syncWikiLinkArrows。 */
  allCards?: WikiLinkCandidate[]
  /** (T5 跨画布)本画布 id。透传给 syncWikiLinkArrows。 */
  currentCanvasId?: string
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
  const { host, getCardTitle, getCardBody, canvasCardIds, oldTitle, newTitle, allCards, currentCanvasId } = params

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
        allCards,
        currentCanvasId,
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
