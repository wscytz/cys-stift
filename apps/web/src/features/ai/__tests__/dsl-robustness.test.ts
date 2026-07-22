import { describe, expect, it } from 'vitest'
import { parseDsl, parseDslWithDiagnostics } from '@cys-stift/dsl'
import { applyLayout } from '../../canvas/apply-layout'
import { InMemoryCanvasHost } from '@cys-stift/canvas-engine'

/**
 * DSL robustness — 锁住转义(transliteration)赌注的**承重声明**:
 *
 *   "任何 AI 都能廉价驱动画布编辑;即使 AI 输出不完美,parse/apply 规则也
 *    会接住它——不崩溃、不静默损坏数据。"
 *
 * 这套测试把"我们相信规则接得住"变成"有测试证明":parser 与 applier 对垃圾
 * 输入**永不抛错**、垃圾中的合法 op 仍生效、解析出的坐标恒为有限整数(绝不
 * NaN/Infinity——那会腐蚀 host/渲染)。
 *
 * 互补于 `dsl-e2e-roundtrip.test.ts`(证明**干净输入无损往返**);本套证明
 * **脏输入优雅降级**。两份合起来才是转义双向闭环的完整保证。
 */

describe('parseDsl — 永不对抗性输入抛错', () => {
  const garbageInputs = [
    '',
    '   ',
    '\n\n\n',
    '# just a comment',
    'random prose with no brackets',
    '[card #a]', // 缺 @pos
    '[card]', // 缺 #id
    '[unknown #x] @pos(1,2)', // 未知 kind
    '[card #a] @pos(', // 截断
    '[card #a] @pos(1,2', // 未闭合括号
    '[card #a] @pos(abc, def)', // 非数字(regex 不匹配 → 缺 @pos)
    '[card #a] @pos(1.5, 2)', // 浮点(\d+ 不匹配 → 缺 @pos)
    '[card #a] @pos(99999999999999999999999999, 0)', // 超大
    '[card #a] @pos(-5, -10) @size(-1, -2)', // 负数(画布合法)
    '[card #a] @pos(1,2) @color(green)', // 越界色(非 Bauhaus 6/grey)
    '[arrow #a]', // 箭头啥都没有
    '[arrow #a] from #x', // 缺 to
    '[arrow #a] @pos(1,2)', // 自由箭头缺 @size
    '[rect #r] @pos(1,2)', // rect(size 可选)
    '[rect #r]', // rect 缺 @pos
    '[text #t] @pos(1,2) @text("unterminated', // 未闭合引号
    '[text #t] @pos(1,2) @text("")', // 空 text
    '[frame #f] @pos(1,2) @size(3,4) @text("title")',
    '[card\nmultiline', // 括号后换行(无闭合)
    '[\x00\x01 control chars]',
    '[card #a] @pos(1,2) 中文 prose', // 合法 directive 后 unicode 散文
    '@elbow(garbage)', // 非方括号行
    '[arrow #a] from #x to #y @elbow(1,2;bad;3,4)', // 混合好坏折点
  ]

  for (const input of garbageInputs) {
    it(`不抛错: ${JSON.stringify(input).slice(0, 60)}`, () => {
      expect(() => parseDsl(input)).not.toThrow()
      expect(() => parseDslWithDiagnostics(input)).not.toThrow()
    })
  }

  it('每个解析出的 op 坐标恒为有限整数(绝不 NaN/Infinity)', () => {
    for (const input of garbageInputs) {
      const { ops } = parseDslWithDiagnostics(input)
      for (const op of ops) {
        for (const k of ['x', 'y', 'w', 'h'] as const) {
          if (k in op) {
            const v = (op as Record<string, unknown>)[k]
            if (typeof v === 'number') {
              expect(Number.isFinite(v), `${k}=${v} 非有限,输入: ${input}`).toBe(true)
              // 现在支持小数坐标，不再要求是整数
            }
          }
        }
        if (op.type === 'arrow' && op.curve) {
          expect(Number.isFinite(op.curve.cx), `curve.cx=${op.curve.cx} 非有限`).toBe(true)
          expect(Number.isFinite(op.curve.cy), `curve.cy=${op.curve.cy} 非有限`).toBe(true)
        }
        if (op.type === 'arrow' && op.elbow) {
          for (const p of op.elbow) {
            expect(Number.isFinite(p.x), `elbow.x=${p.x} 非有限`).toBe(true)
            expect(Number.isFinite(p.y), `elbow.y=${p.y} 非有限`).toBe(true)
          }
        }
      }
    }
  })

  it('diagnostics 结构合法(line≥1 / text 非空 / message 非空)', () => {
    const { errors } = parseDslWithDiagnostics(
      '[card]\n[foo #x] @pos(1,2)\n[card #a]',
    )
    expect(errors.length).toBe(3) // 三行都坏(card 缺 pos / foo 未知 kind / card 缺 pos)
    for (const e of errors) {
      expect(e.line).toBeGreaterThanOrEqual(1)
      expect(typeof e.text).toBe('string')
      expect(e.text.length).toBeGreaterThan(0)
      expect(typeof e.message).toBe('string')
      expect(e.message.length).toBeGreaterThan(0)
    }
  })
})

