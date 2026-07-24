/**
 * v8-fields — DSL 结构化字段(@type/@tags/@links/@code/@quote)→ domain Card 写入字段的共享转换。
 *
 * 从 canvas-host-builder 提取,让三处落库路径共用同一转换,杜绝 v8 字段静默丢弃:
 *  - /ask agent(canvas-host-builder)
 *  - AI Apply(agent-confirm-card 的 makeOnCardCreate/makeOnCardUpdate)
 *  - 画布页 DSL 编辑器(canvas/page 的 onCardCreate/onCardUpdate)
 *
 * tags 值列表 → TagRef[](颜色走 stableTagColor,与 capture/inbox 建卡一致);
 * links URL 列表 → LinkPreview[](fetchedAt=now;title/ogImage 是抓取派生态,DSL 不携带);
 * code/quotes/type 直传。
 */
import type { CardType, TagRef, LinkPreview, CodeBlock, Quote } from '@cys-stift/domain'
import { stableTagColor } from '@/lib/tag-color'

export function v8ToDomainFields(v8: {
  cardType?: CardType
  tags?: string[]
  links?: string[]
  code?: CodeBlock[]
  quotes?: Quote[]
}): {
  type?: CardType
  tags?: TagRef[]
  links?: LinkPreview[]
  codeSnippets?: CodeBlock[]
  quotes?: Quote[]
} {
  const fetchedAt = new Date()
  return {
    ...(v8.cardType !== undefined ? { type: v8.cardType } : {}),
    ...(v8.tags !== undefined
      ? { tags: v8.tags.map((value) => ({ value, color: stableTagColor(value) })) }
      : {}),
    ...(v8.links !== undefined
      ? { links: v8.links.map((url) => ({ url, fetchedAt })) }
      : {}),
    ...(v8.code !== undefined ? { codeSnippets: v8.code } : {}),
    ...(v8.quotes !== undefined ? { quotes: v8.quotes } : {}),
  }
}

/** tags 值序列是否相同(忽略颜色 —— DSL 只携带值;相同值不重写,保住用户自定义色)。 */
export function sameTagValues(existing: TagRef[] | undefined, next: TagRef[]): boolean {
  if (!existing || existing.length !== next.length) return false
  return next.every((t, i) => existing[i]?.value === t.value)
}

/** links URL 序列是否相同(忽略 fetchedAt/title —— DSL 只携带 URL;相同 URL 不重写,保住已抓 title)。 */
export function sameLinkUrls(existing: LinkPreview[] | undefined, next: LinkPreview[]): boolean {
  if (!existing || existing.length !== next.length) return false
  return next.every((l, i) => existing[i]?.url === l.url)
}
