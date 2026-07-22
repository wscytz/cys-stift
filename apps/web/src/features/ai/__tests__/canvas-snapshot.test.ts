import { describe, expect, it } from 'vitest'
import { snapshotCanvas, formatCanvasSnapshot } from '../canvas-snapshot'
import { parseDsl } from '@cys-stift/dsl'
import { InMemoryCanvasHost } from '@cys-stift/canvas-engine'
import type { CardService, CardId, CanvasId } from '@cys-stift/domain'

/** Minimal CardService stub — snapshotCanvas only calls service.get(id).title. */
function stubService(titles: Record<string, string>): CardService {
  return {
    get: (id: CardId) =>
      titles[String(id)]
        ? ({ id, title: titles[String(id)] } as never)
        : undefined,
  } as unknown as CardService
}

/** CardService stub 带正文 — snapshotCanvas 读 service.get(id).title/.body。 */
function stubServiceWithBody(cards: Record<string, { title?: string; body?: string }>): CardService {
  return {
    get: (id: CardId) => {
      const c = cards[String(id)]
      return c ? ({ id, title: c.title ?? '', body: c.body } as never) : undefined
    },
  } as unknown as CardService
}

const CV = 'cv' as unknown as CanvasId

describe('snapshotCanvas → formatCanvasSnapshot', () => {
  it('includes card titles (AI needs content to cluster)', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'c1', kind: 'card', x: 10, y: 20, w: 240, h: 120, rotation: 0 })
    const text = formatCanvasSnapshot(snapshotCanvas(host, stubService({ c1: 'Growth ideas' }), CV))
    expect(text).toContain('Growth ideas')
  })

  it('includeContent=true:卡片正文作为 `  content: ` 行输出(AI 看得到 body)', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'c1', kind: 'card', x: 10, y: 20, w: 240, h: 120, rotation: 0 })
    const text = formatCanvasSnapshot(
      snapshotCanvas(host, stubServiceWithBody({ c1: { title: '想法', body: '详细正文内容' } }), CV),
      { includeContent: true },
    )
    expect(text).toContain('title: 想法')
    expect(text).toContain('content: 详细正文内容')
  })

  it('includeContent 默认 false:不输出 body(省 token + 保守;反向断言)', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'c1', kind: 'card', x: 10, y: 20, w: 240, h: 120, rotation: 0 })
    const text = formatCanvasSnapshot(
      snapshotCanvas(host, stubServiceWithBody({ c1: { title: '想法', body: '秘密正文' } }), CV),
    )
    expect(text).toContain('title: 想法')
    expect(text).not.toContain('秘密正文')
    expect(text).not.toContain('content:')
  })

  it('includeContent 行 round-trip 安全:parser 静默跳过 content 注释行', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'c1', kind: 'card', x: 10, y: 20, w: 240, h: 120, rotation: 0 })
    const text = formatCanvasSnapshot(
      snapshotCanvas(host, stubServiceWithBody({ c1: { title: 'A', body: '正文行不破坏 parse' } }), CV),
      { includeContent: true },
    )
    const ops = parseDsl(text)
    expect(ops.length).toBeGreaterThanOrEqual(1)
  })

  it('renders arrows + rect + text with the unified grammar', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
    host.upsert({ id: 'c2', kind: 'card', x: 100, y: 0, w: 10, h: 10, rotation: 0 })
    host.upsert({
      id: 'a1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0,
      from: 'c1', to: 'c2', text: 'blocks',
    })
    host.upsert({ id: 'r1', kind: 'rect', x: 50, y: 50, w: 200, h: 100, rotation: 0 })
    host.upsert({ id: 't1', kind: 'text', x: 5, y: 6, w: 0, h: 0, rotation: 0, text: 'note' })

    const text = formatCanvasSnapshot(snapshotCanvas(host, stubService({ c1: 'A', c2: 'B' }), CV))
    expect(text).toContain('[arrow #a1] from #c1 to #c2 @label("blocks")')
    expect(text).toContain('[rect #r1] @pos(50.0,50.0) @size(200.0,100.0)')
    expect(text).toContain('[text #t1] @pos(5.0,6.0) @text("note")')
  })

  it('renders arrow relation signature (color + dash + arrowhead) — AI 改签名需看到现状', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 10, h: 10, rotation: 0 })
    host.upsert({ id: 'c2', kind: 'card', x: 100, y: 0, w: 10, h: 10, rotation: 0 })
    host.upsert({
      id: 'a1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0,
      from: 'c1', to: 'c2', color: 'blue', dash: 'dashed', arrowhead: 'none',
    })
    const snap = snapshotCanvas(host, stubService({ c1: 'A', c2: 'B' }), CV)
    expect(snap.arrows[0]?.color).toBe('blue')
    expect(snap.arrows[0]?.dash).toBe('dashed')
    expect(snap.arrows[0]?.arrowhead).toBe('none')
    const text = formatCanvasSnapshot(snap)
    expect(text).toContain('@color(blue)')
    expect(text).toContain('@dash(dashed)')
    expect(text).toContain('@arrowhead(none)')
  })

  it('formatCanvasSnapshot output is parseable for all active kinds (round-trip via parseDsl)', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'c1', kind: 'card', x: 10, y: 20, w: 240, h: 120, rotation: 0, color: 'blue' })
    host.upsert({ id: 'c2', kind: 'card', x: 300, y: 20, w: 240, h: 120, rotation: 0 })
    host.upsert({ id: 'r1', kind: 'rect', x: 50, y: 50, w: 200, h: 100, rotation: 0, color: 'red' })
    host.upsert({ id: 't1', kind: 'text', x: 5, y: 6, w: 0, h: 0, rotation: 0, text: 'note' })
    host.upsert({
      id: 'a1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0,
      from: 'c1', to: 'c2', text: 'blocks',
    })
    host.upsert({ id: 'f1', kind: 'freedraw', x: 7, y: 8, w: 0, h: 0, rotation: 0 })

    const text = formatCanvasSnapshot(snapshotCanvas(host, stubService({ c1: 'A', c2: 'B' }), CV))
    const ops = parseDsl(text)

    // 2 cards + 1 rect + 1 text + 1 arrow = 5 ops; freedraw has NO parser branch → skipped.
    expect(ops).toHaveLength(5)

    // card op (with cardId)
    expect(ops.find((o) => o.type === 'card' && o.cardId === 'c1')).toBeDefined()
    // free rect op (with #id round-tripped)
    expect(ops.find((o) => o.type === 'free' && o.shape === 'rect' && o.id === 'r1')).toBeDefined()
    // free text op (with #id round-tripped)
    expect(ops.find((o) => o.type === 'free' && o.shape === 'text' && o.id === 't1')).toBeDefined()
    // relation arrow op (from/to round-tripped)
    expect(ops.find((o) => o.type === 'arrow' && o.from === 'c1' && o.to === 'c2')).toBeDefined()
  })

  it('formatCanvasSnapshot card line matches serializeCanvas grammar (comma size, @color)', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'c1', kind: 'card', x: 10, y: 20, w: 240, h: 120, rotation: 0, color: 'blue' })
    const text = formatCanvasSnapshot(snapshotCanvas(host, stubService({ c1: 'A' }), CV))
    // 逗号 size(非叉号 x)、@color()(非 ", color")、pos 无空格。
    expect(text).toContain('[card #c1] @pos(10.0,20.0) @size(240.0,120.0) @color(blue)')
    expect(text).not.toContain('@size(240x120)')
    expect(text).not.toContain(', color blue')
  })

  it('formatCanvasSnapshot rect line has #id and @color', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'r1', kind: 'rect', x: 50, y: 50, w: 200, h: 100, rotation: 0, color: 'red' })
    const text = formatCanvasSnapshot(snapshotCanvas(host, stubService({}), CV))
    expect(text).toContain('[rect #r1] @pos(50.0,50.0) @size(200.0,100.0) @color(red)')
    expect(text).not.toContain('@size(200x100)')
  })
})

