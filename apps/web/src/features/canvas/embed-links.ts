'use client'

/**
 * Embed-links ((另一张卡标题)) → 自动 embeds 关系箭头。
 *
 * 与 wiki-links.ts([[标题]] → references)是姊妹模块,结构完全对齐,只是:
 *  - 解析 `((标题))` 而非 `[[标题]]`(正则 `/\(\(([^)]+)\)\)/g`)
 *  - meta.embed 标记(非 meta.wikilink),用于区分自动建与手动建
 *  - embeds 签名(color='yellow', dash='dotted', arrowhead='none', text='embeds'),
 *    来自 relation-types.ts 的 embeds 定义(BR-T1)
 *
 * 渲染层会把目标卡内容嵌入本卡正文(MarkdownBody,BR-T3),这里的箭头是它在画布上
 * 的语义投影。纯本地解析,**不碰 AI**(守 R2:body 不外发)。
 *
 * 同步策略(关键):每次重新解析,对比本卡现有的 `meta.embed=true && from===本卡`
 * 的 arrow,做 diff——新出现的建,不再存在的删。**手动 embeds arrow(无
 * meta.embed)绝不碰**(meta.embed 标记区分自动建与手动建)。
 *
 * resolveCardByTitle 供渲染层用:给定全局 cards 与标题,返回精确(大小写不敏感)
 * 匹配的卡 id;重名取字典序首(与 syncEmbedArrows 内部解析口径一致)。
 *
 * 参考同款 host 查询模式:wiki-links.ts / backlinks.ts。
 */
import type { CanvasHost, CanvasElement } from '@cys-stift/canvas-engine'
import type { Card, CardId } from '@cys-stift/domain'

/** embeds 关系签名(与 relation-types.ts 的 embeds 定义对齐)。 */
const EMBEDS_SIGNATURE = {
  color: 'yellow',
  dash: 'dotted',
  arrowhead: 'none',
  text: 'embeds',
} as const

/**
 * 从正文提取所有 `((标题))` 的标题(去首尾空格,去重保序)。
 * 纯函数,无副作用——可独立单测。
 */
export function extractEmbeds(body: string): string[] {
  const re = /\(\(([^)]+)\)\)/g
  const seen = new Set<string>()
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    const title = m[1]!.trim()
    if (!title) continue // 空 (()) / ((  )) 忽略
    if (seen.has(title)) continue // 去重,保序(首次出现)
    seen.add(title)
    out.push(title)
  }
  return out
}

/**
 * 给定全局 cards 与标题,返回精确(大小写不敏感)匹配的卡 id。
 * 重名取 id 字典序首(稳定);无匹配返回 null。供渲染层解析 embed 目标用。
 *
 * 与 syncEmbedArrows 内部「标题→id」解析口径一致(同样字典序首)。
 */
export function resolveCardByTitle(cards: Card[], title: string): CardId | null {
  const key = title.trim().toLowerCase()
  if (!key) return null
  let best: CardId | null = null
  for (const c of cards) {
    if (c.title.trim().toLowerCase() !== key) continue
    if (best === null || c.id < best) best = c.id // 字典序首
  }
  return best
}

export interface SyncEmbedArrowsResult {
  created: number
  removed: number
}

export interface SyncEmbedArrowsParams {
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
 * 同步本卡的嵌入箭头:
 *  1. 解析 body 提取目标标题
 *  2. 标题→卡 id(精确大小写不敏感匹配;同标题取 id 字典序首;排除本卡自身)
 *  3. 查现有 embed arrow:host.getElements() filter arrow && from===source && meta.embed===true
 *  4. diff:desired(目标 id 集合) vs existing(现有 arrow 的 to 集合)
 *       - 建 desired - existing(已有的同 to 不重复建)
 *       - 删 existing - desired
 *  5. 整个 diff 包在 host.batch 内(单 undo 步)
 *  6. 返回 {created, removed} 计数
 *
 * **绝不触碰** 手动 embeds arrow(无 meta.embed)——diff 只看 embed 标记的箭头。
 */
export function syncEmbedArrows(params: SyncEmbedArrowsParams): SyncEmbedArrowsResult {
  const { host, getCardTitle, sourceCardId, body } = params

  // 1. 解析 body 提取目标标题
  const desiredTitles = extractEmbeds(body)

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

  // 3. 查现有 embed arrow(from===sourceCardId && meta.embed===true)
  const existingEmbedArrows: CanvasElement[] = []
  for (const el of host.getElements()) {
    if (el.kind !== 'arrow') continue
    if (el.from !== sourceCardId) continue
    if (el.meta?.embed !== true) continue
    existingEmbedArrows.push(el)
  }
  const existingTargets = new Set<string>(existingEmbedArrows.map((a) => a.to).filter((to): to is string => to !== undefined))

  // 4. diff
  const toCreate: string[] = [] // 目标 id
  for (const targetId of desiredTargetIds) {
    if (!existingTargets.has(targetId)) toCreate.push(targetId)
  }
  const toRemove: CanvasElement[] = [] // arrow 元素
  for (const a of existingEmbedArrows) {
    if (a.to === undefined) continue // 无 to 的 embed 箭头(异常数据),不删
    if (!desiredTargetIds.has(a.to)) toRemove.push(a)
  }

  // 5. 批量应用(单 undo 步)
  let created = 0
  let removed = 0
  host.batch(() => {
    for (const targetId of toCreate) {
      const arrowId = 'arrow-embed-' + genId()
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
        color: EMBEDS_SIGNATURE.color,
        dash: EMBEDS_SIGNATURE.dash,
        arrowhead: EMBEDS_SIGNATURE.arrowhead,
        text: EMBEDS_SIGNATURE.text,
        meta: { embed: true },
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

/** 箭头 id 生成(与 wiki-links.ts / auto-relate 同款;browser/vitest jsdom 都有 crypto.randomUUID)。 */
function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2)
}
