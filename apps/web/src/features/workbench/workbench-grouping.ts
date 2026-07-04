/**
 * workbench-grouping — `/workbench` 把 cards 分成 sections 的纯函数(可测)。
 *
 * 每种分类模式(canvas/type/tag)产一个 Section 数组。pinned 卡由调用方单独
 * 提到置顶区(groupSections 排除已 pin 卡,避免重复显示)。
 *
 * 纯函数 = 不碰 service/storage,单测直接喂 Card[]。
 */
import type { Card, CanvasId } from '@cys-stift/domain'
import type { WorkbenchModeId } from './workbench-modes'

/** 一个分区(画布/类型/标签 的某一组,或收件箱)。 */
export interface WorkbenchSection {
  /** 分区 key(稳定,用于 React key + 展开 state)。模式前缀 + 值。 */
  key: string
  /** 显示名(画布名 / 类型名 / 标签值 / 收件箱)。 */
  label: string
  /** 该分区的卡。 */
  cards: Card[]
  /** 色条颜色 token(画布=按画布分配 / 类型=固定 / 标签=标签色 / 收件箱=灰虚线)。 */
  colorBar: string
  /** 收件箱标记(虚线边框样式)。 */
  isInbox?: boolean
}

/**
 * 画布色条循环池(6 原色,按画布 id 出现顺序分配)。
 * 注:这里用 token 字面量,渲染时走 CSS var;gray 留给收件箱。
 */
const CANVAS_COLORS = [
  'var(--color-red)',
  'var(--color-yellow)',
  'var(--color-blue)',
  'var(--color-black)',
] as const

/** 类型色条(固定映射,note/link/code/quote/image)。 */
const TYPE_COLOR: Record<string, string> = {
  note: 'var(--color-red)',
  link: 'var(--color-yellow)',
  code: 'var(--color-blue)',
  quote: 'var(--color-black)',
  image: 'var(--color-gray)',
}

/** 收件箱色条(灰,虚线边框由 isInbox 样式控制)。 */
const INBOX_COLOR = 'var(--color-gray)'

/**
 * 按画布分组 cards:
 * - 有 canvasPosition 的卡按 canvasId 分组(顺序 = canvas 列表顺序;未知画布兜底「未分组」)
 * - 无 canvasPosition 的卡进「收件箱」区(isInbox=true)
 *
 * @param canvasNames canvasId→name 映射(画布列表;未知 id → 「(已删画布)」兜底)
 * @param inboxLabel 收件箱分区显示名(i18n)
 * @param unknownCanvasLabel 未知画布兜底名(i18n)
 */
export function groupByCanvas(
  cards: Card[],
  canvasNames: Map<CanvasId, string>,
  inboxLabel: string,
  unknownCanvasLabel: string,
): WorkbenchSection[] {
  const onCanvas = cards.filter((c) => c.canvasPosition)
  const inbox = cards.filter((c) => !c.canvasPosition)

  // 按 canvasId 分桶,保持 canvas 列表顺序
  const buckets = new Map<string, Card[]>()
  const order: string[] = []
  for (const c of onCanvas) {
    const cid = c.canvasPosition!.canvasId
    if (!buckets.has(cid)) {
      buckets.set(cid, [])
      order.push(cid)
    }
    buckets.get(cid)!.push(c)
  }

  const sections: WorkbenchSection[] = order.map((cid, i) => ({
    key: `canvas:${cid}`,
    label: canvasNames.get(cid as CanvasId) ?? unknownCanvasLabel,
    cards: buckets.get(cid)!,
    colorBar: CANVAS_COLORS[i % CANVAS_COLORS.length]!,
  }))

  if (inbox.length > 0) {
    sections.push({
      key: 'inbox',
      label: inboxLabel,
      cards: inbox,
      colorBar: INBOX_COLOR,
      isInbox: true,
    })
  }

  return sections
}

/**
 * 按类型分组(note/image/link/code/quote;未知兜底「其他」)。
 */
export function groupByType(
  cards: Card[],
  otherLabel: string,
): WorkbenchSection[] {
  const buckets = new Map<string, Card[]>()
  const order: string[] = []
  for (const c of cards) {
    const ty = c.type
    if (!buckets.has(ty)) {
      buckets.set(ty, [])
      order.push(ty)
    }
    buckets.get(ty)!.push(c)
  }
  return order.map((ty) => ({
    key: `type:${ty}`,
    label: ty,
    cards: buckets.get(ty)!,
    colorBar: TYPE_COLOR[ty] ?? INBOX_COLOR,
  }))
}

/**
 * 按 tag 分组(多选 chip 过滤):
 * - 只产 selectedTags 里出现的分区(任一匹配)
 * - 无标签的卡不进任何分区(若全部卡无标签 → 空数组,UI 显示 empty)
 *
 * @param tagColors tag value→color 映射(从 aggregateTags 来)
 */
export function groupByTag(
  cards: Card[],
  selectedTags: string[],
  tagColors: Map<string, string>,
): WorkbenchSection[] {
  if (selectedTags.length === 0) return []
  const sel = new Set(selectedTags)
  const buckets = new Map<string, Card[]>()
  for (const c of cards) {
    for (const t of c.tags ?? []) {
      if (sel.has(t.value)) {
        if (!buckets.has(t.value)) buckets.set(t.value, [])
        buckets.get(t.value)!.push(c)
      }
    }
  }
  // 顺序 = selectedTags 的选择顺序(用户视角稳定)
  return selectedTags
    .filter((tag) => buckets.has(tag))
    .map((tag) => ({
      key: `tag:${tag}`,
      label: tag,
      cards: buckets.get(tag)!,
      colorBar: tagColors.get(tag) ?? INBOX_COLOR,
    }))
}

/** 路由到对应模式的分组函数。pinned 卡应先由调用方剥离(置顶区单独显示)。 */
export function groupForMode(
  mode: WorkbenchModeId,
  cards: Card[],
  opts: {
    canvasNames: Map<CanvasId, string>
    inboxLabel: string
    unknownCanvasLabel: string
    otherLabel: string
    selectedTags: string[]
    tagColors: Map<string, string>
  },
): WorkbenchSection[] {
  switch (mode) {
    case 'canvas':
      return groupByCanvas(cards, opts.canvasNames, opts.inboxLabel, opts.unknownCanvasLabel)
    case 'type':
      return groupByType(cards, opts.otherLabel)
    case 'tag':
      return groupByTag(cards, opts.selectedTags, opts.tagColors)
  }
}

/** 提取 pinned 卡(置顶区用,从分组输入里剥离避免重复)。 */
export function extractPinned(cards: Card[]): { pinned: Card[]; rest: Card[] } {
  const pinned: Card[] = []
  const rest: Card[] = []
  for (const c of cards) {
    if (c.pinned) pinned.push(c)
    else rest.push(c)
  }
  return { pinned, rest }
}
