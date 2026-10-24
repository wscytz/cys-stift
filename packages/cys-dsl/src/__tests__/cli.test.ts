import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { main, renderText, roundtripText, validateText } from '../cli'

/** v8 全特性样本:几何 + 关系式 + 结构化字段 + 箭头签名 + 自由元素。 */
const SAMPLE = [
  '[card #a create] @pos(100,100) @size(240,120) @color(blue) @title("概念") @content("第一条笔记") @type(note) @tags(设计;画布) @links(https://example.com) @code(ts,"const a = 1","示例")',
  '[card #b create] right-of #a @gap(20) @title("推论") @quote("Less, but better","Dieter Rams")',
  '[arrow #r1] from #a to #b @label("支持") @dash(dashed) @arrowhead(triangle)',
  '[text #t1] @pos(50,600) @text("hello") @group("随笔")',
  '[rect #box] @pos(40,40) @size(600,400)',
].join('\n')

describe('cli:validateText', () => {
  it('干净文件 → exit 0 + op 统计', () => {
    const r = validateText(SAMPLE)
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('5 op')
    expect(r.stdout).toContain('✓')
  })

  it('语法错误行 → exit 1 + 原行号报告(诊断走 stderr)', () => {
    const r = validateText(`${SAMPLE}\n[freedraw #x] @pos(1,1)`)
    expect(r.code).toBe(1)
    expect(r.stderr).toContain('行6')
    expect(r.stderr).toContain('freedraw')
    expect(r.stderr).toContain('✗')
  })

  it('警告(断锚)不阻断:⚠ 进 stderr,措辞为"语法通过;N 条警告"', () => {
    const r = validateText('[card #a create] right-of #ghost')
    expect(r.code).toBe(0)
    expect(r.stderr).toContain('⚠')
    expect(r.stdout).toContain('1 条警告')
    expect(r.stdout).toContain('语法通过')
    expect(r.stdout).not.toContain('均通过')
  })
})

describe('cli:main flag 解析', () => {
  it('render --svg → SVG 进 stdout;未知 flag / validate 带 --svg → exit 2', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cys-dsl-cli-'))
    const file = join(dir, 'ok.sift')
    writeFileSync(file, '[card #a create] @pos(0,0) @title("起")\n[card #b create] right-of #a\n[arrow #e1] from #a to #b\n')
    const out: string[] = []
    const err: string[] = []
    const origOut = process.stdout.write
    const origErr = process.stderr.write
    process.stdout.write = ((s: string | Uint8Array) => {
      out.push(String(s))
      return true
    }) as typeof process.stdout.write
    process.stderr.write = ((s: string | Uint8Array) => {
      err.push(String(s))
      return true
    }) as typeof process.stderr.write
    try {
      expect(main(['render', file, '--svg'])).toBe(0)
      expect(out.join('')).toContain('<svg xmlns="http://www.w3.org/2000/svg"')
      expect(main(['render', file, '--json'])).toBe(2)
      expect(err.join('')).toContain('用法')
      expect(main(['validate', file, '--svg'])).toBe(2)
    } finally {
      process.stdout.write = origOut
      process.stderr.write = origErr
    }
  })
})

describe('cli:renderText(JSON Canvas 1.0)', () => {
  it('产出合法 JSON Canvas:节点用 width/height,rect 跳过留痕', () => {
    const r = renderText(SAMPLE)
    expect(r.code).toBe(0)
    const doc = JSON.parse(r.stdout) as { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] }
    // a / b / t1 成节点;rect 跳过
    expect(doc.nodes).toHaveLength(3)
    expect(doc.edges).toHaveLength(1)
    expect(doc.edges[0]).toMatchObject({ id: 'r1', fromNode: 'a', toNode: 'b', label: '支持' })
    const a = doc.nodes.find((n) => n.id === 'a')
    expect(a).toMatchObject({ type: 'text', x: 100, y: 100, width: 240, height: 120 })
    expect(a).toHaveProperty('width')
    expect(a).toHaveProperty('height')
    expect(r.stderr).toContain('rect')
  })

  it('rel 卡在 render 前已求解(#b 落绝对坐标)', () => {
    const r = renderText(SAMPLE)
    const doc = JSON.parse(r.stdout) as { nodes: { id: string; x: number; y: number }[] }
    const b = doc.nodes.find((n) => n.id === 'b')
    expect(b!.x).toBe(360)
    expect(b!.y).toBe(100)
  })
})

describe('cli:roundtripText', () => {
  it('v8 全特性样本 → STABLE(转义保真)', () => {
    const r = roundtripText(SAMPLE)
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('STABLE')
    expect(r.stderr).toBe('')
  })

  it('keepExistingPos 输入专用 op:不参与往返但留痕,其余仍 STABLE', () => {
    const r = roundtripText(`${SAMPLE}\n[card #c] @title("无位置编辑")`)
    expect(r.stdout).toContain('不参与往返')
    expect(r.stdout).toContain('STABLE')
  })

  it('结构化字段经 serialize∘parse 双往返后逐字段存活', () => {
    const r = roundtripText(SAMPLE)
    expect(r.code).toBe(0)
    // 若发散,报告会带首轮/二轮签名 diff——断言失败时输出可直接定位
    expect(r.stdout).not.toContain('DIVERGED')
  })
})
