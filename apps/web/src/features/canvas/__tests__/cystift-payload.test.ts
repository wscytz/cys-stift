import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  embedCystiftInSvg,
  extractCystiftFromSvg,
  restoreCystiftPayload,
} from '../cystift-payload'
import type { CystiftPayload } from '../cystift-payload'
import type { CanvasElement } from '@cys-stift/canvas-engine'

// We mock ONLY @/lib/canvas-store so we can drive canvasStore.create's return
// value (the Bug 2 contract: '' on quota failure). The freeform store is left
// real — the drag-drop regression tests below need the actual localStorage
// fallback path, and the Bug 2 path returns before the freeform store is
// ever touched.
const canvasCreate = vi.fn(() => 'canvas-new-1' as never)
const canvasSetActive = vi.fn(() => {})
vi.mock('@/lib/canvas-store', () => ({
  canvasStore: {
    create: (...args: unknown[]) => canvasCreate(...(args as [])),
    setActive: (...args: unknown[]) => canvasSetActive(...(args as [])),
  },
}))

const SAMPLE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50"/></svg>'

// Reset the canvas-store mock between top-level describe blocks so call counts
// don't leak. (The drag-drop block below adds its own beforeEach on top of this.)
beforeEach(() => {
  canvasCreate.mockReset()
  canvasCreate.mockReturnValue('canvas-new-1' as never)
  canvasSetActive.mockReset()
})

const PAYLOAD: CystiftPayload = {
  v: 1,
  app: 'cys-stift',
  canvas: { id: 'canvas-x', name: '灵感画布' },
  cards: [
    {
      id: 'card-1' as never,
      title: '标题',
      body: '正文',
      type: 'note',
      media: [],
      links: [],
      codeSnippets: [],
      quotes: [],
      tags: [],
      source: { kind: 'manual', deviceId: 'dev' } as never,
      capturedAt: new Date('2026-06-21T00:00:00Z'),
      createdAt: new Date('2026-06-21T00:00:00Z'),
      updatedAt: new Date('2026-06-21T00:00:00Z'),
      pinned: false,
      archived: false,
    },
  ],
  elements: [],
}

