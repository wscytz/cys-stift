import { describe, expect, it } from 'vitest'
import { parseDslWithDiagnostics, parseDslStrictWithDiagnostics } from '../dsl-parser'
import { sanitizeDslOps } from '../dsl-sanitize'
import { solveRelational } from '../dsl-relational-solver'
import { toSvg } from '../to-svg'
import { planRoute, DEFAULT_ROUTING, debugRoute } from '../routing'

/**
 * 对抗性维护轮(2026-10-27)—— 与 glm-5.2 健壮性测试互补:
 * 那边锁「脏输入永不抛」,这边锁「敌意输入下的输出仍良构 + 手误有信号」:
 *
 *   解析层:深度嵌套 / 巨量行数 → 终止且产物有限
 *   体验层:全角标点 / 拼错关系词 / @指令拼写 → warnings 可操作;良性恢复残余不误报
 *   语义层:重复 #id / 悬空端点 → 有诊断;SVG 注入 → 转义钉死
 *   数值层:NaN / Infinity 绝不落入 svg 字面量(skipped 通道)
 *   走线层:敌意 cfg / 几何 → null 或有限路径;非法参数回退默认(与 DEFAULT 同结果)
 */

/** 全管线跑一遍,返回 svg 是否含 NaN/Infinity 字面量 */
function pipelineHasNaN(dsl: string): boolean {
  const p = parseDslWithDiagnostics(dsl)
  const s = sanitizeDslOps(p.ops)
  const v = solveRelational(s.ops)
  const svg = toSvg(v.ops)
  return /NaN|Infinity/.test(svg.svg)
}

describe('解析层:深度嵌套与巨量输入', () => {
  it('@compute 深嵌套 5000/50000 层 → 全管线不抛不挂(求值在应用层,内核只存字段)', () => {
    for (const depth of [5000, 50000]) {
      const expr = '('.repeat(depth) + '1' + ')'.repeat(depth)
      const dsl = `[card #c1] @pos(0,0) @size(100,80) @compute("${expr}")`
      const p = parseDslWithDiagnostics(dsl)
      expect(p.errors).toEqual([])
      expect(() => sanitizeDslOps(p.ops)).not.toThrow()
      expect(() => toSvg(sanitizeDslOps(p.ops).ops)).not.toThrow()
    }
  })

  it('5 万行散文 + 1 卡 → 终止,ops=1(行级线性,无平方行为)', () => {
    const lines = Array.from({ length: 50_000 }, (_, i) => `这是一段无关散文第 ${i} 行`)
    lines[24_999] = '[card #only] @pos(0,0) @size(100,80)'
    const { ops, errors } = parseDslWithDiagnostics(lines.join('\n'))
    expect(ops).toHaveLength(1)
    expect(errors).toEqual([])
  })

  it('1MB 单行 / 10 万层深括号 → 不抛(graceful 吸收)', () => {
    expect(() => parseDslWithDiagnostics('[card #c] @title("' + 'x'.repeat(1_000_000) + '")')).not.toThrow()
    expect(() => parseDslWithDiagnostics('['.repeat(100_000))).not.toThrow()
  })

  it('未闭合引号 / 尾反斜杠 → 卡仍建出(title 丢弃或截断),不抛', () => {
    for (const dsl of [
      '[card #c1] @title("没闭合) @pos(0,0) @size(100,80)',
      '[card #c1] @title("尾巴\\") @pos(0,0) @size(100,80)',
    ]) {
      const p = parseDslWithDiagnostics(dsl)
      expect(p.ops).toHaveLength(1)
      expect(p.ops[0]!.type).toBe('card')
    }
  })
})

