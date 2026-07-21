import { describe, expect, it } from 'vitest'
import { InMemoryCanvasHost } from '@cys-stift/canvas-engine'
import { serializeCanvas } from '@cys-stift/dsl'
import { DSL_VERSION } from '@cys-stift/dsl'
import { parseDsl } from '@cys-stift/dsl'
import { sanitizeDslOps } from '@cys-stift/dsl'
import { solveRelational } from '../relational-solver'
import { applyLayout, buildApplyPlan } from '../../canvas/apply-layout'

describe('cys-dsl v5 stability contract', () => {
  it('round-trips quote, backslash, Unicode, and colon ids canonically', () => {
    expect(DSL_VERSION).toBe(5)

    const source = new InMemoryCanvasHost()
    source.upsert({ id: 'card:from', kind: 'card', x: 0, y: 0, w: 100, h: 80, rotation: 0 })
    source.upsert({ id: 'card:to', kind: 'card', x: 200, y: 0, w: 100, h: 80, rotation: 0 })
    source.upsert({
      id: 'arrow:quoted',
      kind: 'arrow',
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      rotation: 0,
      from: 'card:from',
      to: 'card:to',
      text: '他说 "继续"，路径 C:\\资料\\草稿',
    })

    const canonical = serializeCanvas(source.getElements())
    const ops = parseDsl(canonical)
    expect(ops.find((op) => op.type === 'arrow')).toMatchObject({
      id: 'arrow:quoted',
      from: 'card:from',
      to: 'card:to',
      label: '他说 "继续"，路径 C:\\资料\\草稿',
    })

    const target = new InMemoryCanvasHost()
    target.upsert({ id: 'card:from', kind: 'card', x: 0, y: 0, w: 100, h: 80, rotation: 0 })
    target.upsert({ id: 'card:to', kind: 'card', x: 200, y: 0, w: 100, h: 80, rotation: 0 })
    applyLayout(target, ops)
    expect(target.getElement('arrow:quoted')).toMatchObject({
      from: 'card:from',
      to: 'card:to',
      text: '他说 "继续"，路径 C:\\资料\\草稿',
    })
    expect(serializeCanvas(target.getElements())).toBe(canonical)
  })

  it('uses colon ids in card headers, relational anchors, and arrow endpoints', () => {
    const host = new InMemoryCanvasHost()
    const ops = parseDsl(
      '[card #anchor:1 create] @pos(10,20) @size(100,80)\n' +
        '[card #child:1 create] right-of #anchor:1 @gap(20) @size(100,80)\n' +
        '[arrow #edge:1] from #anchor:1 to #child:1',
    )

    const report = applyLayout(host, ops)
    expect(report.failed).toBe(0)
    expect(host.getElement('child:1')).toMatchObject({ x: 130, y: 20 })
    expect(host.getElement('edge:1')).toMatchObject({
      kind: 'arrow',
      from: 'anchor:1',
      to: 'child:1',
    })
  })

  it('preserves requested relation and free-arrow ids on an empty freeform host', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'c:1', kind: 'card', x: 0, y: 0, w: 100, h: 80, rotation: 0 })
    host.upsert({ id: 'c:2', kind: 'card', x: 200, y: 0, w: 100, h: 80, rotation: 0 })

    const source = new InMemoryCanvasHost()
    source.upsert({ id: 'c:1', kind: 'card', x: 0, y: 0, w: 100, h: 80, rotation: 0 })
    source.upsert({ id: 'c:2', kind: 'card', x: 200, y: 0, w: 100, h: 80, rotation: 0 })
    source.upsert({ id: 'relation:1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'c:1', to: 'c:2', text: '关系' })
    source.upsert({ id: 'free:1', kind: 'arrow', x: 20, y: 30, w: -40, h: 50, rotation: 0, text: '自由' })
    const canonical = serializeCanvas(source.getElements())
    const report = applyLayout(host, parseDsl(canonical))

    expect(report.applied).toBe(4)
    expect(report.freeformChanged).toBe(2)
    expect(host.getElement('relation:1')).toMatchObject({ kind: 'arrow', from: 'c:1', to: 'c:2' })
    expect(host.getElement('free:1')).toMatchObject({ kind: 'arrow', x: 20, y: 30, w: -40, h: 50 })
    expect(serializeCanvas(host.getElements())).toBe(canonical)
  })

  it('builds an apply plan without mutating the host', () => {
    const host = new InMemoryCanvasHost()
    const before = host.getElements()
    const plan = buildApplyPlan(host, parseDsl('[rect #r:1] @pos(10,20) @size(30,40)'))

    expect(plan.items).toHaveLength(1)
    expect(plan.items[0]).toMatchObject({ opIndex: 0, disposition: 'ready' })
    expect(host.getElements()).toEqual(before)
  })

  it('reports an arrow id conflict instead of silently minting a replacement id', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'c:1', kind: 'card', x: 0, y: 0, w: 100, h: 80, rotation: 0 })
    host.upsert({ id: 'c:2', kind: 'card', x: 200, y: 0, w: 100, h: 80, rotation: 0 })
    host.upsert({ id: 'edge:1', kind: 'rect', x: 0, y: 200, w: 100, h: 80, rotation: 0 })

    const report = applyLayout(
      host,
      parseDsl('[arrow #edge:1] from #c:1 to #c:2'),
    )

    expect(report).toMatchObject({ applied: 0, skipped: 1, failed: 0 })
    expect(report.opResults[0]).toMatchObject({
      status: 'skipped',
      reason: expect.stringMatching(/id conflict/),
    })
    expect(host.getElements().filter((element) => element.kind === 'arrow')).toHaveLength(0)
  })
})

describe('relational coordinate policy', () => {
  it('clamps negative and extreme gaps before solving', () => {
    const ops = parseDsl(
      '[card #a create] right-of #anchor @gap(-50)\n' +
        '[card #b create] below #anchor @gap(999999)',
    )
    const { ops: clean, diagnostics } = sanitizeDslOps(ops)
    const cards = clean.filter((op) => op.type === 'card')

    expect(cards[0]?.rel?.gap).toBe(0)
    expect(cards[1]?.rel?.gap).toBeLessThan(999999)
    expect(diagnostics.filter((d) => /gap/.test(d.message))).toHaveLength(2)
  })

  it('post-validates edge anchors and long collision chains within coordinate bounds', () => {
    const existing = new Map([['edge', { x: 10000, y: 10000, w: 240, h: 120 }]])
    const ops = parseDsl(
      Array.from({ length: 12 }, (_, i) =>
        `[card #c${i} create] right-of #${i === 0 ? 'edge' : `c${i - 1}`} @gap(2000)`,
      ).join('\n'),
    )
    const sanitized = sanitizeDslOps(ops)
    const solved = solveRelational(sanitized.ops, existing)

    for (const op of solved.ops) {
      if (op.type !== 'card') continue
      expect(op.x).toBeGreaterThanOrEqual(-10000)
      expect(op.x).toBeLessThanOrEqual(10000)
      expect(op.y).toBeGreaterThanOrEqual(-10000)
      expect(op.y).toBeLessThanOrEqual(10000)
    }
    expect(solved.diagnostics.some((d) => /coordinate|坐标|边界/.test(d.message))).toBe(true)
  })
})
