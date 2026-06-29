import type { Card } from '../types'

/**
 * 本地精确去重(P10 AI 方向,本地层——零依赖纯函数,不走 AI)。
 *
 * ## 为什么本地、为什么精确
 *
 * 「找重复」分两层语义:**精确重复**(同一 URL / 同一代码片段 / 同一标题)和
 * **语义重复**(不同措辞讲同一事)。本模块只做前者——纯几何字符串比对,零 AI、
 * 零隐私顾虑、离线可用、零误报。语义重复留给 LLM(cluster.ts 走那条路)。
 *
 * 这是产品克制:精确重复能 100% 确定该去重,直接给用户操作;语义重复需要 AI 判断
 * + 用户确认,是另一个功能。两者互补不重叠。
 *
 * ## 三个维度(都是精确匹配,归一化后等值)
 *
 * - **URL**:links[].url 归一化(去 fragment、去末尾斜杠、小写 scheme+host)后等值。
 *   同一篇文章收藏两次必然重复。
 * - **代码**:codeSnippets[].code 归一化(去全部空白、小写)后等值。同一段代码贴两次。
 * - **标题**:title 归一化(小写 + 折叠空白)后等值。标题完全相同的卡大概率重复。
 *
 * ## 输出
 *
 * `DuplicateGroup[]`:每组含维度 + 命中的卡 id(≥2 张才成组)+ 人类可读 reason。
 * 非破坏性:只报告,不改卡。调用方(inbox)据 group 预选卡让用户在 batch-bar 处理。
 *
 * 一张卡可能在多个维度重复(既同 URL 又同标题),会出现在多个组里——正确,用户分别处理。
 */

/** 重复维度。 */
export type DuplicateDimension = 'url' | 'code' | 'title'

export interface DuplicateGroup {
  dimension: DuplicateDimension
  /** 命中此重复的卡 id(≥2)。顺序按入参 cards 顺序(稳定)。 */
  cardIds: string[]
  /** 命中的归一化指纹(调试/展示用;URL 是归一化 url,code 是归一化 code,title 是归一化 title)。 */
  fingerprint: string
  /** 人类可读原因(本地化由调用方做,这里给英文技术描述)。 */
  reason: string
}

/** URL 归一化:去 fragment、去末尾斜杠、小写 scheme+host(路径保留大小写)。
 *  例:https://Ex.COM/a/ → http://ex.com/a ;https://x.com/a#b → https://x.com/a */
export function normaliseUrl(url: string): string {
  let u = url.trim()
  // 去 fragment
  const hashIdx = u.indexOf('#')
  if (hashIdx >= 0) u = u.slice(0, hashIdx)
  // 去 query?保留——同 URL 不同 query 可能是不同内容(分页/utm)。但 utm 等追踪参数应去。
  // 折中:去常见追踪参数(utm_*, fbclid, gclid),保留其余 query。
  const qIdx = u.indexOf('?')
  if (qIdx >= 0) {
    const base = u.slice(0, qIdx)
    const query = u.slice(qIdx + 1)
    const kept = query
      .split('&')
      .filter((kv) => {
        const k = kv.split('=')[0]!
        return !k.startsWith('utm_') && k !== 'fbclid' && k !== 'gclid'
      })
    u = kept.length > 0 ? `${base}?${kept.join('&')}` : base
  }
  // 去末尾斜杠(根路径 http://x.com/ 除外)
  if (u.length > 0 && u.endsWith('/') && !u.endsWith('//')) u = u.slice(0, -1)
  // 小写 scheme + host(路径保留大小写——case-sensitive per RFC 3986)
  const m = u.match(/^([a-z]+:\/\/)([^/]+)(.*)$/i)
  if (m) u = m[1]!.toLowerCase() + m[2]!.toLowerCase() + m[3]!
  return u
}

/** 代码归一化:去全部空白 + 小写(代码缩进/换行差异不算不同代码)。 */
export function normaliseCode(code: string): string {
  return code.replace(/\s+/g, '').toLowerCase()
}

/** 标题归一化:小写 + 折叠空白 + 去 control。复用 search.normalise 的语义但不引依赖。 */
export function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 找出 cards 里的精确重复组(三个维度)。
 *
 * 空输入 / 无重复 → []。只返回 ≥2 张卡的组。组内 cardIds 按入参顺序稳定;
 * 组之间无特定顺序(调用方可按 dimension / 组大小排序展示)。
 *
 * 软删除卡(deletedAt 非空)由调用方过滤;本函数只看传入的 cards。
 */
export function findDuplicateGroups(cards: Card[]): DuplicateGroup[] {
  if (cards.length < 2) return []
  const groups: DuplicateGroup[] = []

  // 维度通用分组:归一化指纹 → 命中的卡 id 列表(按入参顺序)。
  const groupBy = (
    dimension: DuplicateDimension,
    fingerprints: { id: string; fp: string | null }[],
    reason: (fp: string) => string,
  ): void => {
    const buckets = new Map<string, string[]>()
    for (const { id, fp } of fingerprints) {
      if (!fp) continue // 空指纹跳过(无 link / 无 code / 空标题)
      const arr = buckets.get(fp)
      if (arr) arr.push(id)
      else buckets.set(fp, [id])
    }
    for (const [fp, ids] of buckets) {
      if (ids.length >= 2) groups.push({ dimension, cardIds: ids, fingerprint: fp, reason: reason(fp) })
    }
  }

  // URL:每张卡每个 link url 归一化(一张卡多 link 各算)。
  // 守卫(c.links ?? [])：外部导入/老数据的卡可能缺 links 字段,崩了整页 inbox。
  const urlFps: { id: string; fp: string | null }[] = []
  for (const c of cards) {
    for (const link of c.links ?? []) {
      const fp = normaliseUrl(link.url)
      if (fp) urlFps.push({ id: c.id, fp })
    }
  }
  groupBy('url', urlFps, (fp) => `same URL: ${fp}`)

  // 代码:每张卡每个 code snippet 归一化。同上守卫。
  const codeFps: { id: string; fp: string | null }[] = []
  for (const c of cards) {
    for (const snip of c.codeSnippets ?? []) {
      const fp = normaliseCode(snip.code)
      if (fp) codeFps.push({ id: c.id, fp })
    }
  }
  groupBy('code', codeFps, () => 'identical code snippet')

  // 标题:title 归一化。
  const titleFps: { id: string; fp: string | null }[] = []
  for (const c of cards) {
    const fp = normaliseTitle(c.title)
    titleFps.push({ id: c.id, fp: fp || null })
  }
  groupBy('title', titleFps, (fp) => `same title: "${fp}"`)

  return groups
}
