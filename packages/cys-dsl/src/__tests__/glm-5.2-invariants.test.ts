import { describe, expect, it } from 'vitest'
import type { CanvasElement } from '@cys-stift/canvas-engine'
import {
  DSL_VERSION,
  DSL_KINDS,
  DSL_COLORS,
  DSL_COLOR_ALIASES,
  DSL_MAX_TEXT_LEN,
  DSL_MAX_CONTENT_LEN,
  DSL_GRAMMAR_REFERENCE,
  truncateDslText,
} from '../dsl-grammar'
import { serializeCanvas } from '../canvas-dsl'
import { parseDsl } from '../dsl-parser'

/**
 * glm-5.2 独立交叉验证 —— 锁定不变量与设计契约。
 *
 * 独立角度:这些是"转义作为卖点"的**底层不变量** —— 版本/种类/颜色枚举、隐私边界
 * (freedraw 点序列永不进文本)、legacy 形状永不序列化、grammar 单一源文档完整。
 * 任一被破坏 = 卖点崩。集中锁一处。
 */
describe('glm-5.2 不变量 —— 版本/枚举/隐私/单一源', () => {
  describe('grammar 单一源常量', () => {
    it('DSL_VERSION === 5(v5 加 @title/@content)', () => {
      expect(DSL_VERSION).toBe(5)
    })

    it('DSL_KINDS 恰好 5 个 active kind(freedraw 出 DSL,顺序锁定)', () => {
      expect([...DSL_KINDS]).toEqual(['card', 'rect', 'frame', 'text', 'arrow'])
    })

    it('DSL_COLORS 是 Bauhaus 6 token(顺序锁定)', () => {
      expect([...DSL_COLORS]).toEqual(['red', 'yellow', 'blue', 'black', 'white', 'gray'])
    })

    it('DSL_COLOR_ALIASES:grey → gray(唯一别名)', () => {
      expect(DSL_COLOR_ALIASES).toEqual({ grey: 'gray' })
    })

    it('长度上限:int 级 200 / long 级 8000', () => {
      expect(DSL_MAX_TEXT_LEN).toBe(200)
      expect(DSL_MAX_CONTENT_LEN).toBe(8000)
    })
  })

  describe('truncateDslText 代理对安全', () => {
    it('短串原样', () => {
      expect(truncateDslText('abc', 10)).toBe('abc')
      expect(truncateDslText('abc', 3)).toBe('abc')
    })

    it('max=0 → 空串(不抛)', () => {
      expect(truncateDslText('abc', 0)).toBe('')
    })

    it('空串安全', () => {
      expect(truncateDslText('', 5)).toBe('')
    })

    it('切点落在高代理位 → 回退一位(不产孤立代理位)', () => {
      // 'a' + emoji(2 码元),max=2:charCodeAt(1)=高代理位 → 回退到 1 → 'a'。
      const out = truncateDslText('a😀', 2)
      expect(out).toBe('a')
      const last = out.charCodeAt(out.length - 1)
      expect(last >= 0xd800 && last <= 0xdbff).toBe(false)
    })

    it('max 恰好切在 emoji 之后(不回退)', () => {
      // 'a' + emoji(2 码元),max=3:charCodeAt(2)=低代理位(非高)→ 不回退 → 含完整 emoji。
      const out = truncateDslText('a😀', 3)
      expect(out).toBe('a😀')
    })
  })

  describe('隐私不变量:freedraw 永不进文本(已出 DSL,程序自管)', () => {
    const freedraw: CanvasElement = {
      id: 'f1',
      kind: 'freedraw',
      x: 7,
      y: 8,
      w: 0,
      h: 0,
      rotation: 0,
      meta: { segments: [{ points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }] },
    }

    it('serialize 整元素被丢(连位置都不进 text;程序自管 R2)', () => {
      const text = serializeCanvas([freedraw])
      expect(text).toBe('')
      expect(text).not.toContain('[freedraw')
      expect(text).not.toContain('points')
      expect(text).not.toContain('segments')
      expect(text).not.toContain('7.0,8.0')
    })

    it('parse 不还原 freedraw(serialize 根本不产 freedraw 行;隐私 = 单向)', () => {
      const ops = parseDsl(serializeCanvas([freedraw]))
      expect(ops).toHaveLength(0)
    })
  })

  describe('legacy 形状永不序列化', () => {
    it('ellipse/line/note/image 被 serializeCanvas 全部跳过(空输出)', () => {
      const legacy: CanvasElement[] = [
        { id: 'e1', kind: 'ellipse', x: 0, y: 0, w: 1, h: 1, rotation: 0 },
        { id: 'l1', kind: 'line', x: 0, y: 0, w: 1, h: 1, rotation: 0 },
        { id: 'n1', kind: 'note', x: 0, y: 0, w: 1, h: 1, rotation: 0 },
        { id: 'i1', kind: 'image', x: 0, y: 0, w: 1, h: 1, rotation: 0 },
      ]
      expect(serializeCanvas(legacy)).toBe('')
    })
  })

  describe('grammar 单一源文档完整(GRAMMAR_REFERENCE)', () => {
    it('含版号行 v5', () => {
      expect(DSL_GRAMMAR_REFERENCE).toContain('v5')
    })

    it('含 @title/@content 说明(v5 新增)', () => {
      expect(DSL_GRAMMAR_REFERENCE).toContain('@title')
      expect(DSL_GRAMMAR_REFERENCE).toContain('@content')
    })

    it('含转义说明: \\\\ \\" \\n', () => {
      // escape 规则必须在文档里(AI 照此写)。
      expect(DSL_GRAMMAR_REFERENCE).toMatch(/\\\\/)
      expect(DSL_GRAMMAR_REFERENCE).toContain('\\n')
    })

    it('含关系式放置(right-of / below)', () => {
      expect(DSL_GRAMMAR_REFERENCE).toContain('right-of')
      expect(DSL_GRAMMAR_REFERENCE).toContain('below')
    })

    it('故意不含 [freedraw #id](AI 不该产手绘)', () => {
      expect(DSL_GRAMMAR_REFERENCE).not.toContain('[freedraw')
    })
  })

  describe('parseDsl 永不抛错契约(字符串对抗性 battery)', () => {
    // 契约范围:**任意字符串**输入永不抛(语法兜底 + finiteNum 守卫)。
    // 注意:非字符串运行时入参(null/undefined/number)不在契约内 —— TS 类型层已挡,
    // 运行时传非字符串会抛 TypeError(dslText.split is not a function)。这是设计如此,
    // 不是 bug —— 见下方"非字符串入参抛 TypeError"小节锁定该行为。
    const battery = [
      '',
      '\n'.repeat(100),
      '[card #c] @pos(0,0)' + ' @size(1,1)'.repeat(1000),
      '{}{"json": true}',
      '<html>not dsl</html>',
      '正常中文混 [card #c] @pos(0,0) @size(1,1) emoji 🎉',
      '\x00\x01\x02控制字符',
      '['.repeat(500),
      '[card #' + 'a'.repeat(10000) + '] @pos(0,0)',
    ]
    for (const [i, input] of battery.entries()) {
      it(`string never-throws #${i}`, () => {
        expect(() => parseDsl(input)).not.toThrow()
      })
    }
  })

  describe('parseDsl 非字符串入参 → 抛 TypeError(锁定:契约仅覆盖 string)', () => {
    // 锁定现状:robustness 契约是 string-scoped。非字符串是 TS 类型错误,运行时传会抛。
    // 若未来加 coercion(String(dslText ?? ''))让这组测试失败 → 当时是有意改契约。
    const nonStrings = [null, undefined, 12345, {}, []]
    for (const [i, input] of nonStrings.entries()) {
      it(`non-string #${i} 抛 TypeError`, () => {
        expect(() =>
          // @ts-expect-error — 故意传非字符串,验证抛 TypeError 而非被静默吞
          parseDsl(input),
        ).toThrow(TypeError)
      })
    }
  })
})