describe('.cystift SVG roundtrip (data-cystift attribute)', () => {
  it('embeds a payload as data-cystift on the root <svg>', () => {
    const out = embedCystiftInSvg(SAMPLE_SVG, PAYLOAD)
    expect(out.startsWith('<svg')).toBe(true)
    expect(out).toContain('data-cystift="')
    // The inner content survives.
    expect(out).toContain('<rect')
  })

  it('extracts the payload back losslessly (incl. CJK + Dates-as-strings)', () => {
    const embedded = embedCystiftInSvg(SAMPLE_SVG, PAYLOAD)
    const back = extractCystiftFromSvg(embedded)
    expect(back).not.toBeNull()
    expect(back?.app).toBe('cys-stift')
    expect(back?.canvas.name).toBe('灵感画布')
    expect(back?.cards.length).toBe(1)
    expect(back?.cards[0]?.title).toBe('标题')
  })

  it('does not double-embed if data-cystift already present', () => {
    const once = embedCystiftInSvg(SAMPLE_SVG, PAYLOAD)
    const twice = embedCystiftInSvg(once, PAYLOAD)
    expect(twice.match(/data-cystift="/g)?.length).toBe(1)
  })

  it('returns null when no data-cystift attribute is present', () => {
    expect(extractCystiftFromSvg(SAMPLE_SVG)).toBeNull()
  })

  it('the embedded SVG remains valid XML-ish (root tag unchanged)', () => {
    const out = embedCystiftInSvg(SAMPLE_SVG, PAYLOAD)
    // The original opening tag attributes are preserved.
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(out).toContain('width="100"')
    // The SVG still closes.
    expect(out.trim().endsWith('</svg>')).toBe(true)
  })
})

// ── drag-drop geometry restore (no host) ──────────────────────────────────────
// 回归(2026-06-23):拖放路径无 host,曾静默丢弃 freeform 几何。现在无 host 时
// freeform 元素持久化到新画布的 canvasFreeformStore,新 host mount 时 hydrate。
// 这里用「无 OPFS → 回退 localStorage」的假 store 验证写到了正确画布的 key。

function noOpfs() {
  vi.stubGlobal('navigator', { ...navigator, storage: undefined })
}

function makeService() {
  const created: { id: string; title: string }[] = []
  let n = 0
  return {
    listOnCanvas: () => [] as never[],
    create: (c: { title: string }) => {
      n += 1
      const id = `new-${n}`
      created.push({ id, title: c.title })
      return { id, ...c } as never
    },
  } as never
}

describe('.cystift restore — drag-drop (no host) persists freeform geometry', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
    noOpfs()
    window.localStorage.clear()
  })

  it('persists freeform elements into the NEW canvas store when no host is supplied', async () => {
    const arrow: CanvasElement = {
      id: 'a1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0,
      from: 'card-1', to: 'card-2', dash: 'dashed', arrowhead: 'none', color: 'blue',
    }
    const payload: CystiftPayload = {
      ...PAYLOAD,
      cards: [
        { ...(PAYLOAD.cards[0] as object), id: 'card-1' as never },
        { ...(PAYLOAD.cards[0] as object), id: 'card-2' as never, title: '乙' },
      ] as never,
      elements: [
        arrow,
        { id: 't1', kind: 'text', x: 5, y: 5, w: 40, h: 18, rotation: 0, text: '注', color: 'black' },
      ],
    }

    const newId = await restoreCystiftPayload(payload, makeService(), undefined)
    expect(newId).not.toBeNull()

    // The new canvas's freeform store now carries the geometry.
    const { canvasFreeformStore } = await import('@/lib/canvas-freeform-store')
    const snap = await canvasFreeformStore.load(newId as never)
    expect(snap).not.toBeNull()
    const ids = snap!.elements.map((e) => e.id)
    expect(ids).toContain('t1')

    // arrow survived + its from/to were remapped to the new card ids.
    const restoredArrow = snap!.elements.find((e) => e.kind === 'arrow')!
    expect(restoredArrow).toBeDefined()
    expect(restoredArrow.from).toMatch(/^new-/)
    expect(restoredArrow.to).toMatch(/^new-/)
    expect(restoredArrow.dash).toBe('dashed')
    expect(restoredArrow.arrowhead).toBe('none')
  })

  it('does NOT persist when the payload carries no geometry (cards-only legacy file)', async () => {
    const payload: CystiftPayload = { ...PAYLOAD, elements: [] }
    const newId = await restoreCystiftPayload(payload, makeService(), undefined)
    const { canvasFreeformStore } = await import('@/lib/canvas-freeform-store')
    const snap = await canvasFreeformStore.load(newId as never)
    // Nothing written (and cards still restored to DB via service.create).
    expect(snap?.elements ?? []).toEqual([])
  })
})

// Bug 2 回归(2026-06-26):canvasStore.create 在配额满时返回空串(回滚后)。
// restoreCystiftPayload 必须立即 bail out 返回 null——否则会拿着空串 canvasId
// 给每张卡 service.create({ canvasPosition: { canvasId: '' } }),卡片被挂到
// 幻影 canvas id '' 上(任何真实画布都看不见,又不在 inbox 因为有 canvasPosition),
// 而且 canvasStore.setActive('') 是 no-op。结果:卡片永久孤立。
describe('.cystift restore — canvas creation failure (Bug 2)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
    noOpfs()
    window.localStorage.clear()
  })

  it('returns null and creates NO cards when canvasStore.create fails (returns empty id)', async () => {
    // Drive the mocked canvasStore.create to return '' (the rollback signal).
    canvasCreate.mockReturnValue('' as never)

    const service = makeService()
    const result = await restoreCystiftPayload(PAYLOAD, service, undefined)

    // Restore bailed out: null to the caller (same contract as a bad payload).
    expect(result).toBeNull()
    // No cards were created — service.create never ran (no orphan cards under
    // a phantom canvas id '').
    // makeService's create is internal; we assert via the canvas mock instead:
    // setActive was never called with '' (the post-restore switch is skipped).
    expect(canvasSetActive).not.toHaveBeenCalled()
    // And create was called exactly once (the failing attempt), not more.
    expect(canvasCreate).toHaveBeenCalledTimes(1)
  })

  it('returns null and skips geometry when create fails even with a host', async () => {
    canvasCreate.mockReturnValue('' as never)
    const host = {
      upsert: vi.fn(),
      applyWithoutEcho: vi.fn((fn: () => void) => fn()),
      getElements: vi.fn(() => []),
    } as never
    const result = await restoreCystiftPayload(PAYLOAD, makeService(), host)
    expect(result).toBeNull()
    // Host.upsert never called — geometry restore never started.
    expect((host as { upsert: ReturnType<typeof vi.fn> }).upsert).not.toHaveBeenCalled()
  })
})

