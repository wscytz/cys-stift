'use client'

/**
 * AI cluster(找重复 / 找相似)— 2026-06-23。
 *
 * 「画布上慢慢养」的核心增值:灵感攒多了会出现重复 / 散落的相似卡。AI 读画布上
 * 的卡(走 serializeCardsForAI,allowlist 强制,无 deviceId / 无 media.dataUrl /
 * 软删除卡不可见),返回相似卡分组;本模块把分组落成 related-to 关系箭头(语义签名
 * = 灰色 dotted + 开口V)连接组内成员——非破坏性(不合并 / 不删卡,只连关系),用户
 * 可扫一眼就知道哪些卡相关。
 *
 * 与 handleAILayout 同构:都是「读画布 → 喂 AI → 把结构化结果落回 host」。区别在
 * layout 改位置 / 样式,cluster 加关系。两者都遵守 AI 隐私铁律(allowlist + 无 vision)。
 *
 * ## 输出契约
 *
 * AI 返回 JSON 数组,每项:
 *   { "ids": ["3","7","12"], "kind": "duplicate" | "related", "reason": "都是 React hooks" }
 * ids 引用 prompt 里 [card #id] 的 id;kind 仅用于展示(reason 里说明);应用时一律
 * 落 related-to 关系。模型输出不规范时 parseClusters 返回 [](防御性,绝不抛)。
 */

import type { Card, CardId, CardService } from '@cys-stift/domain'
import type { CanvasHost } from '@cys-stift/canvas-engine'
import { serializeCardsForAI } from './ai-context'
import { relationTypeById } from '../canvas/relation-types'

export type ClusterKind = 'duplicate' | 'related'

export interface CardCluster {
  ids: string[]
  kind: ClusterKind
  reason: string
}

/** 应用结果:实际创建了多少条关系箭头(去重已有 + 组内对数)。 */
export interface ClusterApplyResult {
  arrowsCreated: number
  clustersApplied: number
}

const RELATED_TO = relationTypeById('related-to')!

// ── Prompt 构建(纯函数,可单测) ──────────────────────────────────────────────

/** Cluster 的系统提示:角色 + 输出格式 + 边界。 */
export const CLUSTER_SYSTEM_PROMPT =
  'You are a similarity analyzer for an inspiration canvas. Given a list of cards, group cards that are near-duplicates or clearly related in meaning. ' +
  'Output ONLY a JSON array (no markdown, no prose). Each element: {"ids":["id",...],"kind":"duplicate"|"related","reason":"<short, why they belong together>"}. ' +
  'Rules: ids MUST come from the provided [card #id] list; only group 2+ cards that genuinely share a topic; "duplicate" = same idea repeated, "related" = different but connected; if nothing clusters, output []. ' +
  'The canvas may also contain freeform (hand-drawn) shapes — shown as "[freedraw #id] @pos(...)" followed by a "shape: <circle|rect|triangle|check|arrow|unknown> (<conf>%)" line. You MAY use these shapes as a spatial hint when grouping (e.g. cards enclosed by a drawn circle may belong together), but ids in your output MUST still be card ids only.'

/**
 * 构造 cluster 的用户提示。走 serializeCardsForAI(allowlist + 软删除过滤)。
 * cards 为空或全软删 → 返回 ''(调用方据此跳过,不发空请求)。
 *
 * canvasSnapshot(可选,来自 formatCanvasSnapshot)携带画布布局文本,含 freedraw
 * 的 shape 描述行(A 方向闭环):让 AI 看到手绘形状作为空间分组提示。为空则只发卡片
 * (向后兼容,旧调用 + 单测不受影响)。R2 安全:snapshot 只含离散 shape 标签 +
 * 标量比例,绝不含 freedraw 点坐标(见 snapshotCanvas)。
 */
export function buildClusterUserPrompt(cards: Card[], canvasSnapshot = ''): string {
  const formatted = serializeCardsForAI(cards)
  if (!formatted.trim()) return ''
  const snapshotBlock = canvasSnapshot.trim()
    ? `\nCanvas layout (cards + freeform shapes — use shapes only as a spatial hint, group by card ids):\n${canvasSnapshot.trim()}\n`
    : ''
  return `Find duplicate and related cards. Group 2+ cards that share a topic into clusters. Use the exact [card #id] values.

${formatted}
${snapshotBlock}
Output JSON array only:`
}

