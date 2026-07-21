import { describe, expect, it } from 'vitest'
import { serializeCanvas } from '@cys-stift/dsl'
import { parseDsl } from '@cys-stift/dsl'
import { applyLayout } from '../../canvas/apply-layout'
import { snapshotCanvas, formatCanvasSnapshot } from '../canvas-snapshot'
import { InMemoryCanvasHost } from '@cys-stift/canvas-engine'
import type { CanvasElement } from '@cys-stift/canvas-engine'
import type { CardService, CardId, CanvasId } from '@cys-stift/domain'

/**
 * End-to-end round-trip — the real `serializeCanvas → parseDsl → applyLayout`
 * link exercised through InMemoryCanvasHost, then re-serialized and compared
 * byte-for-byte. Unlike dsl-roundtrip.test.ts (which stops at serialize →
 * parse), this suite drives the parsed ops back into a host via applyLayout
 * (update-by-id) and proves the canvas is unchanged afterwards — the actual
 * "translit" losslessness guarantee.
 *
 * Flow per case: pre-seed elements → serialize → parse → apply (same host,
 * update) → re-serialize → assert equal to the original. Lossless on all 5
 * active kinds; freedraw is the deliberate asymmetry (parser has no freedraw
 * branch — its point sequence stays in the engine store, never reaching AI).
 */
function roundTrip(host: InMemoryCanvasHost, elements: CanvasElement[]) {
  for (const e of elements) host.upsert(e)
  const original = serializeCanvas(host.getElements())
  const ops = parseDsl(original)
  applyLayout(host, ops) // update existing elements in place (same ids)
  const roundtripped = serializeCanvas(host.getElements())
  return { original, roundtripped, ops }
}

/** Minimal CardService stub — snapshotCanvas only calls service.get(id).title. */
function stubService(titles: Record<string, string>): CardService {
  return {
    get: (id: CardId) =>
      titles[String(id)]
        ? ({ id, title: titles[String(id)] } as never)
        : undefined,
  } as unknown as CardService
}

const CV = 'cv' as unknown as CanvasId

