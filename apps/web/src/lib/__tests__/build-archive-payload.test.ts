import { describe, it, expect, beforeEach, vi } from 'vitest'
import { buildArchivePayload } from '../build-archive-payload'
import { buildExportPayload } from '../export-service'

vi.mock('../export-service', () => ({
  buildExportPayload: vi.fn(),
}))

beforeEach(() => { vi.clearAllMocks(); localStorage.clear() })

describe('buildArchivePayload', () => {
  it('形 == buildExportPayload,mediaAssets 剥 dataUrl 只留元数据', async () => {
    ;(buildExportPayload as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      version: 1, exportedAt: 't', app: 'x',
      cards: [{ id: 'c1' }],
      canvases: { canvases: [], activeCanvasId: 'a' },
      mediaAssets: {
        m1: { id: 'm1', kind: 'image', mimeType: 'image/png', dataUrl: 'data:image/png;base64,BIG', byteSize: 9999, createdAt: 't', checksum: 'abc' },
      },
      settings: { s: 1 },
    })
    const p = await buildArchivePayload()
    expect(p.cards).toEqual([{ id: 'c1' }])
    expect(p.mediaAssets.m1).toEqual({
      id: 'm1', kind: 'image', mimeType: 'image/png', byteSize: 9999, createdAt: 't', checksum: 'abc',
    })
    expect((p.mediaAssets.m1 as { dataUrl?: unknown }).dataUrl).toBeUndefined()
  })

  it('drift lock:ExportPayload 新增可选字段时 buildArchivePayload 仍透传(不丢)', async () => {
    ;(buildExportPayload as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      version: 1, cards: [], mediaAssets: {},
      newFutureField: { x: 1 }, // 模拟将来 export 加的字段
    })
    const p = await buildArchivePayload() as unknown as Record<string, unknown>
    expect(p.newFutureField).toEqual({ x: 1 })
  })

  it('mediaAssets 缺失 → 空 map', async () => {
    ;(buildExportPayload as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      version: 1, cards: [], mediaAssets: {},
    })
    const p = await buildArchivePayload()
    expect(p.mediaAssets).toEqual({})
  })

  it('defense in depth: final archive payload redacts API keys', async () => {
    const secret = 'sk-archive-must-never-leak-unique'
    ;(buildExportPayload as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      version: 1,
      cards: [],
      mediaAssets: {},
      settings: {
        profiles: [{ id: 'p1', apiKey: secret }],
      },
    })

    const serialized = JSON.stringify(await buildArchivePayload())

    expect(serialized).not.toContain(secret)
    expect(JSON.parse(serialized).settings.profiles[0].apiKey).toBe('')
  })
})
