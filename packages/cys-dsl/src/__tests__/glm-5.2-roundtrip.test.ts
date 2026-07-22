import { describe, expect, it } from 'vitest'
import type { CanvasElement } from '@cys-stift/canvas-engine'
import { serializeCanvas, serializeCanvasReadable, serializeElement } from '../canvas-dsl'
import { parseDsl } from '../dsl-parser'

/**
 * glm-5.2 独立交叉验证 —— 转义核心卖点之一:**完整文字化(无损往返)**。
 *
 * 独立角度:不按 case 罗列,而是把"整张画布压成一段文本、文本能重建画布"作为一条
 * 端到端承诺来锁。重点放在确定性、幂等性、转义逆性质 —— 这些是"AI 可信赖地读写"
 * 的地基,而非单点字段。
 */
describe('glm-5.2 round-trip —— 完整文字化承诺', () => {
  // 一张"厨房水槽"画布:6 个 active kind 全上,带 v5 内容、CJK、emoji、引号、反斜杠、负坐标。
  const kitchenSink: CanvasElement[] = [
    {
      id: 'card:one',
      kind: 'card',
      x: 12.5,
      y: -40,
      w: 240,
      h: 120,
      rotation: 0,
      color: 'blue',
    },
    {
      id: 'rect:box',
      kind: 'rect',
      x: 0,
      y: 0,
      w: 300,
      h: 180,
      rotation: 0,
      color: 'red',
    },
    {
      id: 'text:note',
      kind: 'text',
      x: 5,
      y: 6,
      w: 0,
      h: 0,
      rotation: 0,
      text: '浮标 "A" & C:\\path',
      color: 'black',
    },
    {
      id: 'frame:group',
      kind: 'frame',
      x: -100,
      y: 200,
      w: 400,
      h: 300,
      rotation: 0,
      text: '分区 😀',
      color: 'yellow',
    },
    {
      id: 'arrow:rel',
      kind: 'arrow',
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      rotation: 0,
      from: 'card:one',
      to: 'rect:box',
      text: '引用 "关系"',
      color: 'red',
      dash: 'dashed',
      arrowhead: 'triangle',
    },
    // 自由箭头:w/h 负值编码方向(round-trip 必须保留负号)。
    {
      id: 'arrow:free',
      kind: 'arrow',
      x: 10,
      y: 20,
      w: 100,
      h: -50,
      rotation: 0,
      dash: 'solid',
      arrowhead: 'arrow',
    },
  ]

  const resolve = (id: string) =>
    id === 'card:one'
      ? { title: '标题 "引号" 与 \\反斜杠', content: '第一行\n第二行\n- 列表项\n```\ncode\n```' }
      : undefined

  it('整张画布 serialize → parse 后,所有 active kind 字段深度相等(含 v5 内容)', () => {
    const text = serializeCanvas(kitchenSink, resolve)
    const ops = parseDsl(text)

    // 6 个元素全部解析回来(freedraw 不在本画布;6 个 active kind 全在)。
    expect(ops).toHaveLength(6)

    const card = ops.find((o) => o.type === 'card')!
    expect(card).toMatchObject({
      type: 'card',
      cardId: 'card:one',
      x: 12.5,
      y: -40,
      w: 240,
      h: 120,
      color: 'blue',
      title: '标题 "引号" 与 \\反斜杠',
      content: '第一行\n第二行\n- 列表项\n```\ncode\n```',
    })

    const rect = ops.find((o) => o.type === 'free' && o.shape === 'rect')!
    expect(rect).toMatchObject({ id: 'rect:box', x: 0, y: 0, w: 300, h: 180, color: 'red' })

    const textEl = ops.find((o) => o.type === 'free' && o.shape === 'text')!
    expect(textEl).toMatchObject({ id: 'text:note', text: '浮标 "A" & C:\\path', color: 'black' })

    const frame = ops.find((o) => o.type === 'free' && o.shape === 'frame')!
    expect(frame).toMatchObject({ id: 'frame:group', x: -100, y: 200, w: 400, h: 300, text: '分区 😀', color: 'yellow' })

    const rel = ops.find((o) => o.type === 'arrow' && !o.freeArrow)!
    expect(rel).toMatchObject({
      id: 'arrow:rel',
      from: 'card:one',
      to: 'rect:box',
      label: '引用 "关系"',
      color: 'red',
      dash: 'dashed',
      arrowhead: 'triangle',
    })

    const free = ops.find((o) => o.type === 'arrow' && o.freeArrow)!
    expect(free).toMatchObject({ id: 'arrow:free', x: 10, y: 20, w: 100, h: -50, dash: 'solid', arrowhead: 'arrow' })
  })

  it('serialize 是确定性的:同一输入两次调用产出 byte-equal 文本', () => {
    const a = serializeCanvas(kitchenSink, resolve)
    const b = serializeCanvas(kitchenSink, resolve)
    expect(a).toBe(b)
  })

  it('round-trip 幂等:parse(serialize(parse(serialize(x)))) === parse(serialize(x))', () => {
    const once = serializeCanvas(kitchenSink, resolve)
    const parsedOnce = parseDsl(once)
    // 二次:从 ops 重建画布元素再 serialize。用 serializeElement 逐个还原文本。
    const rebuiltElements: CanvasElement[] = parsedOnce.map((op) => opToElement(op))
    const twice = serializeCanvas(
      rebuiltElements,
      (id) => {
        const op = parsedOnce.find((o) => 'cardId' in o && o.cardId === id) as
          | { title?: string; content?: string }
          | undefined
        return op
      },
    )
    // 两次的 parse 结果应深度相等(文本可能因字段顺序略有差异,但语义 round-trip 稳定)。
    expect(parseDsl(twice)).toEqual(parsedOnce)
  })

  it('转义逆性质:对任意含特殊字符的 content,serialize→parse 还原原值', () => {
    // 覆盖 \ " \n 及其组合(顺序敏感:escape 先 \ 后 " 后 \n)。
    const tricky = ['a\\b', 'a"b', 'a\nb', 'a\\n b', 'a\\"b', '\\n"\\"', 'C:\\资料\\草稿\n"续"']
    for (const s of tricky) {
      const card: CanvasElement = { id: 'c', kind: 'card', x: 0, y: 0, w: 1, h: 1, rotation: 0 }
      const text = serializeCanvas([card], () => ({ content: s }))
      const parsed = parseDsl(text)[0] as { content?: string }
      expect(parsed.content, `content round-trip failed for ${JSON.stringify(s)}`).toBe(s)
    }
  })

  it('serializeCanvasReadable 与 serializeCanvas 当前 byte-equal(人读视图契约)', () => {
    expect(serializeCanvasReadable(kitchenSink, resolve)).toBe(serializeCanvas(kitchenSink, resolve))
  })

  it('serializeElement 对 card 缺 resolve 时退化为几何-only(v4 等价)', () => {
    const card = kitchenSink[0]!
    const out = serializeElement(card, undefined)
    expect(out).not.toContain('@title')
    expect(out).not.toContain('@content')
    expect(out).toContain('[card #card:one]')
  })
})

