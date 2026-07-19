import { describe, expect, it } from 'vitest'
import { markdownPreview } from '../markdown-preview'

describe('markdownPreview', () => {
  it('removes markdown markers while preserving readable paragraph spacing', () => {
    expect(markdownPreview('### Heading\n\n- **First**\n- [Second](https://example.com)')).toBe('Heading\nFirst\nSecond')
    expect(markdownPreview('###Heading\n##No space')).toBe('Heading\nNo space')
  })

  it('does not spend compact preview rows on blank Markdown paragraphs', () => {
    expect(markdownPreview('### 标题\n\n第一段\n第二行\n\n- 第三项')).toBe('标题\n第一段\n第二行\n第三项')
  })

  it('keeps source line breaks without letting indentation eat a newline', () => {
    expect(markdownPreview('第一段\n\n    第二段')).toBe('第一段\n第二段')
  })

  it('turns code fences into their useful text instead of exposing fence syntax', () => {
    expect(markdownPreview('```ts\nconst ready = true\n```')).toBe('const ready = true')
  })

  it('removes closing heading markers and task-list checkboxes', () => {
    expect(markdownPreview('### 标题 ###\n\n- [x] 已完成\n- [ ] 待办')).toBe('标题\n已完成\n待办')
  })

  it('turns table rows into readable text and drops the separator row', () => {
    expect(markdownPreview('| 名称 | 状态 |\n| --- | :---: |\n| A | ready |')).toBe('名称 · 状态\nA · ready')
  })

  it('keeps Markdown-looking text inside fenced code blocks', () => {
    expect(markdownPreview('```md\n### literal\n- [x] code\n```')).toBe('### literal\n- [x] code')
  })

  it('removes nested emphasis markers without changing ordinary punctuation', () => {
    expect(markdownPreview('**重点 _说明_** and 2 * 3')).toBe('重点 说明 and 2 * 3')
  })

  it('keeps autolinks and supports tilde code fences', () => {
    expect(markdownPreview('<https://example.com>\n\n~~~js\nconst ok = true\n~~~')).toBe('https://example.com\nconst ok = true')
  })

  it('truncates with a single ellipsis', () => {
    expect(markdownPreview('A long piece of text', 8)).toBe('A long…')
  })
})