describe('自然语言体验:warnings 通道(手误有信号,恢复型残余静默)', () => {
  it('全角标点 @pos（0，0） → warning 含 full-width 提示,卡保留', () => {
    const p = parseDslWithDiagnostics('[card #c1] @title("测试") @pos（0，0） @size(100，80)')
    expect(p.ops).toHaveLength(1)
    expect(p.warnings).toHaveLength(1)
    expect(p.warnings[0]!.message).toContain('full-width')
    expect(p.warnings[0]!.line).toBe(1)
  })

  it('引号内的全角字符是字面内容 → 不误报', () => {
    const p = parseDslWithDiagnostics('[card #c1] @title("中文（字面）标点") @pos(0,0) @size(100,80)')
    expect(p.warnings).toEqual([])
  })

  it('拼错关系词 leftof → warning 指向真实关键词(right-of / below,语言里没有 left-of)', () => {
    const dsl = '[card #a] @pos(0,0) @size(100,80)\n[card #b] leftof #a @gap(20) @size(100,80)'
    const p = parseDslWithDiagnostics(dsl)
    expect(p.ops).toHaveLength(2)
    expect(p.warnings).toHaveLength(1)
    expect(p.warnings[0]!.message).toContain('relation')
    expect(p.warnings[0]!.message).toContain('right-of')
  })

  it('拼错 @指令 @siez → warning 点名 unknown @siez', () => {
    const p = parseDslWithDiagnostics('[card #c1] @pos(0,0) @siez(100,80)')
    expect(p.warnings).toHaveLength(1)
    expect(p.warnings[0]!.message).toContain('@siez')
  })

  it('良性恢复残余(from #card:1 的 :1)→ 零告警(skipChunk 恢复机制是设计内)', () => {
    const dsl = '[card #a] @pos(0,0) @size(100,80)\n[arrow #e] from #a to #a'
    const p = parseDslWithDiagnostics(dsl)
    expect(p.warnings).toEqual([])
  })

  it('干净行零告警;散文行保持静默(robustness 契约不动)', () => {
    const dsl = '[card #c1] @title("好") @pos(0,0) @size(100,80)\n散文一行\n# 注释'
    const p = parseDslWithDiagnostics(dsl)
    expect(p.warnings).toEqual([])
    expect(p.errors).toEqual([])
    expect(p.ops).toHaveLength(1)
  })

  it('strict 模式不受影响:敌意残余仍走 errors 通道(AI 面契约;裸 #a 会先判 duplicate id,也是有效信号)', () => {
    const p = parseDslStrictWithDiagnostics('[card #b] leftof #a @size(100,80)')
    expect(p.errors.length).toBeGreaterThan(0)
    expect(p.errors[0]!.message).toMatch(/duplicate|residual/)
  })
})

describe('语义层:重复 id 与 SVG 注入', () => {
  it('重复 #id → sanitize 诊断点名,ops 不丢(后者覆盖前者为既定语义)', () => {
    const dsl = '[card #c1] @pos(0,0) @size(100,80)\n[card #c1] @pos(500,0) @size(100,80)'
    const p = parseDslWithDiagnostics(dsl)
    const s = sanitizeDslOps(p.ops)
    expect(s.ops).toHaveLength(2)
    expect(s.diagnostics).toHaveLength(1)
    expect(s.diagnostics[0]!.message).toContain('duplicate element id #c1')
  })

  it('重复 free id 同样有诊断', () => {
    const ops = [
      { type: 'free', id: 'f1', shape: 'rect', x: 0, y: 0, w: 10, h: 10 },
      { type: 'free', id: 'f1', shape: 'rect', x: 50, y: 0, w: 10, h: 10 },
    ] as never[]
    const s = sanitizeDslOps(ops)
    expect(s.diagnostics.some((d) => d.message.includes('duplicate element id #f1'))).toBe(true)
  })

  it('SVG 注入三连:<script> / ]]>/ 属性引号 → 全部转义,无裸字面量', () => {
    const dsl = '[card #c1] @title("<script>alert(\\"x\\")</script>") @pos(0,0) @size(100,80)'
    const p = parseDslWithDiagnostics(dsl)
    const { svg } = toSvg(p.ops)
    expect(svg).not.toContain('<script')
    expect(svg).toContain('&lt;script&gt;')
    const { svg: svg2 } = toSvg(parseDslWithDiagnostics('[card #c2] @title("a]]>\\"b") @pos(0,0) @size(9,9)').ops)
    expect(svg2).not.toContain(']]>')
    expect(svg2).toContain('&quot;')
  })
})

describe('数值层:NaN/Infinity 绝不落 svg 字面量', () => {
  it('NaN/Infinity 卡坐标 → skipped 记录,svg 干净,viewBox 有限', () => {
    const ops = [
      { type: 'card', cardId: 'bad', x: NaN, y: Infinity, w: 100, h: 80 },
      { type: 'card', cardId: 'good', x: 0, y: 0, w: 100, h: 80, title: 'ok' },
    ] as never[]
    const { svg, skipped } = toSvg(ops)
    expect(/NaN|Infinity/.test(svg)).toBe(false)
    expect(skipped).toHaveLength(1)
    expect(skipped[0]!.op).toContain('bad')
    expect(svg).toContain('ok') // 好卡(title "ok")照常渲染
  })

  it('free 元素 / freeArrow 的非有限坐标 → 同样 skipped,svg 干净', () => {
    const freeOps = [{ type: 'free', id: 'f', shape: 'rect', x: NaN, y: 0, w: 10, h: 10 }] as never[]
    expect(/NaN|Infinity/.test(toSvg(freeOps).svg)).toBe(false)
    expect(toSvg(freeOps).skipped).toHaveLength(1)
    const arrowOps = [{ type: 'arrow', id: 'a', freeArrow: true, x: 1e999, y: 0, w: 10, h: 10 }] as never[]
    // 1e999 字面量在 TS 里是 Inf;JSON.parse('1e999') 同效 —— 敌意 JSON 导入的真实入口
    expect(/NaN|Infinity/.test(toSvg(arrowOps).svg)).toBe(false)
  })

  it('1e999(JSON 越界字面量)→ Infinity 坐标同样被 skip(JSON.parse 敌意入口)', () => {
    const hostile = JSON.parse('{"x": 1e999, "y": 0, "w": 10, "h": 10}') as { x: number }
    expect(hostile.x).toBe(Infinity)
    const ops = [{ type: 'card', cardId: 'j', x: hostile.x, y: 0, w: 10, h: 10 }] as never[]
    const { svg, skipped } = toSvg(ops)
    expect(/NaN|Infinity/.test(svg)).toBe(false)
    expect(skipped).toHaveLength(1)
  })

  it('全管线敌意坐标:手写 DSL 数值经 finiteNum 守卫本就有限;直塞 op 才可能 NaN → 通道兜住', () => {
    expect(pipelineHasNaN('[card #c1] @pos(1e999,0) @size(100,80)')).toBe(false)
  })
})

