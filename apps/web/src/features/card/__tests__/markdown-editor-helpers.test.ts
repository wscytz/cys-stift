/**
 * T2 insertMarkdown：工具栏插入 markdown 的纯函数测试。
 * 覆盖 wrap（有/无选区）/ prefix（单行/多行）/ insert / 钳位。
 */
import { describe, it, expect } from 'vitest'
import { insertMarkdown } from '../markdown-editor-helpers'

describe('insertMarkdown — wrap', () => {
  it('bold 包选区，新选区落在内容上', () => {
    const r = insertMarkdown('a x b', 2, 3, 'bold') // 选 "x"
    expect(r.text).toBe('a **x** b')
    expect(r.text.slice(r.selStart, r.selEnd)).toBe('x')
  })

  it('bold 无选区 → 插占位符并选中', () => {
    const r = insertMarkdown('ab', 1, 1, 'bold')
    expect(r.text).toBe('a**粗体**b')
    expect(r.text.slice(r.selStart, r.selEnd)).toBe('粗体')
  })

  it('italic / strike / code wrap 同理', () => {
    expect(insertMarkdown('x', 0, 1, 'italic').text).toBe('*x*')
    expect(insertMarkdown('x', 0, 1, 'strike').text).toBe('~~x~~')
    expect(insertMarkdown('x', 0, 1, 'code').text).toBe('`x`')
  })

  it('link 无选区 → [链接文字](url) 选中 url', () => {
    const r = insertMarkdown('ab', 1, 1, 'link')
    expect(r.text).toBe('a[链接文字](url)b')
    expect(r.text.slice(r.selStart, r.selEnd)).toBe('url')
  })

  it('link 有选区 → 选区当 label，url 仍选中', () => {
    const r = insertMarkdown('点这', 0, 2, 'link')
    expect(r.text).toBe('[点这](url)')
    expect(r.text.slice(r.selStart, r.selEnd)).toBe('url')
  })
})

describe('insertMarkdown — prefix', () => {
  it('h2 当前行加 ## 前缀', () => {
    expect(insertMarkdown('标题', 0, 0, 'h2').text).toBe('## 标题')
  })

  it('ul 多行每行加 - ', () => {
    const r = insertMarkdown('a\nb', 0, 3, 'ul')
    expect(r.text).toBe('- a\n- b')
  })

  it('task 加 - [ ] ', () => {
    expect(insertMarkdown('todo', 0, 0, 'task').text).toBe('- [ ] todo')
  })

  it('quote 加 > ', () => {
    expect(insertMarkdown('q', 0, 0, 'quote').text).toBe('> q')
  })

  it('prefix 只影响选区覆盖的行（不动选区外行）', () => {
    // text = "x\ny\nz"，选 "y"（第 2 行）
    const r = insertMarkdown('x\ny\nz', 2, 3, 'ul')
    expect(r.text).toBe('x\n- y\nz')
  })
})

describe('insertMarkdown — insert', () => {
  it('codeblock 无选区 → 围栏 + 占位符，选占位符', () => {
    const r = insertMarkdown('', 0, 0, 'codeblock')
    expect(r.text).toBe('```\n代码块\n```')
    expect(r.text.slice(r.selStart, r.selEnd)).toBe('代码块')
  })

  it('codeblock 有选区 → 选区当代码内容', () => {
    const r = insertMarkdown('let x = 1', 0, 9, 'codeblock')
    expect(r.text).toBe('```\nlet x = 1\n```')
    expect(r.text.slice(r.selStart, r.selEnd)).toBe('let x = 1')
  })

  it('table 插 3×2 模板', () => {
    const r = insertMarkdown('', 0, 0, 'table')
    expect(r.text).toContain('| 列1 | 列2 | 列3 |')
    expect(r.text).toContain('| --- | --- | --- |')
    expect(r.text).toContain('| a | b | c |')
  })
})

describe('insertMarkdown — 边界', () => {
  it('选区超界被钳位', () => {
    const r = insertMarkdown('ab', -5, 99, 'bold')
    expect(r.text).toBe('**ab**')
  })
})
