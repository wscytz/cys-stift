import { describe, expect, it } from 'vitest'
import type { CanvasElement } from '@cys-stift/canvas-engine'
import { parseDsl } from '../dsl-parser'
import { serializeCanvas } from '../canvas-dsl'
import { sanitizeDslOps } from '../dsl-sanitize'
import { DSL_MAX_CONTENT_LEN, DSL_MAX_TEXT_LEN } from '../dsl-grammar'

/**
 * v5 @title/@content 专项(Slice A:parse 侧)。
 * 验证 DSL 现在能"读"卡片内容:title/content 解析、\n 多行解码、长度截断、v4 向后兼容、转义。
 */
describe('cys-dsl v5 @title/@content', () => {
  it('parses @title and @content on a card', () => {
    const ops = parseDsl('[card #c1] @pos(10,20) @size(100,80) @title("Hi") @content("body text")')
    expect(ops[0]).toMatchObject({ type: 'card', cardId: 'c1', title: 'Hi', content: 'body text' })
  })

  it('decodes \\n in @content to a real newline (multi-line markdown on one DSL line)', () => {
    const ops = parseDsl('[card #c1] @pos(0,0) @size(10,10) @content("line1\\nline2")')
    expect((ops[0] as { content?: string }).content).toBe('line1\nline2')
  })

  it('v4 compat: card without @title/@content parses with undefined title/content', () => {
    const ops = parseDsl('[card #c1] @pos(0,0) @size(10,10)')
    expect((ops[0] as { title?: string }).title).toBeUndefined()
    expect((ops[0] as { content?: string }).content).toBeUndefined()
  })

  it('truncates @title to DSL_MAX_TEXT_LEN and @content to DSL_MAX_CONTENT_LEN', () => {
    const longTitle = 'T'.repeat(DSL_MAX_TEXT_LEN + 50)
    const longContent = 'C'.repeat(DSL_MAX_CONTENT_LEN + 1000)
    const ops = parseDsl(
      `[card #c1] @pos(0,0) @size(10,10) @title("${longTitle}") @content("${longContent}")`,
    )
    expect((ops[0] as { title?: string }).title).toHaveLength(DSL_MAX_TEXT_LEN)
    expect((ops[0] as { content?: string }).content).toHaveLength(DSL_MAX_CONTENT_LEN)
  })

  it('sanitize truncates over-long content too (apply 前第二道防线)', () => {
    const over = 'X'.repeat(DSL_MAX_CONTENT_LEN + 10)
    const op = { type: 'card', cardId: 'c1', x: 0, y: 0, content: over } as never
    const { ops } = sanitizeDslOps([op])
    expect((ops[0] as { content?: string }).content).toHaveLength(DSL_MAX_CONTENT_LEN)
  })

  it('preserves quotes/backslashes inside @content via escapes', () => {
    const ops = parseDsl('[card #c1] @pos(0,0) @size(10,10) @content("a \\"quote\\" and a \\\\bslash")')
    expect((ops[0] as { content?: string }).content).toBe('a "quote" and a \\bslash')
  })

  it('accepts @title without @content and vice versa', () => {
    const a = parseDsl('[card #c1] @pos(0,0) @size(10,10) @title("only title")')
    expect((a[0] as { title?: string }).title).toBe('only title')
    expect((a[0] as { content?: string }).content).toBeUndefined()
    const b = parseDsl('[card #c2] @pos(0,0) @size(10,10) @content("only body")')
    expect((b[0] as { title?: string }).title).toBeUndefined()
    expect((b[0] as { content?: string }).content).toBe('only body')
  })
})

describe('cys-dsl v5 serialize @title/@content (Slice B)', () => {
  const card = (id: string): CanvasElement => ({ id, kind: 'card', x: 10, y: 20, w: 100, h: 80, rotation: 0 })

  it('serializeCanvas emits @title/@content when resolve is provided', () => {
    const text = serializeCanvas([card('c1')], () => ({ title: 'Hi', content: 'body' }))
    expect(text).toContain('@title("Hi")')
    expect(text).toContain('@content("body")')
  })

  it('serializeCanvas is geometry-only when resolve is omitted (backward compat)', () => {
    const text = serializeCanvas([card('c1')])
    expect(text).not.toContain('@title')
    expect(text).not.toContain('@content')
  })

  it('round-trips content: serialize → parse preserves title/content (incl. \\n)', () => {
    const text = serializeCanvas([card('c1')], () => ({ title: '标题', content: '第一行\n第二行' }))
    const ops = parseDsl(text)
    expect(ops[0]).toMatchObject({ type: 'card', cardId: 'c1', title: '标题', content: '第一行\n第二行' })
  })

  it('escapes quotes/backslashes/newlines so content stays on one DSL line', () => {
    const text = serializeCanvas([card('c1')], () => ({ content: 'a "q" and \\b\nnl' }))
    expect(text.split('\n').filter((l) => l.includes('[card'))).toHaveLength(1)
    const ops = parseDsl(text)
    expect((ops[0] as { content?: string }).content).toBe('a "q" and \\b\nnl')
  })
})
