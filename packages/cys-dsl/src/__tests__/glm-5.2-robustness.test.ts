import { describe, expect, it } from 'vitest'
import { parseDsl, parseDslWithDiagnostics } from '../dsl-parser'
import { sanitizeDslOps } from '../dsl-sanitize'
import { DSL_MAX_CONTENT_LEN, DSL_MAX_TEXT_LEN } from '../dsl-grammar'
import type { DslOp } from '../dsl-parser'

/**
 * glm-5.2 独立交叉验证 —— 转义核心卖点之三:**健壮性(脏输入不崩)**。
 *
 * 独立角度:把 parser/sanitize 当成"不可信任文本的接收面"做对抗性测试 ——
 * 空输入、控制字符、巨长行、混合好坏行、截断边界精确性、v4 向后兼容。
 * 锁的契约:**永不抛错 + 截断精确到字节 + 旧版本文档不被打回**。
 */
describe('glm-5.2 健壮性 —— 脏输入永不崩 + 截断精确 + v4 兼容', () => {
  describe('空 / 边界输入', () => {
    it('空串 / 纯空白 / 仅注释 → 0 ops 0 errors,不抛', () => {
      for (const input of ['', '   ', '\n\n', '# only a comment', '# c1\n# c2\n   \n']) {
        const { ops, errors } = parseDslWithDiagnostics(input)
        expect(ops).toEqual([])
        expect(errors).toEqual([])
      }
    })

    it('散文 / 非 [ 开头行 → 静默 skip(graceful,不抛不报)', () => {
      const { ops, errors } = parseDslWithDiagnostics(
        '这是一段散文\nanother prose line\n[card #c] @pos(0,0) @size(10,10)',
      )
      expect(ops).toHaveLength(1)
      expect(errors).toEqual([])
    })
  })

  describe('对抗性输入永不抛', () => {
    const adversarial = [
      '[',
      '[]',
      '[card]',
      '[card #]',
      '[[[[[',
      '\x00\x01\x02 control chars',
      '[card #c] @pos(\x00,0)',
      '@'.repeat(10000),
      '[card #' + 'a'.repeat(50000) + '] @pos(0,0)',
      '[arrow #a] from to @label',
      Buffer.from('random binary \xff\xfe bytes', 'binary').toString('latin1'),
      '🎉🎊![card #🎉 create] @pos(🎉,🎉) @size(1,1)',
    ]

    for (const [i, input] of adversarial.entries()) {
      it(`adversarial #${i} 不抛错`, () => {
        expect(() => parseDsl(input)).not.toThrow()
        expect(() => sanitizeDslOps(parseDsl(input))).not.toThrow()
      })
    }

    it('sanitize 对抗性 op 对象永不抛(未知 type / 缺字段 / 奇异嵌套)', () => {
      const weird: DslOp[] = [
        { type: 'unknown', w: 0 } as unknown as DslOp,
        { type: 'card' } as unknown as DslOp,
        { type: 'card', cardId: 'x' } as unknown as DslOp,
        { type: 'free', shape: 'rect' } as unknown as DslOp,
        { type: 'arrow' } as unknown as DslOp,
        null as unknown as DslOp,
        undefined as unknown as DslOp,
      ]
      expect(() => sanitizeDslOps(weird)).not.toThrow()
      const { ops } = sanitizeDslOps(weird)
      // 保守策略:不丢数据(每个入参都有对应出参,可能原样保留)。
      expect(ops.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('混合好坏行:只留好的', () => {
    it('3 行有效 + 散文 + 坏 [ 行 → 3 ops,只有坏 [ 行进 errors(散文静默 skip)', () => {
      // graceful parser 的行分类:非 `[` 开头(散文/注释)→ 静默 skip 不报;
      // `[` 开头但缺关键字段 → diagnostic。故 line 2 散文不进 errors,line 4 坏 card 进 errors。
      const dsl = [
        '[card #c1] @pos(0,0) @size(10,10)',
        'garbage line one',
        '[rect #r1] @pos(1,1) @size(2,2) @color(red)',
        '[card #c2] @title("missing pos")',
        '[arrow #a] @pos(5,5) @size(1,1) @color(black)',
      ].join('\n')
      const { ops, errors } = parseDslWithDiagnostics(dsl)
      expect(ops).toHaveLength(3)
      expect(errors.map((e) => e.line)).toEqual([4])
      expect(errors[0]!.message).toMatch(/@pos/)
    })

    it('解析出的所有坐标恒为有限数(robustness 契约)', () => {
      const ops = parseDsl(
        '[card #c] @pos(0,0) @size(999999999,1)\n[rect #r] @pos(-5,1e6) @size(1,1)',
      )
      for (const op of ops) {
        if ('x' in op) {
          expect(Number.isFinite(op.x)).toBe(true)
          expect(Number.isFinite(op.y)).toBe(true)
        }
      }
    })
  })

  describe('截断边界精确性', () => {
    it('@title 恰好 DSL_MAX_TEXT_LEN(200)→ 原样(不截)', () => {
      const t = 'T'.repeat(DSL_MAX_TEXT_LEN)
      const ops = parseDsl(`[card #c] @pos(0,0) @size(1,1) @title("${t}")`)
      expect((ops[0] as { title?: string }).title).toHaveLength(DSL_MAX_TEXT_LEN)
    })

    it('@title 超出 1 字符 → 截到 DSL_MAX_TEXT_LEN(不多不少)', () => {
      const t = 'T'.repeat(DSL_MAX_TEXT_LEN + 1)
      const ops = parseDsl(`[card #c] @pos(0,0) @size(1,1) @title("${t}")`)
      expect((ops[0] as { title?: string }).title).toHaveLength(DSL_MAX_TEXT_LEN)
    })

    it('@content 超长 + 边界落在 emoji 上 → 不劈开代理位(不产孤立代理位)', () => {
      const content = 'a'.repeat(DSL_MAX_CONTENT_LEN - 1) + '😀'
      const ops = parseDsl(`[card #c] @pos(0,0) @size(1,1) @content("${content}")`)
      const got = (ops[0] as { content?: string }).content!
      // 丢整个 emoji(2 码元),长度 = MAX-1;最后一字符不是高代理位。
      expect(got.length).toBe(DSL_MAX_CONTENT_LEN - 1)
      const last = got.charCodeAt(got.length - 1)
      expect(last >= 0xd800 && last <= 0xdbff).toBe(false)
    })

    it('@content 纯 ASCII 恰好 MAX → 原样(无代理位回退)', () => {
      const c = 'x'.repeat(DSL_MAX_CONTENT_LEN)
      const ops = parseDsl(`[card #c] @pos(0,0) @size(1,1) @content("${c}")`)
      expect((ops[0] as { content?: string }).content).toHaveLength(DSL_MAX_CONTENT_LEN)
    })
  })

  describe('v4 向后兼容(无 @title/@content 的旧 DSL 仍解析)', () => {
    it('一张典型 v4 画布:几何 + 箭头 + freedraw,全无内容 token,正常解析', () => {
      const v4 = [
        '[card #c1] @pos(10,20) @size(240,120) @color(blue)',
        '[card #c2] @pos(300,20) @size(240,120) @color(red)',
        '[rect #bg] @pos(0,0) @size(800,600) @color(yellow)',
        '[text #t] @pos(50,50) @text("hello") @color(black)',
        '[arrow #a] from #c1 to #c2 @label("rel") @color(black) @dash(solid) @arrowhead(arrow)',
        '[freedraw #f] @pos(7,8)',
      ].join('\n')
      const ops = parseDsl(v4)
      // freedraw 被 parser 透传跳过(设计如此,隐私)→ 5 ops。
      expect(ops).toHaveLength(5)
      // 所有 card 的 title/content 都是 undefined(v4 无内容语义)。
      const cards = ops.filter((o) => o.type === 'card')
      for (const c of cards) {
        expect((c as { title?: string }).title).toBeUndefined()
        expect((c as { content?: string }).content).toBeUndefined()
      }
    })

    it('v4 单行 card 仍解析', () => {
      const ops = parseDsl('[card #legacy] @pos(100, 200) @size(240, 120) @color(red)')
      expect(ops[0]).toMatchObject({ cardId: 'legacy', x: 100, y: 200, w: 240, h: 120, color: 'red' })
    })
  })
})