// ── 输出解析(纯函数,防御性,绝不抛) ──────────────────────────────────────────

/**
 * 解析 AI 的 cluster 输出。坏 JSON / 非数组 / id 不在白名单 → 丢弃该项;全坏 → []。
 * `knownIds` = prompt 里实际出现过的 card id(只认这些,防模型编 id)。
 */
export function parseClusters(raw: string, knownIds: Set<string>): CardCluster[] {
  let data: unknown
  try {
    data = JSON.parse(stripJsonFence(raw))
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []
  const known = knownIds
  const out: CardCluster[] = []
  for (const item of data) {
    if (!item || typeof item !== 'object') continue
    const ids = extractIds((item as { ids?: unknown }).ids)
    const validIds = ids.filter((id) => known.has(id))
    if (validIds.length < 2) continue // 单卡 / 无效 id 不成组
    const kind: ClusterKind =
      (item as { kind?: unknown }).kind === 'duplicate' ? 'duplicate' : 'related'
    const reason = String((item as { reason?: unknown }).reason ?? '').slice(0, 200)
    out.push({ ids: validIds, kind, reason })
  }
  return out
}

function stripJsonFence(raw: string): string {
  // 模型偶尔包 ```json … ``` — 剥掉,只留数组。
  let s = raw.trim()
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  }
  return s.trim()
}

function extractIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return []
  return ids.map((x) => (typeof x === 'number' ? String(x) : typeof x === 'string' ? x : null))
    .filter((x): x is string => x !== null)
}

// ── 应用到 host(纯逻辑 + host 写入,可单测) ──────────────────────────────────

/**
 * 把 clusters 落成 related-to 关系箭头:每个组内每对卡一条箭头(跳过已存在的同向
 * 同类型关系)。service 用来确认卡仍存在 / 未软删 / 在本画布。
 *
 * 非破坏性:只加关系,不合并不删卡。返回创建数 + 应用组数。
 */
export function applyClusters(
  host: CanvasHost,
  clusters: CardCluster[],
  service: CardService,
  canvasId: string,
): ClusterApplyResult {
  const rt = RELATED_TO
  let arrowsCreated = 0
  let clustersApplied = 0

  // 已存在的 related-to from→to 对(防重复创建)。
  const existing = new Set<string>()
  for (const el of host.getElements()) {
    if (el.kind !== 'arrow' || el.color !== rt.color || el.text !== rt.id) continue
    if (el.from && el.to) existing.add(`${el.from}|${el.to}`)
  }

  for (const cluster of clusters) {
    const valid = filterLiveCards(cluster.ids, service, canvasId)
    if (valid.length < 2) continue
    let createdInCluster = 0
    for (let i = 0; i < valid.length; i++) {
      const a = valid[i]!
      for (let j = i + 1; j < valid.length; j++) {
        const b = valid[j]!
        const key = `${a}|${b}`
        const reverse = `${b}|${a}`
        if (existing.has(key) || existing.has(reverse)) continue
        host.upsert({
          id: `cluster-${a}-${b}-${shortId()}`,
          kind: 'arrow',
          x: 0, y: 0, w: 0, h: 0, rotation: 0,
          from: a, to: b,
          color: rt.color, dash: rt.dash, arrowhead: rt.arrowhead, text: rt.id,
        })
        existing.add(key)
        arrowsCreated++
        createdInCluster++
      }
    }
    if (createdInCluster > 0) clustersApplied++
  }
  return { arrowsCreated, clustersApplied }
}

function filterLiveCards(ids: string[], service: CardService, canvasId: string): string[] {
  const out: string[] = []
  for (const id of ids) {
    const card = service.get(id as CardId)
    if (!card || card.deletedAt || card.archived) continue
    if (card.canvasPosition?.canvasId !== canvasId) continue
    out.push(id)
  }
  return out
}

function shortId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID().slice(0, 8)
  return Math.random().toString(36).slice(2, 10)
}
