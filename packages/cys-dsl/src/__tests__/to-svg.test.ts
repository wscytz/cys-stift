import { describe, expect, it } from 'vitest'
import { parseDsl } from '../dsl-parser.js'
import { sanitizeDslOps } from '../dsl-sanitize.js'
import { solveRelational } from '../dsl-relational-solver.js'
import { toSvg, routeAround, renderDslSvg } from '../to-svg.js'

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
    // 错位:正交绕行,最少折数(1 折 L 形即最优——求解器启发修正后,2 折 Z 的
    // 旧期望是启发误价的产物);一个圆角;L = 2 段折线(严格轴对齐在 routing.test 钉)
    const staggered = svgOf(
      '[card #a create] @pos(0,0) @size(200,100)\n[card #b create] @pos(600,300) @size(200,100)\n[arrow #e] from #a to #b @route(elbow)',
    )
    expect(staggered.q).toBe(1)
    expect((staggered.d[0]!.match(/ L /g) ?? []).length).toBe(2)
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

describe('toSvg options / renderDslSvg — 外部消费方协作(v11)', () => {
  const dsl = [
    '[card #a create] @pos(0,0) @size(200,100) @title("A")',
    '[card #b create] @pos(400,0) @size(200,100) @title("B")',
    '[arrow #e1] from #a to #b @label("引用")',
  ].join('\n')

  it('缺省输出保持旧观感:箭头组在节点组之前', () => {
    const { svg } = toSvg(solve(dsl))
    const g1 = svg.indexOf('<g>')
    const g2 = svg.indexOf('<g>', g1 + 1)
    expect(svg.slice(g1, g2)).toContain('<path')
    expect(svg.slice(g1, g2)).not.toContain('<rect')
    expect(svg.slice(g2)).toContain('<rect')
  })

  it('arrowsOnTop: true → 节点组在前、箭头组在后(与产品 KIND_LAYER 同序)', () => {
    const { svg } = toSvg(solve(dsl), { arrowsOnTop: true })
    const g1 = svg.indexOf('<g>')
    const g2 = svg.indexOf('<g>', g1 + 1)
    expect(svg.slice(g1, g2)).toContain('<rect')
    expect(svg.slice(g2)).toContain('<path')
  })

  it('strokeWidth / halo / labelFontSize 可调', () => {
    const { svg } = toSvg(solve(dsl), { strokeWidth: 2.6, halo: true, labelFontSize: 12.5 })
    expect(svg).toContain('stroke-width="2.6"')
    expect(svg).toContain('opacity="0.92"')
    expect(svg).toContain(`font-size="12.5"`)
  })

  it('缺省(不传 options)输出与旧版一致:无 halo、stroke-width="2"、font-size="11"', () => {
    const { svg } = toSvg(solve(dsl))
    expect(svg).not.toContain('opacity="0.92"')
    expect(svg).toContain('stroke-width="2"')
    expect(svg).toContain('font-size="11"')
  })

  it('renderDslSvg 一步到位:合法 DSL 零诊断、卡和箭头都渲染', () => {
    const { svg, skipped, diagnostics } = renderDslSvg(dsl)
    expect(diagnostics).toEqual([])
    expect(skipped).toEqual([])
    expect(svg).toContain('<rect')
    expect(svg).toContain('引用')
  })

  it('renderDslSvg:缺失锚点进 diagnostics,不产悬空线', () => {
    const { svg, diagnostics } = renderDslSvg('[card #e create] right-of #ghost @gap(20)')
    expect(diagnostics.some((d) => d.stage === 'solver' && d.message.includes('ghost'))).toBe(true)
    expect(svg).not.toContain('<path')
  })

  it('renderDslSvg:existingGeometry 供相对布局求解(锚点/避障),但本身不绘制', () => {
    const { svg, diagnostics } = renderDslSvg('[card #g create] right-of #a @gap(20) @size(200,100)', {
      existingGeometry: { a: { x: 0, y: 0, w: 200, h: 100 } },
    })
    expect(diagnostics).toEqual([])
    expect(svg).toContain('<rect')
    // a 右缘 200 + gap 20 = 220(SVG 里第一个 rect 是带 PAD 偏移的背景,卡片是 220)
    expect(svg).toContain('<rect x="220"')
    // existing #a 只参与求解,快照不画它:背景 + 新卡恰两张 rect
    expect((svg.match(/<rect /g) ?? [])).toHaveLength(2)
  })
})

