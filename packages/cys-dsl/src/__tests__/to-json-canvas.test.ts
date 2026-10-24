import { describe, expect, it } from 'vitest'
import { parseDslWithDiagnostics } from '../dsl-parser'
import { sanitizeDslOps } from '../dsl-sanitize'
import { solveRelational } from '../dsl-relational-solver'
import { toJsonCanvas } from '../to-json-canvas'

describe('toJsonCanvas(card → node)', () => {
  it('全结构化字段落 cys 命名空间;title 上 node.text', () => {
    const { ops } = parseDslWithDiagnostics(
      '[card #a] @pos(10,20) @size(300,150) @color(blue) @title("T") @content("C") @type(note) @tags(x;y) @links(https://e.com) @code(ts,"let a","cap") @group("g") @href(#b)',
    )
    const { canvas, skipped } = toJsonCanvas(ops)
    expect(skipped).toEqual([])
    expect(canvas.edges).toEqual([])
    expect(canvas.nodes).toHaveLength(1)
    const n = canvas.nodes[0]!
    expect(n.id).toBe('a')
    expect(n.type).toBe('text')
    expect(n).toMatchObject({ x: 10, y: 20, width: 300, height: 150, text: 'T' })
    // JSON Canvas 1.0 的 color 只收 "1".."6"/#hex,DSL token 不上 node.color → 保 cys
    expect(n.color).toBeUndefined()
    expect(n.cys).toMatchObject({
      color: 'blue',
      content: 'C',
      cardType: 'note',
      tags: ['x', 'y'],
      links: ['https://e.com'],
      group: 'g',
      href: ['b'],
    })
    expect(n.cys?.code).toEqual([{ language: 'ts', code: 'let a', caption: 'cap' }])
  })

  it('无 @size 时用缺省卡尺寸 240×120(与 apply/solver 同源)', async () => {
    const { JSON_CANVAS_DEFAULT_CARD_W, JSON_CANVAS_DEFAULT_CARD_H } = await import('../to-json-canvas')
    const { ops } = parseDslWithDiagnostics('[card #a] @pos(0,0)')
    const { canvas } = toJsonCanvas(ops)
    expect(canvas.nodes[0]!.width).toBe(JSON_CANVAS_DEFAULT_CARD_W)
    expect(canvas.nodes[0]!.height).toBe(JSON_CANVAS_DEFAULT_CARD_H)
  })
})

describe('toJsonCanvas(solver 集成 + 跳过留痕)', () => {
  it('rel 卡已求解坐标直传;关系箭头成边;rect/自由箭头跳过且按 opIndex 排序', () => {
    const text = [
      '[card #a] @pos(100,100) @size(240,120)',
      '[card #b] right-of #a @gap(20) @title("B")',
      '[arrow #r] from #a to #b @label("L") @dash(dashed) @curve(1,2) @route(curve)',
      '[rect #box] @pos(0,0) @size(50,50)',
      '[arrow #f] @pos(5,5) @size(30,40)',
      '[text #t] @pos(1,2) @text("hi") @compute("#t.w+1")',
    ].join('\n')
    const { ops } = parseDslWithDiagnostics(text)
    const solved = solveRelational(sanitizeDslOps(ops).ops)
    const { canvas, skipped } = toJsonCanvas(solved.ops)

    // rel → 绝对坐标在 solver 已完成,converter 直传
    const b = canvas.nodes.find((n) => n.id === 'b')
    expect(b).toBeDefined()
    expect(b!.x).toBe(360)
    expect(b!.y).toBe(100)

    // 关系箭头 → edge;几何修饰(curve/route/dash)保 cys 不丢
    expect(canvas.edges).toHaveLength(1)
    expect(canvas.edges[0]).toMatchObject({ id: 'r', fromNode: 'a', toNode: 'b', label: 'L' })
    expect(canvas.edges[0]!.cys).toMatchObject({ dash: 'dashed', curve: { cx: 1, cy: 2 }, route: 'curve' })

    // text 自由元素 → node;compute 保 cys
    const t = canvas.nodes.find((n) => n.id === 't')
    expect(t).toBeDefined()
    expect(t!.text).toBe('hi')
    expect(t!.cys).toMatchObject({ compute: '#t.w+1' })

    // rect / 自由箭头跳过,理由留痕,按 opIndex 升序
    expect(skipped.map((s) => s.op)).toEqual(['rect', 'arrow'])
    expect(skipped[0]!.opIndex).toBe(3)
    expect(skipped[1]!.reason).toContain('端点')
  })

  it('前向引用可解析;箭头指向被跳过元素 → 边随之跳过', () => {
    const text = [
      '[arrow #r] from #a to #b',
      '[card #a] @pos(0,0)',
      '[card #b] @pos(1,1)',
      '[arrow #r2] from #a to #box',
      '[rect #box] @pos(1,1) @size(9,9)',
    ].join('\n')
    const { ops } = parseDslWithDiagnostics(text)
    const { canvas, skipped } = toJsonCanvas(ops)
    // 箭头行写在目标 card 行之前,前向引用仍可解析
    expect(canvas.edges.map((e) => e.id)).toEqual(['r'])
    expect(skipped.map((s) => s.op)).toEqual(['arrow', 'rect'])
    expect(skipped[0]!.reason).toContain('#box')
  })
})