describe('DSL end-to-end round-trip (serialize → parse → apply → re-serialize)', () => {
  it('card e2e round-trip (pos + size + color preserved through apply)', () => {
    const host = new InMemoryCanvasHost()
    const { original, roundtripped } = roundTrip(host, [
      { id: 'c1', kind: 'card', x: 100, y: 200, w: 240, h: 120, rotation: 0, color: 'blue' },
    ])
    expect(original).toBe('[card #c1] @pos(100.0,200.0) @size(240.0,120.0) @color(blue)')
    expect(roundtripped).toBe(original)
  })

  it('rect e2e round-trip (id + pos + size + color preserved through apply)', () => {
    const host = new InMemoryCanvasHost()
    const { original, roundtripped } = roundTrip(host, [
      { id: 'r1', kind: 'rect', x: 10, y: 20, w: 300, h: 400, rotation: 0, color: 'red' },
    ])
    expect(original).toBe('[rect #r1] @pos(10.0,20.0) @size(300.0,400.0) @color(red)')
    expect(roundtripped).toBe(original)
  })

  it('frame e2e round-trip (id + pos + size + title + color preserved through apply)', () => {
    const host = new InMemoryCanvasHost()
    const { original, roundtripped } = roundTrip(host, [
      { id: 'f1', kind: 'frame', x: 10, y: 20, w: 400, h: 300, rotation: 0, text: '主题区', color: 'blue' },
    ])
    expect(original).toBe('[frame #f1] @pos(10.0,20.0) @size(400.0,300.0) @text("主题区") @color(blue)')
    expect(roundtripped).toBe(original)
  })

  it('text e2e round-trip (id + pos + escaped text + color; @size not serialized)', () => {
    const host = new InMemoryCanvasHost()
    const { original, roundtripped } = roundTrip(host, [
      { id: 't1', kind: 'text', x: 5, y: 6, w: 0, h: 0, rotation: 0, text: 'say "hi"', color: 'red' },
    ])
    // text branch emits pos + @text (quotes escaped) + color; NO @size.
    expect(original).toBe('[text #t1] @pos(5.0,6.0) @text("say \\"hi\\"") @color(red)')
    expect(roundtripped).toBe(original)
  })

  it('relation arrow e2e round-trip (from/to + signature preserved through apply)', () => {
    const host = new InMemoryCanvasHost()
    const { original, roundtripped } = roundTrip(host, [
      { id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 },
      { id: 'c2', kind: 'card', x: 100, y: 0, w: 10, h: 10, rotation: 0 },
      {
        id: 'a1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0,
        from: 'c1', to: 'c2', text: 'references', color: 'red', dash: 'dashed', arrowhead: 'triangle',
      },
    ])
    // Layer order: card(2) < arrow(3) → cards first, then the relation arrow.
    expect(original).toBe(
      '[card #c1] @pos(0.0,0.0) @size(10.0,10.0)\n' +
      '[card #c2] @pos(100.0,0.0) @size(10.0,10.0)\n' +
      '[arrow #a1] from #c1 to #c2 @label("references") @color(red) @dash(dashed) @arrowhead(triangle)',
    )
    expect(roundtripped).toBe(original)
  })

  it('free arrow e2e round-trip (positive size bbox + signature preserved)', () => {
    const host = new InMemoryCanvasHost()
    const { original, roundtripped } = roundTrip(host, [
      { id: 'fa1', kind: 'arrow', x: 10, y: 20, w: 100, h: 50, rotation: 0, dash: 'solid', arrowhead: 'arrow' },
    ])
    expect(original).toBe('[arrow #fa1] @pos(10.0,20.0) @size(100.0,50.0) @dash(solid) @arrowhead(arrow)')
    expect(roundtripped).toBe(original)
  })

  it('free arrow e2e round-trip (negative size direction preserved)', () => {
    const host = new InMemoryCanvasHost()
    const { original, roundtripped } = roundTrip(host, [
      { id: 'fa2', kind: 'arrow', x: 200, y: 200, w: -80, h: 30, rotation: 0 },
    ])
    expect(original).toBe('[arrow #fa2] @pos(200.0,200.0) @size(-80.0,30.0)')
    expect(roundtripped).toBe(original)
  })

  it('relation arrow route=curve e2e round-trip (route + @curve byte-equal through apply)', () => {
    const host = new InMemoryCanvasHost()
    const { original, roundtripped } = roundTrip(host, [
      { id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 },
      { id: 'c2', kind: 'card', x: 100, y: 0, w: 10, h: 10, rotation: 0 },
      { id: 'a1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'c1', to: 'c2', route: 'curve', curve: { cx: 55, cy: -30 } },
    ])
    expect(original).toContain('[arrow #a1] from #c1 to #c2 @curve(55.0,-30.0) @route(curve)')
    expect(roundtripped).toBe(original)
  })

  it('relation arrow route=elbow e2e round-trip (2 corners, negatives, byte-equal)', () => {
    const host = new InMemoryCanvasHost()
    const { original, roundtripped } = roundTrip(host, [
      { id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 },
      { id: 'c2', kind: 'card', x: 200, y: 200, w: 10, h: 10, rotation: 0 },
      { id: 'a1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'c1', to: 'c2', route: 'elbow', elbow: [{ x: 100, y: 0 }, { x: 100, y: -50 }] },
    ])
    expect(original).toContain('[arrow #a1] from #c1 to #c2 @route(elbow) @elbow(100.0,0.0;100.0,-50.0)')
    expect(roundtripped).toBe(original)
  })

  it('wikilink arrow e2e round-trip (@wikilink marker survives serialize→parse→apply→re-serialize)', () => {
    const host = new InMemoryCanvasHost()
    const { original, roundtripped } = roundTrip(host, [
      { id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 },
      { id: 'c2', kind: 'card', x: 100, y: 0, w: 10, h: 10, rotation: 0 },
      {
        id: 'a1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0,
        from: 'c1', to: 'c2', text: 'references', color: 'blue', dash: 'dashed', arrowhead: 'none',
        meta: { wikilink: true },
      },
    ])
    // The @wikilink marker must round-trip losslessly through the full pipeline.
    expect(original).toContain('@wikilink')
    expect(roundtripped).toBe(original)
    // The host's arrow must retain meta.wikilink after apply (re-serializer reads from element.meta).
    const arrowEl = host.getElement('a1')
    expect(arrowEl?.meta?.wikilink).toBe(true)
  })

  it('free arrow route=elbow e2e round-trip (bbox + route + elbow byte-equal)', () => {
    const host = new InMemoryCanvasHost()
    const { original, roundtripped } = roundTrip(host, [
      { id: 'fa1', kind: 'arrow', x: 10, y: 20, w: 100, h: 50, rotation: 0, route: 'elbow', elbow: [{ x: 60, y: 20 }] },
    ])
    expect(original).toBe('[arrow #fa1] @pos(10.0,20.0) @size(100.0,50.0) @route(elbow) @elbow(60.0,20.0)')
    expect(roundtripped).toBe(original)
  })

  it('freedraw is NOT round-tripped by parse/apply (guard — host retains it untouched)', () => {
    const host = new InMemoryCanvasHost()
    const { original, roundtripped, ops } = roundTrip(host, [
      {
        id: 'f1', kind: 'freedraw', x: 7, y: 8, w: 0, h: 0, rotation: 0,
        meta: { segments: [{ points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }] },
      },
    ])
    // serialize emits position only (point sequence stays in the engine store).
    expect(original).toBe('[freedraw #f1] @pos(7.0,8.0)')
    // parser has no freedraw branch → zero ops produced from a freedraw-only canvas.
    expect(ops).toHaveLength(0)
    expect(ops.filter((o) => o.type === 'free' && (o as { shape?: string }).shape === 'freedraw')).toHaveLength(0)
    // apply ran with no ops → the host's freedraw is untouched; re-serialize still emits it.
    // The guard proves "parse doesn't reproduce freedraw", NOT "freedraw disappears".
    expect(roundtripped).toBe('[freedraw #f1] @pos(7.0,8.0)')
    expect(roundtripped).toBe(original)
  })

  it('full canvas e2e round-trip (all active kinds together + freedraw)', () => {
    const host = new InMemoryCanvasHost()
    const { original, roundtripped } = roundTrip(host, [
      { id: 'c1', kind: 'card', x: 100, y: 200, w: 240, h: 120, rotation: 0, color: 'blue' },
      { id: 'c2', kind: 'card', x: 300, y: 200, w: 240, h: 120, rotation: 0 },
      { id: 'r1', kind: 'rect', x: 10, y: 20, w: 300, h: 400, rotation: 0, color: 'red' },
      { id: 't1', kind: 'text', x: 5, y: 6, w: 0, h: 0, rotation: 0, text: 'note', color: 'red' },
      {
        id: 'a1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0,
        from: 'c1', to: 'c2', text: 'references', color: 'red', dash: 'dashed', arrowhead: 'triangle',
      },
      { id: 'fa1', kind: 'arrow', x: 10, y: 20, w: 100, h: 50, rotation: 0, dash: 'solid', arrowhead: 'arrow' },
      { id: 'f1', kind: 'freedraw', x: 7, y: 8, w: 0, h: 0, rotation: 0 },
    ])
    // 7 DSL lines (rect, freedraw, 2×card, 2×arrow, text) — byte-equal after the full loop.
    expect(roundtripped.split('\n')).toHaveLength(7)
    expect(roundtripped).toBe(original)
    // every active kind survives (freedraw too — it stays in the host, untouched).
    expect(roundtripped).toContain('[rect #r1] @pos(10.0,20.0) @size(300.0,400.0) @color(red)')
    expect(roundtripped).toContain('[freedraw #f1] @pos(7.0,8.0)')
    expect(roundtripped).toContain('[card #c1] @pos(100.0,200.0) @size(240.0,120.0) @color(blue)')
    expect(roundtripped).toContain('[card #c2] @pos(300.0,200.0) @size(240.0,120.0)')
    expect(roundtripped).toContain('[arrow #a1] from #c1 to #c2 @label("references") @color(red) @dash(dashed) @arrowhead(triangle)')
    expect(roundtripped).toContain('[arrow #fa1] @pos(10.0,20.0) @size(100.0,50.0) @dash(solid) @arrowhead(arrow)')
    expect(roundtripped).toContain('[text #t1] @pos(5.0,6.0) @text("note") @color(red)')
  })
})

describe('DSL e2e via production serializer (formatCanvasSnapshot → parse → apply → re-format)', () => {
  it('all active kinds round-trip through the production snapshot (incl. free arrow bbox)', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'c1', kind: 'card', x: 10, y: 20, w: 240, h: 120, rotation: 0, color: 'blue' })
    host.upsert({ id: 'c2', kind: 'card', x: 300, y: 20, w: 240, h: 120, rotation: 0 })
    host.upsert({ id: 'r1', kind: 'rect', x: 50, y: 50, w: 200, h: 100, rotation: 0, color: 'red' })
    host.upsert({ id: 't1', kind: 'text', x: 5, y: 6, w: 0, h: 0, rotation: 0, text: 'note', color: 'red' })
    host.upsert({
      id: 'a1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0,
      from: 'c1', to: 'c2', text: 'blocks', color: 'blue', dash: 'dashed', arrowhead: 'none',
    })
    // 自由箭头(无 from/to,bbox 编码,负 w 表方向):SnapshotArrow 现携带 bbox,生产链路无损。
    host.upsert({ id: 'fa1', kind: 'arrow', x: 10, y: 20, w: 100, h: -50, rotation: 0, dash: 'solid', arrowhead: 'arrow' })
    host.upsert({ id: 'f1', kind: 'freedraw', x: 7, y: 8, w: 0, h: 0, rotation: 0 })

    const service = stubService({ c1: 'A', c2: 'B' })
    const original = formatCanvasSnapshot(snapshotCanvas(host, service, CV))
    const ops = parseDsl(original)
    // 2 cards + 1 rect + 1 text + 1 relation arrow + 1 free arrow = 6 ops; freedraw has no parser branch.
    expect(ops).toHaveLength(6)
    applyLayout(host, ops) // update existing elements in place (same ids)
    const roundtripped = formatCanvasSnapshot(snapshotCanvas(host, service, CV))

    expect(roundtripped).toBe(original)
    expect(roundtripped).toContain('[card #c1] @pos(10.0,20.0) @size(240.0,120.0) @color(blue)')
    expect(roundtripped).toContain('  title: A')
    expect(roundtripped).toContain('[arrow #a1] from #c1 to #c2 @label("blocks") @color(blue) @dash(dashed) @arrowhead(none)')
    expect(roundtripped).toContain('[arrow #fa1] @pos(10.0,20.0) @size(100.0,-50.0) @dash(solid) @arrowhead(arrow)')
    expect(roundtripped).toContain('[freedraw #f1] @pos(7.0,8.0)')
  })
})
