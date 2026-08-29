/**
 * 超长防护 round-trip 对称性回归(2026-08-29 P1-1 审计)。
 *
 * 契约:parser 对超长值静默截断(DoS 防护,保留);serialize 侧必须**不 emit**
 * 超过 parse 上限的文本字段(title/text/label/group/compute → DSL_MAX_TEXT_LEN,
 * content → DSL_MAX_CONTENT_LEN,code/quote 条目 → DSL_MAX_CONTENT_LEN)。
 * 否则:DSL 编辑器把 serialize 文本展示给用户 → 用户 Apply → parse 截断 →
 * 截断值经 onCardUpdate 写回 Card.body/title → **原始数据尾部永久丢失**。
 * 跳过 emit 后 parse 得 undefined,写回路径的 `!== undefined` 守卫自然放过。
 *
 * 列表类(tags/links/href/code/quote 条数)两侧同界截断(parse 也是截断),
 * round-trip 稳定,不适用「跳过」。
 */
import { describe, expect, it } from 'vitest'
import { serializeCanvas } from '../canvas-dsl'
import { parseDsl } from '../dsl-parser'
import { DSL_MAX_TEXT_LEN, DSL_MAX_CONTENT_LEN } from '../dsl-grammar'
import type { CanvasElement } from '@cys-stift/canvas-engine'

describe('serialize 侧超长防护 — 文本字段不 emit(防 Apply 写回截断值)', () => {
  it('超长 @content 不 emit → parse 后 undefined → 写回守卫放过', () => {
    const long = 'x'.repeat(DSL_MAX_CONTENT_LEN + 1000)
    const out = serializeCanvas(
      [{ id: 'c1', kind: 'card', x: 0, y: 0, w: 100, h: 80, rotation: 0 }],
      () => ({ title: 't', content: long }),
    )
    expect(out).not.toContain('@content')
    // 短 title 正常 emit(只跳过超长字段,不跳过整卡)
    expect(out).toContain('@title("t")')
    const op = parseDsl(out).find((o) => o.type === 'card') as { content?: string }
    expect(op.content).toBeUndefined()
  })

  it('超长 @title 不 emit;parse 后 undefined', () => {
    const longTitle = 't'.repeat(DSL_MAX_TEXT_LEN + 1)
    const out = serializeCanvas(
      [{ id: 'c1', kind: 'card', x: 0, y: 0, w: 100, h: 80, rotation: 0 }],
      () => ({ title: longTitle, content: 'body' }),
    )
    expect(out).not.toContain('@title')
    expect(out).toContain('@content("body")')
    const op = parseDsl(out).find((o) => o.type === 'card') as { title?: string }
    expect(op.title).toBeUndefined()
  })

  it('超长 text 元素 @text 不 emit', () => {
    const long = 'y'.repeat(DSL_MAX_TEXT_LEN + 50)
    const out = serializeCanvas([{ id: 't1', kind: 'text', x: 0, y: 0, w: 0, h: 0, rotation: 0, text: long }])
    expect(out).not.toContain('@text("')
  })

  it('超长 frame @text 不 emit', () => {
    const long = 'f'.repeat(DSL_MAX_TEXT_LEN + 1)
    const out = serializeCanvas([{ id: 'fr1', kind: 'frame', x: 0, y: 0, w: 100, h: 60, rotation: 0, text: long }])
    expect(out).not.toContain('@text("')
  })

  it('超长 arrow @label 不 emit', () => {
    const long = 'l'.repeat(DSL_MAX_TEXT_LEN + 1)
    const out = serializeCanvas([
      { id: 'a1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'c1', to: 'c2', text: long },
    ])
    expect(out).not.toContain('@label')
  })

  it('超长 @group / @compute 不 emit', () => {
    const long = 'g'.repeat(DSL_MAX_TEXT_LEN + 1)
    const out = serializeCanvas([
      { id: 'r1', kind: 'rect', x: 0, y: 0, w: 10, h: 10, rotation: 0, meta: { group: long } },
      { id: 't1', kind: 'text', x: 0, y: 0, w: 0, h: 0, rotation: 0, text: 'ok', meta: { compute: long } },
    ])
    expect(out).not.toContain('@group')
    expect(out).not.toContain('@compute')
    expect(out).toContain('@text("ok")')
  })

  it('超长 code 块 / quote 条目不 emit;条数超限截到上限(两侧同界)', () => {
    const longCode = 'c'.repeat(DSL_MAX_CONTENT_LEN + 1)
    const out = serializeCanvas(
      [{ id: 'c1', kind: 'card', x: 0, y: 0, w: 100, h: 80, rotation: 0 }],
      () => ({
        title: 't',
        codeSnippets: [
          { language: 'ts', code: longCode },
          { language: 'py', code: 'print(1)' },
        ],
        quotes: [{ text: longCode, attribution: 'a' }],
      }),
    )
    // 超长 code/quote 跳过;合法的保留
    expect(out).not.toContain('@code("c'.slice(0, 8))
    expect(out).toContain('@code(py,"print(1)")')
    expect(out).not.toContain('@quote')
    const op = parseDsl(out).find((o) => o.type === 'card') as { code?: unknown[]; quotes?: unknown[] }
    expect(op.code).toHaveLength(1)
    expect(op.quotes).toBeUndefined()
  })

  it('恰好等于上限的值正常 emit(边界不误伤)', () => {
    const exact = 'e'.repeat(DSL_MAX_TEXT_LEN)
    const out = serializeCanvas(
      [{ id: 'c1', kind: 'card', x: 0, y: 0, w: 100, h: 80, rotation: 0 }],
      () => ({ title: exact }),
    )
    expect(out).toContain('@title("')
    const roundtripped = parseDsl(out).find((o) => o.type === 'card') as { title?: string }
    expect(roundtripped.title).toBe(exact)
  })
})