/** 测试辅助:把 DslOp 粗略还原成 CanvasElement(用于幂等性二次 serialize)。
 *  只覆盖 round-trip 测试里出现的 kind,字段映射对齐 serializeElement 的读取。 */
function opToElement(op: import('../dsl-parser').DslOp): CanvasElement {
  const base = { rotation: 0 } as CanvasElement
  switch (op.type) {
    case 'card':
      return { ...base, id: String(op.cardId), kind: 'card', x: op.x, y: op.y, w: op.w ?? 0, h: op.h ?? 0, color: op.color }
    case 'free': {
      const common = { ...base, id: op.id ?? '', kind: op.shape, x: op.x, y: op.y, w: op.w ?? 0, h: op.h ?? 0, color: op.color }
      if ('text' in op && op.text !== undefined) (common as CanvasElement).text = op.text
      return common
    }
    case 'arrow': {
      if (op.freeArrow) {
        return { ...base, id: op.id ?? '', kind: 'arrow', x: op.x ?? 0, y: op.y ?? 0, w: op.w ?? 0, h: op.h ?? 0, text: op.label, color: op.color, dash: op.dash, arrowhead: op.arrowhead }
      }
      return { ...base, id: op.id ?? '', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, from: op.from, to: op.to, text: op.label, color: op.color, dash: op.dash, arrowhead: op.arrowhead }
    }
  }
}