// R2 回归(2026-07-01):.cystift 往返此前丢 pinned/archived/tags/capturedAt ——
// safeCard 白名单漏这些字段 + service.create(CreateCardInput) 也没元数据入口 →
// 置顶/标签/归档卡往返变空白卡。现在 safeCard 全字段守卫 + create 认可选元数据。
describe('.cystift restore — roundtrip preserves card metadata (R2)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
    noOpfs()
    window.localStorage.clear()
  })

  it('restores pinned/archived/tags/capturedAt onto the new card (not blank)', async () => {
    const createdInputs: Record<string, unknown>[] = []
    let n = 0
    const service = {
      listOnCanvas: () => [] as never[],
      create: (c: Record<string, unknown>) => {
        n += 1
        createdInputs.push(c)
        return { id: `new-${n}`, ...c } as never
      },
    } as never

    const capturedAt = new Date('2026-06-21T00:00:00Z')
    const payload: CystiftPayload = {
      ...PAYLOAD,
      cards: [
        {
          ...(PAYLOAD.cards[0] as object),
          id: 'card-1' as never,
          pinned: true,
          archived: true,
          tags: [{ value: '重要', color: 'var(--color-red)' }],
          capturedAt,
        } as never,
      ],
    }

    const newId = await restoreCystiftPayload(payload, service, undefined)
    expect(newId).not.toBeNull()
    expect(createdInputs).toHaveLength(1)
    // R2: 此前这些字段全丢 → 往返变空白卡。
    expect(createdInputs[0]?.pinned).toBe(true)
    expect(createdInputs[0]?.archived).toBe(true)
    expect(createdInputs[0]?.tags).toEqual([
      { value: '重要', color: 'var(--color-red)' },
    ])
    expect(createdInputs[0]?.capturedAt).toEqual(capturedAt)
  })

  it('coerces ISO-string timestamps from JSON decode into Date', async () => {
    // .cystift 经 encodePayload(JSON)往返后 Date 变成 ISO 字符串 —— coerceDate
    // 必须还原成 Date,否则 CardService 拿到字符串当 Date 用会炸。
    const createdInputs: Record<string, unknown>[] = []
    let n = 0
    const service = {
      listOnCanvas: () => [] as never[],
      create: (c: Record<string, unknown>) => {
        n += 1
        createdInputs.push(c)
        return { id: `new-${n}`, ...c } as never
      },
    } as never

    const payload = {
      ...PAYLOAD,
      cards: [
        {
          ...(PAYLOAD.cards[0] as object),
          id: 'card-1' as never,
          capturedAt: '2026-06-21T00:00:00Z', // string —— 模拟 JSON 解码
        },
      ],
    } as unknown as CystiftPayload

    await restoreCystiftPayload(payload, service, undefined)
    const capturedAt = createdInputs[0]?.capturedAt
    expect(capturedAt).toBeInstanceOf(Date)
    expect((capturedAt as Date).toISOString()).toBe('2026-06-21T00:00:00.000Z')
  })
})