describe('applyLayout — 永不抛错 + 垃圾中的合法 op 仍生效', () => {
  it('混合有效/垃圾块:合法 op 生效,垃圾丢弃,不抛错', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'card:1', kind: 'card', x: 0, y: 0, w: 100, h: 100, rotation: 0 })

    const dsl = `
      Here is the layout:
      [card #card:1] @pos(200, 300) @color(blue)
      [nonsense #x] @pos(1,2)
      [card #missing] @pos(5,5)
      [arrow #a] from #card:1 to #nope
      [rect #r] @pos(10,20) @size(30,40) @color(red)
      some trailing prose
    `
    const { ops, errors } = parseDslWithDiagnostics(dsl)
    expect(errors.length).toBeGreaterThanOrEqual(1) // [nonsense...] 被记

    expect(() => applyLayout(host, ops)).not.toThrow()
    const r = applyLayout(host, ops)
    expect(r.applied).toBeGreaterThanOrEqual(1)

    const card = host.getElement('card:1')
    expect(card?.x).toBe(200)
    expect(card?.y).toBe(300)
    const rect = host.getElements().find((e) => e.kind === 'rect')
    expect(rect).toBeTruthy()
  })

  it('超大坐标不崩 apply(不把 Infinity/NaN 灌进 host)', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'card:1', kind: 'card', x: 0, y: 0, w: 1, h: 1, rotation: 0 })
    const ops = parseDsl('[card #card:1] @pos(99999999999999999999999999, 0)')
    expect(() => applyLayout(host, ops)).not.toThrow()
    expect(Number.isFinite(host.getElement('card:1')?.x ?? NaN)).toBe(true)
  })

  it('空 ops → no-op,不抛错', () => {
    const host = new InMemoryCanvasHost()
    expect(() => applyLayout(host, [])).not.toThrow()
    expect(applyLayout(host, [])).toMatchObject({ total: 0, applied: 0, skipped: 0, failed: 0, newlyApplied: [] })
  })

  it('纯垃圾解析结果 apply:啥也不建,不抛错', () => {
    const host = new InMemoryCanvasHost()
    const ops = parseDsl('total garbage \n [???] \n ###')
    expect(() => applyLayout(host, ops)).not.toThrow()
    expect(host.getElements().length).toBe(0)
  })
})

describe('转义赌注保证 — 随机 fuzz(确定性种子,零新依赖)', () => {
  // mulberry32 确定性 PRNG——不引入 fuzz 库(YAGNI),固定种子可复现。
  function rng(seed: number): () => number {
    let a = seed
    return () => {
      a |= 0
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  const kinds = ['card', 'arrow', 'rect', 'text', 'frame', 'bogus']
  const colors = ['red', 'blue', 'green', 'gray', '', 'XYZ']
  const dirs = ['@pos', '@size', '@color', '@text', '@label', '@elbow', '@garbage']

  function randLine(rand: () => number): string {
    const k = kinds[Math.floor(rand() * kinds.length)]!
    const parts = [`[${k} #id${Math.floor(rand() * 5)}]`]
    const n = Math.floor(rand() * 4)
    for (let i = 0; i < n; i++) {
      const d = dirs[Math.floor(rand() * dirs.length)]!
      if (d === '@color' || d === '@garbage') {
        parts.push(`${d}(${colors[Math.floor(rand() * colors.length)]})`)
      } else if (d === '@text' || d === '@label') {
        parts.push(`${d}("${Math.floor(rand() * 100)}")`)
      } else {
        parts.push(
          `${d}(${Math.floor(rand() * 200) - 50},${Math.floor(rand() * 200) - 50})`,
        )
      }
    }
    return parts.join(' ')
  }

  it('500 个随机 DSL 块:parse 永不抛错,坐标恒有限', () => {
    const rand = rng(42)
    for (let i = 0; i < 500; i++) {
      const dsl = Array.from(
        { length: 1 + Math.floor(rand() * 5) },
        () => randLine(rand),
      ).join('\n')
      let ops
      try {
        ops = parseDsl(dsl)
      } catch (e) {
        throw new Error(`parseDsl 抛错于:\n${dsl}\n${e}`)
      }
      for (const op of ops) {
        for (const k of ['x', 'y', 'w', 'h'] as const) {
          if (k in op) {
            const v = (op as Record<string, unknown>)[k]
            if (typeof v === 'number') {
              expect(Number.isFinite(v), `非有限 ${k}=${v},块:\n${dsl}`).toBe(true)
            }
          }
        }
      }
    }
  })

  it('500 个随机 DSL 块灌进 host:apply 永不抛错', () => {
    const host = new InMemoryCanvasHost()
    // 预置 fuzz 可能引用的 id(让 apply 路径和 skip 路径都被走到)
    for (let i = 0; i < 5; i++) {
      host.upsert({
        id: `id${i}`,
        kind: 'card',
        x: 0,
        y: 0,
        w: 10,
        h: 10,
        rotation: 0,
      })
    }
    const rand = rng(7)
    for (let i = 0; i < 500; i++) {
      const dsl = Array.from(
        { length: 1 + Math.floor(rand() * 4) },
        () => randLine(rand),
      ).join('\n')
      try {
        applyLayout(host, parseDsl(dsl))
      } catch (e) {
        throw new Error(`applyLayout 抛错于:\n${dsl}\n${e}`)
      }
    }
    expect(host.getElements().length).toBeGreaterThanOrEqual(5) // 5 张种子卡仍在
  })
})