describe('canvas snapshot — privacy reverse-asserts (R2 + allowlist)', () => {
  it('never includes deviceId', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'c1', kind: 'card', x: 0, y: 0, w: 1, h: 1, rotation: 0 })
    const text = formatCanvasSnapshot(snapshotCanvas(host, stubService({ c1: 'x' }), CV))
    expect(text).not.toContain('deviceId')
    expect(text).not.toContain('device')
  })

  it('freedraw emits position only — NEVER the point sequence', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({
      id: 'f1', kind: 'freedraw', x: 5, y: 6, w: 0, h: 0, rotation: 0,
      meta: { segments: [{ points: [{ x: 123, y: 456 }, { x: 789, y: 12 }] }] },
    })
    const text = formatCanvasSnapshot(snapshotCanvas(host, stubService({}), CV))
    expect(text).toContain('[freedraw #f1] @pos(5.0,6.0)')
    // The actual point coordinates must never reach the AI view.
    expect(text).not.toContain('123')
    expect(text).not.toContain('456')
    expect(text).not.toContain('789')
    expect(text).not.toContain('points')
  })

  it('a card missing from CardService renders as (untitled), no crash', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'ghost', kind: 'card', x: 0, y: 0, w: 1, h: 1, rotation: 0 })
    const text = formatCanvasSnapshot(snapshotCanvas(host, stubService({}), CV))
    expect(text).toContain('(untitled)')
    // Soft-deleted cards never get here in production — canvas-binding removes
    // them from the host; this just confirms a missing title degrades safely.
  })
})

