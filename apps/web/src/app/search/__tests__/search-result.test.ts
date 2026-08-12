import { describe, expect, it } from 'vitest'
import { readableBodySnippet, snippetForResult } from '../search-result'
import type { Card, SearchResult } from '@cys-stift/domain'

describe('readableBodySnippet', () => {
  it('preserves source case and strips block Markdown from global-search excerpts', () => {
    const snippet = readableBodySnippet(
      { body: '### API Design\n\n- Keep OriginalCase\n- [x] Ship It' },
      'originalcase',
    )

    expect(snippet).toContain('API Design')
    expect(snippet).toContain('OriginalCase')
    expect(snippet).not.toContain('###')
    expect(snippet).not.toContain('- ')
    expect(snippet).not.toContain('[x]')
  })

  it('returns null when the body has no matching reader-visible text', () => {
    expect(readableBodySnippet({ body: '### Heading' }, 'missing')).toBeNull()
  })
})

describe('snippetForResult — link field (🟡4)', () => {
  // 卡片的 link 标题含「官方文档」但 URL 不含;索引侧搜得到(matchedField='link')。
  // 修复前:snippet 只 join url → bodySnippet 在 url 串里找不到「官方文档」→ 返回 null
  // → 搜得到却看不到为什么匹配。修复后:snippet 带 title → 命中词可见。
  it('link title 命中(query 不在 url):snippet 非空且含命中文本', () => {
    const card = {
      links: [{ url: 'https://example.com/x', title: 'React 官方文档', description: '指南' }],
    } as unknown as Card
    const result = { card, matchedField: 'link' } as unknown as SearchResult
    const snippet = snippetForResult(result, '官方文档')
    expect(snippet).not.toBeNull()
    expect(snippet).toContain('官方文档')
  })

  it('link 命中词只在 description 里:snippet 也覆盖(对齐索引侧)', () => {
    const card = {
      links: [{ url: 'https://example.com/x', title: '', description: '深入浅出的指南' }],
    } as unknown as Card
    const result = { card, matchedField: 'link' } as unknown as SearchResult
    const snippet = snippetForResult(result, '指南')
    expect(snippet).not.toBeNull()
    expect(snippet).toContain('指南')
  })
})