describe('走线层:敌意 cfg 与几何', () => {
  const S = { x: 0, y: 0, w: 200, h: 100 }
  const D = { x: 600, y: 300, w: 200, h: 100 }
  const P1 = { x: 200, y: 50 }
  const P2 = { x: 600, y: 350 }

  const pathFinite = (path: Array<{ x: number; y: number }> | null): boolean =>
    path === null || path.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))

  it('quant=0 / 负 / NaN → 归一回默认,结果与 DEFAULT_ROUTING 完全一致(688 钉不受扰)', () => {
    const base = planRoute(P1, P2, S, D, [], 'orthogonal')
    for (const quant of [0, -1, Number.NaN]) {
      const path = planRoute(P1, P2, S, D, [{ x: 552, y: 150, w: 64, h: 100 }], 'orthogonal', {
        ...DEFAULT_ROUTING,
        quant,
      })
      expect(path).toEqual(base)
    }
  })

  it('负 margin / 负 penalty → 不炸、结果有限(归一回默认语义)', () => {
    const hostile = { ...DEFAULT_ROUTING, margin: -5, bendPenalty: -3, uturnPenalty: -1, minStub: -2 }
    const path = planRoute(P1, P2, S, D, [{ x: 552, y: 150, w: 64, h: 100 }], 'orthogonal', hostile)
    expect(pathFinite(path)).toBe(true)
    expect(path).toEqual(planRoute(P1, P2, S, D, [{ x: 552, y: 150, w: 64, h: 100 }], 'orthogonal'))
  })

  it('非有限端点/源目 → null(契约:不产 NaN 路径);非有限障碍被忽略(等同不存在)', () => {
    expect(planRoute({ x: NaN, y: 0 }, P2, S, D, [], 'orthogonal')).toBeNull()
    expect(planRoute(P1, P2, { x: 0, y: 0, w: NaN, h: 100 }, D, [], 'orthogonal')).toBeNull()
    expect(planRoute(P1, P2, S, D, [{ x: NaN, y: 0, w: 10, h: 10 }], 'orthogonal')).toEqual(
      planRoute(P1, P2, S, D, [], 'orthogonal'),
    )
  })

  it('退化几何:p1==p2 / 零尺寸 / 负宽高 / src==dst → null 或有限路径,不炸不挂', () => {
    expect(pathFinite(planRoute(P1, P1, S, D, [], 'orthogonal'))).toBe(true)
    expect(pathFinite(planRoute(P1, P2, { x: 0, y: 0, w: 0, h: 0 }, D, [], 'orthogonal'))).toBe(true)
    expect(pathFinite(planRoute(P1, P2, S, { x: 600, y: 300, w: -50, h: 80 }, [], 'orthogonal'))).toBe(true)
    expect(pathFinite(planRoute(P1, P2, S, S, [], 'orthogonal'))).toBe(true)
  })

  it('敌意输入下 debugRoute 不炸,内省字段为数组(调试台场景 JSON 导入的真实入口)', () => {
    const dbg = debugRoute(P1, P2, S, D, [{ x: 552, y: 150, w: 64, h: 100 }], {
      ...DEFAULT_ROUTING,
      quant: 0,
      margin: -100,
    })
    for (const key of ['xs', 'ys', 'sPorts', 'tPorts', 'starts', 'ends'] as const) {
      expect(Array.isArray(dbg[key])).toBe(true)
    }
  })

  it('敌意 cfg 确定性:同输入 20 次,字节级一致', () => {
    const hostile = { ...DEFAULT_ROUTING, quant: 0, margin: -5 }
    const first = JSON.stringify(planRoute(P1, P2, S, D, [{ x: 552, y: 150, w: 64, h: 100 }], 'orthogonal', hostile))
    for (let i = 0; i < 20; i++) {
      expect(JSON.stringify(planRoute(P1, P2, S, D, [{ x: 552, y: 150, w: 64, h: 100 }], 'orthogonal', hostile))).toBe(
        first,
      )
    }
  })
})
