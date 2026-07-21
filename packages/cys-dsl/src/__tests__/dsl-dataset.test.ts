import { describe, expect, it } from 'vitest'
import { parseDsl, parseDslWithDiagnostics } from '../dsl-parser'
import { serializeCanvas } from '../canvas-dsl'
import { sanitizeDslOps } from '../dsl-sanitize'
import type { CanvasElement } from '@cys-stift/canvas-engine'

/**
 * cys-dsl v5 数据集(golden fixtures)—— 代表性 DSL 样本,锁住:
 *   ① parse 鲁棒性(任何样本不抛、产出预期 op 数)
 *   ② round-trip(serialize → parse 稳定;带 content 时 title/content 保留)
 *   ③ v5 内容(@title/@content、多行 \n、转义)
 *   ④ v4 向后兼容(无内容 token 的旧 DSL 仍解析)
 * 新加文法特性时往 fixtures 补样本 —— 这就是回归数据集。
 */
const fixtures: { name: string; dsl: string; minOps: number }[] = [
  { name: 'empty', dsl: '', minOps: 0 },
  { name: 'single card', dsl: '[card #c1] @pos(10,20) @size(100,80)', minOps: 1 },
  { name: 'card v5 title+content', dsl: '[card #c1] @pos(0,0) @size(10,10) @title("T") @content("B")', minOps: 1 },
  { name: 'card v5 multiline content', dsl: '[card #c1] @pos(0,0) @size(10,10) @content("a\\nb\\nc")', minOps: 1 },
  { name: 'card create with content', dsl: '[card #c1 create] @pos(0,0) @size(10,10) @title("New")', minOps: 1 },
  {
    name: 'relational placement',
    dsl: '[card #a] @pos(0,0) @size(10,10)\n[card #b] right-of #a @gap(20) @size(10,10)',
    minOps: 2,
  },
  {
    name: 'all active kinds',
    dsl: '[card #c1] @pos(0,0) @size(10,10)\n[rect #r1] @pos(0,0) @size(10,10)\n[text #t1] @pos(0,0) @text("hi")\n[frame #f1] @pos(0,0) @size(10,10) @text("grp")\n[arrow #a1] from #c1 to #r1',
    minOps: 5,
  },
  {
    name: 'arrow full signature',
    dsl: '[arrow #a1] from #c1 to #c2 @label("ref") @color(red) @dash(dashed) @arrowhead(triangle)',
    minOps: 1,
  },
  { name: 'free arrow bbox', dsl: '[arrow #fa1] @pos(10,20) @size(100,50)', minOps: 1 },
  {
    name: 'escapes in content',
    dsl: '[card #c1] @pos(0,0) @size(10,10) @content("a\\"b\\\\c")',
    minOps: 1,
  },
  { name: 'v4 no content (backward compat)', dsl: '[card #c1] @pos(5,5) @size(20,20) @color(blue)', minOps: 1 },
  {
    name: 'comments + prose ignored',
    dsl: '# a comment\n[card #c1] @pos(0,0) @size(10,10)\nprose line\n  # title: legacy comment',
    minOps: 1,
  },
  { name: 'freedraw passthrough (no op)', dsl: '[freedraw #fd1] @pos(5,6)', minOps: 0 },
  {
    name: 'colon id + unicode title',
    dsl: '[card #ka:1] @pos(0,0) @size(10,10) @title("中文标题")',
    minOps: 1,
  },
  {
    name: 'wikilink arrow',
    dsl: '[arrow #w1] from #c1 to #c2 @label("link") @wikilink',
    minOps: 1,
  },
]

describe('cys-dsl v5 dataset (golden fixtures)', () => {
  for (const f of fixtures) {
    it(`${f.name}: parse 不抛 + ≥${f.minOps} ops`, () => {
      const ops = parseDsl(f.dsl)
      expect(ops.length).toBeGreaterThanOrEqual(f.minOps)
    })
    it(`${f.name}: parseDslWithDiagnostics 不抛`, () => {
      expect(() => parseDslWithDiagnostics(f.dsl)).not.toThrow()
    })
  }

  const rtElements: CanvasElement[] = [
    { id: 'c1', kind: 'card', x: 10, y: 20, w: 100, h: 80, rotation: 0 },
    { id: 'c2', kind: 'card', x: 30, y: 40, w: 100, h: 80, rotation: 0, color: 'red' },
    { id: 'r1', kind: 'rect', x: 0, y: 0, w: 50, h: 50, rotation: 0 },
    { id: 'a1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'c1', to: 'c2', text: 'edge' },
  ]

  it('round-trip: serialize → parse 稳定(几何,无 resolve)', () => {
    const text = serializeCanvas(rtElements)
    const ops1 = parseDsl(text)
    const ops2 = parseDsl(text)
    expect(ops1.length).toBe(ops2.length)
    expect(ops1.length).toBeGreaterThan(0)
  })

  it('round-trip: 带 content(serialize with resolve)→ parse 保留 title/content', () => {
    const resolve = (id: string) =>
      id === 'c1' ? { title: 'First', content: 'body1' } : id === 'c2' ? { title: 'Second' } : undefined
    const text = serializeCanvas(rtElements, resolve)
    const ops = parseDsl(text)
    const c1 = ops.find((o) => o.type === 'card' && (o as { cardId: string }).cardId === 'c1')
    expect(c1).toMatchObject({ title: 'First', content: 'body1' })
  })

  it('sanitize: 每个 fixture sanitize 不抛 + ops 数不增', () => {
    for (const f of fixtures) {
      const ops = parseDsl(f.dsl)
      const { ops: clean } = sanitizeDslOps(ops)
      expect(clean.length).toBeLessThanOrEqual(ops.length)
    }
  })

  it('dataset 覆盖度:v5 内容样本至少 5 个(标题/正文/多行/转义/create)', () => {
    const v5 = fixtures.filter(
      (f) => f.dsl.includes('@title') || f.dsl.includes('@content'),
    )
    expect(v5.length).toBeGreaterThanOrEqual(5)
  })
})
