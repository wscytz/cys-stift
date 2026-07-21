import { describe, expect, it } from 'vitest'
import type { CanvasElement } from '@cys-stift/canvas-engine'
import { parseDsl, parseDslWithDiagnostics } from '../dsl-parser'
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

describe('cys-dsl v5 边界与已知局限(锁定现状)', () => {
  const card = (id: string): CanvasElement => ({ id, kind: 'card', x: 10, y: 20, w: 100, h: 80, rotation: 0 })

  it('字面反斜杠+n(两字符,非换行)round-trip 不被误解码成换行', () => {
    // 内容是字面 a\nb(a \ n b,4 字符)。serialize 先把 \ 转 \\,parse 把 \\ 还原成 \、n 原样。
    const literal = 'a\\nb'
    const text = serializeCanvas([card('c1')], () => ({ content: literal }))
    const ops = parseDsl(text)
    expect((ops[0] as { content?: string }).content).toBe('a\\nb')
  })

  it('截断不劈开 emoji 代理对(@content 超长,边界落在 emoji 中间)', () => {
    const content = 'a'.repeat(DSL_MAX_CONTENT_LEN - 1) + '😀' // 8001 码元
    const ops = parseDsl(`[card #c1] @pos(0,0) @size(10,10) @content("${content}")`)
    const got = (ops[0] as { content?: string }).content!
    expect(got.length).toBe(DSL_MAX_CONTENT_LEN - 1) // 丢整个 emoji,不产孤立代理位
    const last = got.charCodeAt(got.length - 1)
    expect(last >= 0xd800 && last <= 0xdbff).toBe(false)
  })

  it('KNOWN LIMITATION (D): 空 title/content 不被序列化 → DSL 无法表达"清空内容"', () => {
    // serialize 用真值判断,空串被跳过;parse/apply 也无"设为空"语义。
    // 内容只能加/改,不能经 DSL 清空。挂到 content-assist 项目(见 README 已知局限)。
    const text = serializeCanvas([card('c1')], () => ({ title: '', content: '' }))
    expect(text).not.toContain('@title')
    expect(text).not.toContain('@content')
  })

  it('KNOWN LIMITATION (E): card 行缺 @pos 被丢 → 无"纯内容编辑"', () => {
    // buildCard 要求 @pos;只给 @title 的行产 diagnostic、0 ops。改内容必须重抄坐标(耦合几何)。
    // 挂到 content-assist 项目(见 README 已知局限)。
    const { ops, errors } = parseDslWithDiagnostics('[card #c1] @title("only")')
    expect(ops).toHaveLength(0)
    expect(errors[0]?.message).toContain('@pos')
  })
})
