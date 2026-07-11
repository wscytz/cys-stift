/**
 * plainPreview - markdown body 剥成单行纯文本预览(库页堆叠卡/行预览)。
 */
import { describe, it, expect } from 'vitest'
import { plainPreview } from '../preview-text'

describe('plainPreview', () => {
  it('剥标题 #', () => {
    expect(plainPreview('# 标题', 60)).toBe('标题')
    expect(plainPreview('### 三级', 60)).toBe('三级')
  })

  it('剥粗体/斜体/删除线', () => {
    expect(plainPreview('**粗体** 文字', 60)).toBe('粗体 文字')
    expect(plainPreview('*斜* 文字', 60)).toBe('斜 文字')
    expect(plainPreview('~~删~~ 文字', 60)).toBe('删 文字')
  })

  it('剥 wikilink / 链接 / 图片', () => {
    expect(plainPreview('[[双链]]', 60)).toBe('双链')
    expect(plainPreview('[文本](http://x.com)', 60)).toBe('文本')
    expect(plainPreview('![图片](x.png)', 60)).toBe('图片')
    expect(plainPreview('![ ](x.png)', 60)).toBe('') // 空 alt -> 空
  })

  it('剥行内代码 / 代码围栏开口跳过取下一行', () => {
    expect(plainPreview('`code` 嵌入', 60)).toBe('code 嵌入')
    expect(plainPreview('```ts\nconst x = 1\n```', 60)).toBe('const x = 1')
  })

  it('剥列表 / 引用', () => {
    expect(plainPreview('- 列表项', 60)).toBe('列表项')
    expect(plainPreview('1. 有序', 60)).toBe('有序')
    expect(plainPreview('> 引用文字', 60)).toBe('引用文字')
  })

  it('取首非空行(跳过空行 / hr / 围栏)', () => {
    expect(plainPreview('\n\n# 标题', 60)).toBe('标题')
    expect(plainPreview('---\n第一段', 60)).toBe('第一段')
    expect(plainPreview('第一段\n第二段', 60)).toBe('第一段')
  })

  it('截断 + 省略号', () => {
    expect(plainPreview('一二三四五六七八九十', 5)).toBe('一二三四五…')
    expect(plainPreview('短', 60)).toBe('短')
  })

  it('空 / 全空 -> 空串', () => {
    expect(plainPreview('', 60)).toBe('')
    expect(plainPreview('\n\n  \n', 60)).toBe('')
  })

  it('混合:标题+粗体+双链(典型卡片首行)', () => {
    expect(plainPreview('# **重点** 见 [[概念A]]', 60)).toBe('重点 见 概念A')
  })
})
