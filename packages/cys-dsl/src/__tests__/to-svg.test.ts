import { describe, expect, it } from 'vitest'
import { parseDsl } from '../dsl-parser'
import { sanitizeDslOps } from '../dsl-sanitize'
import { solveRelational } from '../dsl-relational-solver'
import { toSvg } from '../to-svg'

/** CLI render --svg 的底层:ops → 独立 SVG(预览级)。 */
function solve(text: string) {
  return solveRelational(sanitizeDslOps(parseDsl(text)).ops).ops
}

describe('toSvg', () => {
  it('卡片 + 直线箭头:端点解析、色映射、箭头头部', () => {
    const { svg, skipped } = toSvg(
      solve('[card #a create] @pos(0,0) @size(200,100) @color(red) @title("起")\n[card #b create] right-of #a @title("终")\n[arrow #e1] from #a to #b'),
    )
    expect(skipped).toEqual([])
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"')
    // red → 设计 token 实值
    expect(svg).toContain('stroke="#b51b17"')
    expect(svg).toContain('起')
    expect(svg).toContain('终')
    // 箭头贴边:线起点 x ≥ 卡 a 右缘 - 1
    const m = /M ([\d.]+) ([\d.]+) L/.exec(svg)
    expect(m).not.toBeNull()
    expect(Number(m![1])).toBeGreaterThanOrEqual(200 - 1)
    // 默认 arrowhead = 开口 V(polyline)
    expect(svg).toContain('<polyline')
  })

  it('端点缺失 → 跳过并留原因,不产悬空线', () => {
    const { svg, skipped } = toSvg(solve('[card #a create] @pos(0,0)\n[arrow #e1] from #a to #ghost'))
    expect(skipped).toHaveLength(1)
    expect(skipped[0]!.reason).toContain('#ghost')
    expect(svg).not.toContain('<path')
  })

  it('文本逃逸:内容里的 XML 特殊字符不破结构', () => {
    const { svg } = toSvg(solve('[card #a create] @pos(0,0) @content("a <b> & \\"c\\"")'))
    expect(svg).toContain('a &lt;b&gt; &amp; &quot;c&quot;')
    expect(svg).not.toContain('a <b>')
  })

  it('curve / elbow / dash / label / triangle 全路由', () => {
    const { svg, skipped } = toSvg(
      solve(
        [
          '[card #a create] @pos(0,0) @size(100,80)',
          '[card #b create] @pos(400,0) @size(100,80)',
          '[card #c create] @pos(0,300) @size(100,80)',
          '[card #d create] @pos(400,300) @size(100,80)',
          '[card #e create] @pos(0,600) @size(100,80)',
          '[card #f create] @pos(400,600) @size(100,80)',
          '[arrow #e1] from #a to #b @route(curve) @curve(250,-60) @label("弯")',
          '[arrow #e2] from #c to #d @route(elbow) @elbow(250,340;250,380) @dash(dashed) @arrowhead(triangle)',
          '[arrow #e3] from #e to #f @arrowhead(none)',
        ].join('\n'),
      ),
    )
    expect(skipped).toEqual([])
    expect(svg).toContain('Q 250 -60')
    expect(svg).toContain('L 250 340 L 250 380')
    expect(svg).toContain('stroke-dasharray="8 6"')
    expect(svg).toContain('<polygon')
    expect(svg).toContain('弯')
    // e3:无箭头头部 → 无 polyline/polygon 于该段(整体仍含 e2 的 polygon,查不出错即可)
  })

  it('自由箭头走 bbox 对角线;rect/frame/text 各得其所', () => {
    const { svg, skipped } = toSvg(
      solve(
        [
          '[rect #r] @pos(0,0) @size(120,80) @color(blue)',
          '[frame #fr] @pos(0,200) @size(400,300) @text("框")',
          '[text #t] @pos(500,0) @text("注 =#r.w")',
          '[arrow #fa] @pos(120,40) @size(80,40)',
        ].join('\n'),
      ),
    )
    expect(skipped).toEqual([])
    expect(svg).toContain('stroke="#006480"')
    expect(svg).toContain('框')
    expect(svg).toContain('注 =#r.w')
    // 自由箭头对角线存在
    expect(svg).toMatch(/M 120 40 L 200 80/)
  })

  it('空输入 → 极小空画布,不崩', () => {
    const { svg, skipped } = toSvg([])
    expect(skipped).toEqual([])
    expect(svg).toContain('<svg')
  })

  it('内容超 3 行截断省略号', () => {
    const long = '很长的内容'.repeat(50)
    const { svg } = toSvg(solve(`[card #a create] @pos(0,0) @content("${long}")`))
    expect(svg).toContain('…')
  })
})
