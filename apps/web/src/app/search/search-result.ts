import type { Card, SearchResult } from '@cys-stift/domain'
import { bodySnippet } from '@cys-stift/domain'
import { markdownPreview } from '@/features/card/markdown-preview'

/** Search excerpt over reader-visible Markdown text, preserving source case. */
export function readableBodySnippet(card: Pick<Card, 'body'>, query: string): string | null {
  const readableBody = markdownPreview(card.body, Number.POSITIVE_INFINITY)
  return bodySnippet({ body: readableBody }, query)
}

/**
 * R12:结果片段按 matchedField 取对应字段 —— 此前恒走 body,命中在 link/code/
 * quote/tags 的卡瓦片片段为空,用户看不到「为什么匹配」。URL 命中就展示 URL 命中处。
 */
export function snippetForResult(result: SearchResult, query: string): string | null {
  const c = result.card
  const field = result.matchedField
  if (field === 'body') return readableBodySnippet(c, query)
  if (field === 'title') {
    const s = bodySnippet({ body: c.title }, query)
    return s ?? c.title
  }
  if (field === 'tags') {
    const joined = (c.tags ?? []).map((t) => t.value).join(' ')
    return bodySnippet({ body: joined }, query)
  }
  if (field === 'link') {
    // 对齐索引侧(search.ts):url + title + description 都进索引,snippet 也要带上,
    // 否则用户搜「官方文档」(只在 link title 里)能搜到却看不到为什么匹配(无 snippet 无高亮)。
    const joined = (c.links ?? [])
      .map((l) => [l.url, l.title, l.description].filter(Boolean).join(' '))
      .join(' ')
    return bodySnippet({ body: joined }, query)
  }
  if (field === 'code') {
    const joined = (c.codeSnippets ?? []).map((s) => s.code).join('\n')
    return bodySnippet({ body: joined }, query)
  }
  if (field === 'quote') {
    const joined = (c.quotes ?? []).map((q) => q.text).join(' ')
    return bodySnippet({ body: joined }, query)
  }
  return null
}