// ── freedraw shape descriptor (R2-safe: discrete label + scalar ratios, NEVER points) ──

/** A clean circle point sequence (page coords) — recognizable by recognizeShape. */
function circlePath(cx: number, cy: number, r: number, n = 48): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
  }
  return pts
}

describe('canvas snapshot — freedraw shape descriptor', () => {
  it('a recognizable freedraw carries shape + shapeConfidence + features', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({
      id: 'f1', kind: 'freedraw', x: 100, y: 100, w: 0, h: 0, rotation: 0,
      meta: { points: circlePath(150, 150, 50) },
    })
    const snap = snapshotCanvas(host, stubService({}), CV)
    const f = snap.freeShapes.find((s) => s.kind === 'freedraw')
    expect(f).toBeDefined()
    expect(f!.kind).toBe('freedraw')
    if (f!.kind === 'freedraw') {
      // circle is the expected recognized shape; confidence should be positive.
      expect(['circle', 'rect', 'triangle', 'check', 'arrow', 'unknown']).toContain(f!.shape)
      // For a clean circle, the descriptor should NOT stay unknown.
      expect(f!.shape).not.toBe('unknown')
      expect(f!.shapeConfidence).toBeGreaterThan(0)
      // features are 4 scalar ratios (privacy-safe), present with all keys.
      expect(f!.features).toBeDefined()
      expect(Object.keys(f!.features!).sort()).toEqual(
        ['closure', 'elongation', 'pointCount', 'straightness'],
      )
    }
  })

  it('a degenerate freedraw (1 point) does not throw and still captures position', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({
      id: 'f1', kind: 'freedraw', x: 7, y: 8, w: 0, h: 0, rotation: 0,
      meta: { points: [[5, 5]] },
    })
    // Must not throw.
    const snap = snapshotCanvas(host, stubService({}), CV)
    const f = snap.freeShapes.find((s) => s.kind === 'freedraw')
    expect(f).toBeDefined()
    expect(f!.x).toBe(7)
    expect(f!.y).toBe(8)
    // shape may be undefined or 'unknown' — but no crash either way.
    if (f!.kind === 'freedraw') {
      expect(['circle', 'rect', 'triangle', 'check', 'arrow', 'unknown', undefined]).toContain(
        f!.shape,
      )
    }
  })

  it('R2 privacy: snapshot text NEVER contains interior point coordinates', () => {
    const host = new InMemoryCanvasHost()
    // Interior point 200,200 is deliberately distinct from the bbox pos and from
    // any rounded boundary number — it must not survive into the AI text.
    host.upsert({
      id: 'f1', kind: 'freedraw', x: 100, y: 100, w: 0, h: 0, rotation: 0,
      meta: { points: [[100, 100], [200, 200], [300, 100]] },
    })
    const text = formatCanvasSnapshot(snapshotCanvas(host, stubService({}), CV))
    // Position still captured.
    expect(text).toContain('[freedraw #f1]')
    // The interior coordinate "200" must never appear — only the single @pos.
    expect(text).not.toContain('200')
    // No point-array serialization leaks through.
    expect(text).not.toContain('points')
  })

  it('a recognized freedraw emits a `shape:` annotation line', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({
      id: 'f1', kind: 'freedraw', x: 100, y: 100, w: 0, h: 0, rotation: 0,
      meta: { points: circlePath(150, 150, 50) },
    })
    const text = formatCanvasSnapshot(snapshotCanvas(host, stubService({}), CV))
    expect(text).toContain('[freedraw #f1] @pos(100.0,100.0)')
    // The shape annotation line mirrors the card `title:` pattern.
    expect(text).toMatch(/shape: \w+ \(\d+%\)/)
  })
})
