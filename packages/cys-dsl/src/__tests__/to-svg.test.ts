import { describe, expect, it } from 'vitest'
import { parseDsl } from '../dsl-parser'
import { sanitizeDslOps } from '../dsl-sanitize'
import { solveRelational } from '../dsl-relational-solver'
import { toSvg, routeAround } from '../to-svg'

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
    // elbow 折点保留,转角圆角化:两个折点各切一次角(半径 8)
    expect(svg).toContain('Q 250 340 250 348')
    expect(svg).toContain('Q 250 380 257.7')
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

describe('自动避障(routeAround + 默认路由)', () => {
  // 与 toSvg 内部同口径:障碍内缩 2px(贴边端点免误报)后做线段相交检查
  type R = { x: number; y: number; w: number; h: number }
  type P = { x: number; y: number }
  function expectClear(pts: P[], raw: R[]): void {
    const rects = raw.filter((r) => r.w > 12 && r.h > 12).map((r) => ({ x: r.x + 2, y: r.y + 2, w: r.w - 4, h: r.h - 4 }))
    for (let i = 0; i < pts.length - 1; i++) {
      for (const r of rects) {
        const a = pts[i]!
        const b = pts[i + 1]!
        const dx = b.x - a.x
        const dy = b.y - a.y
        let t0 = 0
        let t1 = 1
        let miss = false
        for (const [p, q] of [
          [-dx, a.x - r.x],
          [dx, r.x + r.w - a.x],
          [-dy, a.y - r.y],
          [dy, r.y + r.h - a.y],
        ] as Array<[number, number]>) {
          if (p === 0) {
            if (q < 0) miss = true
          } else {
            const t = q / p
            if (p < 0) {
              if (t > t1) miss = true
              if (t > t0) t0 = t
            } else {
              if (t < t0) miss = true
              if (t < t1) t1 = t
            }
          }
          if (miss) break
        }
        expect(miss || t1 - t0 <= 0.01).toBe(true)
      }
    }
  }

  // 三卡一排,中间是障碍
  const obstacle = { x: 300, y: 0, w: 240, h: 110 }

  it('直连穿卡 → 绕行整条路径(端点重贴边);直连不穿卡 → null', () => {
    const src = { x: 0, y: 0, w: 240, h: 110 }
    const dst = { x: 600, y: 0, w: 240, h: 110 }
    // 穿障碍的对角线 → 有绕行且全程不穿,首末端点贴在源/目标边界上(哪条边由最短路决定)
    const detour = routeAround({ x: 240, y: 90 }, { x: 600, y: 20 }, src, dst, [src, obstacle, dst])
    expect(detour).not.toBeNull()
    expectClear(detour!, [src, obstacle, dst])
    const onBorder = (p: { x: number; y: number }, r: { x: number; y: number; w: number; h: number }): boolean =>
      ((Math.abs(p.x - r.x) < 0.5 || Math.abs(p.x - (r.x + r.w)) < 0.5) && p.y >= r.y - 0.5 && p.y <= r.y + r.h + 0.5) ||
      ((Math.abs(p.y - r.y) < 0.5 || Math.abs(p.y - (r.y + r.h)) < 0.5) && p.x >= r.x - 0.5 && p.x <= r.x + r.w + 0.5)
    expect(onBorder(detour![0]!, src)).toBe(true)
    expect(onBorder(detour![detour!.length - 1]!, dst)).toBe(true)
    // 不穿任何障碍的斜线(从源右缘绕过障碍左下角到目标顶边) → null(不画蛇添足)
    const clear = routeAround({ x: 240, y: 55 }, { x: 370, y: 200 }, { x: 0, y: 0, w: 240, h: 110 }, { x: 300, y: 200, w: 240, h: 110 }, [
      { x: 0, y: 0, w: 240, h: 110 },
      { x: 300, y: 0, w: 240, h: 110 },
      { x: 300, y: 200, w: 240, h: 110 },
    ])
    expect(clear).toBeNull()
  })

  it('直连擦两簇障碍、包围盒走廊全撞墙时,障碍间隙走廊救场(回归:demo 喂出需求箭头)', () => {
    // 左列 s2→e1 的直连线同时擦到头顶的 s1 和右列的 e2:包围盒横跨两列,
    // 外扩走廊全撞墙;唯一活路是两列之间的间隙走廊(x≈270)
    const s0 = { x: 0, y: 0, w: 240, h: 110 }
    const s1 = { x: 0, y: 126, w: 240, h: 120 }
    const s2 = { x: 0, y: 262, w: 240, h: 120 }
    const e1 = { x: 300, y: 0, w: 240, h: 120 }
    const e2 = { x: 300, y: 136, w: 240, h: 120 }
    const e3 = { x: 300, y: 272, w: 240, h: 120 }
    const detour = routeAround({ x: 188.7, y: 262 }, { x: 351.3, y: 120 }, s2, e1, [s0, s1, s2, e1, e2, e3])
    expect(detour).not.toBeNull()
    expectClear(detour!, [s0, s1, s2, e1, e2, e3])
  })

  it('默认路由避障生效;显式 straight/curve 不干预', () => {
    const ops = solve(
      [
        '[card #a create] @pos(0,0) @size(200,100)',
        '[card #m create] @pos(400,0) @size(200,100)',
        '[card #b create] @pos(800,0) @size(200,100)',
        '[arrow #e1] from #a to #b',
        '[arrow #e2] from #a to #b @route(straight)',
      ].join('\n'),
    )
    const { svg } = toSvg(ops)
    // e1 绕行:路径多于一个 L;e2 显式直线:恰一个 L
    const paths = [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]!)
    expect(paths).toHaveLength(2)
    const detoured = paths.filter((d) => (d.match(/L /g) ?? []).length > 1)
    const straight = paths.filter((d) => (d.match(/L /g) ?? []).length === 1)
    expect(detoured).toHaveLength(1)
    expect(straight).toHaveLength(1)
  })

  it('绕行不撞进别的障碍(上下夹击时仍能找到走廊)', () => {
    const src = { x: 0, y: 100, w: 100, h: 100 }
    const dst = { x: 500, y: 100, w: 100, h: 100 }
    const up = { x: 250, y: 0, w: 100, h: 80 }
    const down = { x: 250, y: 220, w: 100, h: 80 }
    const mid = { x: 250, y: 110, w: 100, h: 80 }
    const detour = routeAround({ x: 100, y: 150 }, { x: 500, y: 150 }, src, dst, [src, mid, up, down, dst])
    expect(detour).not.toBeNull()
    expectClear(detour!, [src, mid, up, down, dst])
  })

  it('常规候选全灭时绕全局外围兜底,宁可绕远不穿模(满墙场景)', () => {
    // 源/目标之间一堵满墙:无间隙走廊,内外扩 Z 全被墙截断 → 绕墙头/墙尾
    const src = { x: 0, y: 0, w: 100, h: 100 }
    const dst = { x: 600, y: 0, w: 100, h: 100 }
    const wall = { x: 250, y: -1000, w: 100, h: 2000 }
    const detour = routeAround({ x: 100, y: 50 }, { x: 600, y: 50 }, src, dst, [src, wall, dst])
    expect(detour).not.toBeNull()
    expectClear(detour!, [src, wall, dst])
  })

  it('route=elbow 无折点:同行直连、错位走正交 Z(圆角)、有障碍走避障', () => {
    const svgOf = (body: string): { d: string[]; q: number } => {
      const { svg } = toSvg(solve(body))
      return { d: [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]!), q: (svg.match(/Q /g) ?? []).length }
    }
    // 同行对齐:无需转折,直连(无圆角)
    const aligned = svgOf(
      '[card #a create] @pos(0,0) @size(200,100)\n[card #b create] @pos(600,0) @size(200,100)\n[arrow #e] from #a to #b @route(elbow)',
    )
    expect(aligned.q).toBe(0)
    expect((aligned.d[0]!.match(/ L /g) ?? []).length).toBe(1)
    // 错位:主方向中线 Z,两个圆角
    const staggered = svgOf(
      '[card #a create] @pos(0,0) @size(200,100)\n[card #b create] @pos(600,300) @size(200,100)\n[arrow #e] from #a to #b @route(elbow)',
    )
    expect(staggered.q).toBe(2)
    expect(staggered.d[0]).toContain(' 400 ') // 中线 x=400 垂直段
    // 有障碍:避障绕行(多于一个 L + 圆角)
    const blocked = svgOf(
      [
        '[card #a create] @pos(0,0) @size(200,100)',
        '[card #m create] @pos(400,0) @size(200,100)',
        '[card #b create] @pos(800,0) @size(200,100)',
        '[arrow #e] from #a to #b @route(elbow)',
      ].join('\n'),
    )
    expect((blocked.d[0]!.match(/ L /g) ?? []).length).toBeGreaterThan(1)
    expect(blocked.q).toBeGreaterThanOrEqual(1)
  })

  it('默认路由(直线)不产生圆角 Q;标签锚在弧长中点', () => {
    const { svg } = toSvg(
      solve(
        '[card #a create] @pos(0,0) @size(200,100)\n[card #b create] @pos(600,0) @size(200,100)\n[arrow #e] from #a to #b @label("标")',
      ),
    )
    expect((svg.match(/Q /g) ?? []).length).toBe(0)
    expect(svg).toContain('标')
  })
})