describe('快照渲染契约 — delete / 内容编辑 / existingGeometry / 选项守卫', () => {
  const dsl = [
    '[card #a create] @pos(0,0) @size(200,100) @title("A")',
    '[card #b create] @pos(400,0) @size(200,100) @title("B")',
    '[arrow #e1] from #a to #b @label("引用")',
  ].join('\n')

  it('delete 永不绘制、不登记占位几何,也不进 skipped', () => {
    const { svg, skipped } = toSvg(
      solve(
        [
          '[card #gone delete]',
          '[rect #r delete]',
          '[text #t delete]',
          '[frame #f delete]',
          '[arrow #e delete]',
          '[card #ok create] @pos(0,0) @size(100,80)',
        ].join('\n'),
      ),
    )
    expect(skipped).toEqual([])
    // 仅背景 + ok 卡两张 rect:delete 的 (0,0) 占位卡没有被画出来
    expect((svg.match(/<rect /g) ?? [])).toHaveLength(2)
    expect(svg).toContain('width="100"')
    expect(svg).not.toContain('<path')
  })

  it('箭头端点指向 delete op → skipped(delete 不登记几何),不产悬空线', () => {
    const { svg, skipped } = toSvg(solve('[card #gone delete]\n[arrow #e] from #gone to #gone'))
    expect(skipped).toHaveLength(1)
    expect(skipped[0]).toMatchObject({ opIndex: 1, line: 2 })
    expect(skipped[0]!.reason).toContain('#gone')
    expect(svg).not.toContain('<path')
  })

  it('纯内容编辑不猜 (0,0) 原点:skipped 带原因/行号,占位卡不画', () => {
    const { svg, skipped } = toSvg(
      solve('[card #a] @title("改名")\n[card #b create] @pos(0,0) @size(100,80) @title("B")'),
    )
    expect(skipped).toHaveLength(1)
    expect(skipped[0]).toMatchObject({ opIndex: 0, line: 1 })
    expect(skipped[0]!.reason).toContain('无 @pos')
    expect(svg).not.toContain('改名')
    expect(svg).toContain('>B<')
  })

  it('existingGeometry 不让内容编辑凭空投影(快照不是补丁)', () => {
    const { svg, skipped } = renderDslSvg('[card #a] @title("改名")', {
      existingGeometry: { a: { x: 100, y: 200, w: 240, h: 120 } },
    })
    expect(skipped).toHaveLength(1)
    expect(skipped[0]).toMatchObject({ line: 1 })
    expect(skipped[0]!.reason).toContain('无 @pos')
    expect(svg).not.toContain('改名')
    expect(svg).not.toContain('width="240"')
  })

  it('existingGeometry 只供相对求解:箭头指向已有 id → skipped,已有元素不画', () => {
    const text = [
      '[card #b create] @pos(0,0) @size(100,80)',
      '[arrow #e1] from #ex to #b',
      '[arrow #e2] from #b to #ex',
    ].join('\n')
    const { svg, skipped, diagnostics } = renderDslSvg(text, {
      existingGeometry: { ex: { x: 400, y: 0, w: 100, h: 80 } },
    })
    expect(diagnostics).toEqual([])
    expect(skipped).toHaveLength(2)
    expect(skipped.map((s) => ({ opIndex: s.opIndex, line: s.line }))).toEqual([
      { opIndex: 1, line: 2 },
      { opIndex: 2, line: 3 },
    ])
    expect(skipped.every((s) => s.reason.includes('#ex'))).toBe(true)
    expect(svg).not.toContain('<path')
    // 只有背景 + DSL 里的 b 卡;existing #ex 不画
    expect((svg.match(/<rect /g) ?? [])).toHaveLength(2)
  })

  it('existingGeometry 本身不进画面(空 DSL → 只有背景)', () => {
    const { svg, skipped } = renderDslSvg('', {
      existingGeometry: { ex: { x: 0, y: 0, w: 300, h: 200 } },
    })
    expect(skipped).toEqual([])
    expect((svg.match(/<rect /g) ?? [])).toHaveLength(1)
    expect(svg).not.toContain('width="300"')
  })

  it('可视化数值选项非有限/非正 → 回落缺省(输出逐字节等于缺省)', () => {
    const ops = solve(dsl)
    const base = toSvg(ops).svg
    expect(toSvg(ops, { strokeWidth: Number.NaN, arrowHeadLength: Infinity, labelFontSize: 0 }).svg).toBe(base)
    expect(toSvg(ops, { strokeWidth: -1, arrowHeadLength: -12, labelFontSize: Number.NaN }).svg).toBe(base)
    expect(toSvg(ops, { arrowHeadLength: 0 }).svg).toBe(base)
    expect(/NaN|Infinity/.test(toSvg(ops, { strokeWidth: Infinity, labelFontSize: -5 }).svg)).toBe(false)
  })

  it('合法正数选项生效(含小数)', () => {
    const ops = solve(dsl)
    const base = toSvg(ops).svg
    const custom = toSvg(ops, { strokeWidth: 3.5, arrowHeadLength: 20, labelFontSize: 12 }).svg
    expect(custom).not.toBe(base)
    expect(custom).toContain('stroke-width="3.5"')
    expect(custom).toContain('font-size="12"')
    // arrowHeadLength 单独生效(箭头头部坐标变化)
    expect(toSvg(ops, { arrowHeadLength: 20 }).svg).not.toBe(base)
  })

  it('skipped/diagnostics 带源行号;opIndex 是 op 数组下标而非行号', () => {
    const { skipped, diagnostics } = renderDslSvg(
      ['[card #bad]', '[card #a create] @pos(0,0) @size(100,80)', '[arrow #e] from #a to #ghost'].join('\n'),
    )
    expect(diagnostics).toContainEqual(expect.objectContaining({ stage: 'parse', line: 1 }))
    expect(skipped).toHaveLength(1)
    expect(skipped[0]).toMatchObject({ opIndex: 1, line: 3 })
    expect(skipped[0]!.reason).toContain('#ghost')
  })

  it('外部 JSON ops 的非有限 curve/elbow 不产 NaN 或属性注入 (P-10)', () => {
    const ops = solve(
      '[card #a create] @pos(0,0) @size(100,80)\n[card #b create] @pos(300,0) @size(100,80)\n[arrow #e] from #a to #b',
    )
    const arrow = ops.find((op) => op.type === 'arrow') as Record<string, unknown>
    arrow.route = 'curve'
    arrow.curve = { cx: '0" onload="alert(1)', cy: Number.NaN }
    const curved = toSvg(ops).svg
    expect(curved).not.toContain('NaN')
    expect(curved).not.toContain('onload')

    arrow.route = 'elbow'
    arrow.elbow = [{ x: Number.NaN, y: 2 }, { x: '1" onload="x', y: 3 }]
    const elbowed = toSvg(ops).svg
    expect(elbowed).not.toContain('NaN')
    expect(elbowed).not.toContain('onload')

    // null 折点不能抛；超大有限坐标不能经数学运算变成 Infinity 进 d。
    arrow.elbow = [null, { x: 1e308, y: 1e308 }]
    expect(() => toSvg(ops)).not.toThrow()
    arrow.route = 'curve'
    arrow.curve = { cx: 1e308, cy: 1e308 }
    expect(() => toSvg(ops)).not.toThrow()
  })

  it('sanitize 诊断回填 opIndex + 源行号', () => {
    const { diagnostics, skipped } = renderDslSvg(
      '[card #a create] @pos(0,0)\n[card #b create] right-of #a @gap(-5)',
    )
    const diagnostic = diagnostics.find((d) => d.stage === 'sanitize')
    expect(diagnostic).toMatchObject({ opIndex: 1, line: 2 })
    expect(diagnostic!.message).toContain('gap')
    expect(skipped).toEqual([])
  })

  it('solver 诊断回填 opIndex + 源行号(空行也计行)', () => {
    const { diagnostics } = renderDslSvg('\n[card #e create] right-of #ghost @gap(20)')
    const diagnostic = diagnostics.find((d) => d.stage === 'solver')
    expect(diagnostic).toMatchObject({ opIndex: 0, line: 2 })
    expect(diagnostic!.message).toContain('ghost')
  })
})
