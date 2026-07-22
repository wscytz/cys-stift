import { describe, expect, it } from 'vitest'
import type { CanvasElement } from '@cys-stift/canvas-engine'
import { serializeCanvas } from '../canvas-dsl'
import { parseDsl, parseDslWithDiagnostics } from '../dsl-parser'
import { DSL_MAX_CONTENT_LEN } from '../dsl-grammar'

/**
 * glm-5.2 独立交叉验证 —— v5 卡片内容(@title 短 / @content 长 markdown)专项。
 *
 * 独立角度:把 @content 当成"一段真实 markdown body 经一条 DSL 行传输"来压测 ——
 * 富文本(标题/列表/代码块/引用)、emoji、字面反斜杠、纯换行、已知局限(无法经 DSL 清空)。
 * 这是 v5 把卡片内容纳入转义后最易出边界的地方。
 */
describe('glm-5.2 v5 内容 —— @title/@content 富文本与边界', () => {
  const card = (id: string): CanvasElement => ({ id, kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })

  describe('@content 富 markdown 往返', () => {
    it('多段 + 列表 + 代码块 + 引用,\\n 在 apply 前还原为真实换行', () => {
      const body = '## 标题\n\n第一段正文。\n\n- 项一\n- 项二\n\n```\ncode block\n```\n\n> 引用块'
      const text = serializeCanvas([card('c1')], () => ({ content: body }))
      // 序列化后整个 content 仍在一条 DSL 行上(\n 被转义)。
      const cardLines = text.split('\n').filter((l) => l.includes('[card'))
      expect(cardLines).toHaveLength(1)
      const ops = parseDsl(text)
      expect((ops[0] as { content?: string }).content).toBe(body)
    })

    it('content 内含引号与反斜杠(C:\\path 与 "q")经转义往返无损', () => {
      const body = '路径 C:\\Users\\doc 和 "引号" 与 \\n 字面'
      const text = serializeCanvas([card('c1')], () => ({ content: body }))
      const ops = parseDsl(text)
      expect((ops[0] as { content?: string }).content).toBe(body)
    })

    it('content 内含 emoji 与 CJK 混排往返无损', () => {
      const body = '标题 🎯🎊\n中文与 emoji 😀 混排\nטֶקסט // mixed scripts'
      const ops = parseDsl(serializeCanvas([card('c1')], () => ({ content: body })))
      expect((ops[0] as { content?: string }).content).toBe(body)
    })

    it('content 全是换行(极端)往返无损', () => {
      const body = '\n\n\n\n'
      const ops = parseDsl(serializeCanvas([card('c1')], () => ({ content: body })))
      expect((ops[0] as { content?: string }).content).toBe(body)
    })
  })

  describe('@title 边界', () => {
    it('title 含 emoji 与 CJK 往返', () => {
      const ops = parseDsl(serializeCanvas([card('c1')], () => ({ title: '标题 🎯' })))
      expect((ops[0] as { title?: string }).title).toBe('标题 🎯')
    })

    it('title + content 同时存在(round-trip 双字段)', () => {
      const ops = parseDsl(
        serializeCanvas([card('c1')], () => ({ title: 'T', content: 'B' })),
      )
      expect(ops[0]).toMatchObject({ title: 'T', content: 'B' })
    })
  })

  describe('字面反斜杠 + n(两字符,非换行)不被误解码', () => {
    it('内容是字面 a\\nb(4 字符)→ round-trip 保持字面', () => {
      // escapeQuoted 先把 \ 转 \\;parse 的 unescapeQuoted 把 \\ 还原成 \、n 原样 → 仍是字面 a\nb。
      const literal = 'a\\nb'
      const ops = parseDsl(serializeCanvas([card('c1')], () => ({ content: literal })))
      expect((ops[0] as { content?: string }).content).toBe('a\\nb')
      expect((ops[0] as { content?: string }).content).not.toBe('a\nb')
    })
  })

  describe('已知局限锁定(防止"修复"后破坏叙事一致性)', () => {
    it('LIMIT:空 title/content 不被序列化 → DSL 无法表达"清空内容"', () => {
      const text = serializeCanvas([card('c1')], () => ({ title: '', content: '' }))
      expect(text).not.toContain('@title')
      expect(text).not.toContain('@content')
    })

    it('LIMIT:card 行缺 @pos 被丢 → 无"纯内容编辑"(内容编辑耦合几何)', () => {
      const { ops, errors } = parseDslWithDiagnostics('[card #c1] @title("only content")')
      expect(ops).toHaveLength(0)
      expect(errors[0]?.message).toMatch(/@pos/)
    })

    it('LIMIT:resolve 返回 undefined 时不 emit 内容 token(几何-only)', () => {
      const text = serializeCanvas([card('c1')], () => undefined)
      expect(text).not.toContain('@title')
      expect(text).not.toContain('@content')
    })
  })

  describe('parse 侧单行 @content 长内容', () => {
    it('超长 @content 边界:恰好 MAX 不截,MAX+1 截到 MAX', () => {
      const exact = 'x'.repeat(DSL_MAX_CONTENT_LEN)
      const over = 'x'.repeat(DSL_MAX_CONTENT_LEN + 1)
      const a = parseDsl(`[card #c] @pos(0,0) @size(1,1) @content("${exact}")`)
      expect((a[0] as { content?: string }).content).toHaveLength(DSL_MAX_CONTENT_LEN)
      const b = parseDsl(`[card #c] @pos(0,0) @size(1,1) @content("${over}")`)
      expect((b[0] as { content?: string }).content).toHaveLength(DSL_MAX_CONTENT_LEN)
    })
  })
})
