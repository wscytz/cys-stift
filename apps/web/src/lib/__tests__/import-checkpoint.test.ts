import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CardId, CanvasId } from '@cys-stift/domain'

let service: typeof import('../export-service')

const CARDS_KEY = 'cys-stift.cards.v1'
const MEDIA_KEY = 'cys-stift.media.v1'
const SETTINGS_KEY = 'cys-stift.settings.v2'

function card(id: string, title: string) {
  return {
    id: id as CardId,
    title,
    body: `${title} body`,
    capturedAt: '2026-07-19T00:00:00.000Z',
    createdAt: '2026-07-19T00:00:00.000Z',
    updatedAt: '2026-07-19T00:00:00.000Z',
  }
}

function importPayload(id = 'incoming', extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    version: 1,
    exportedAt: '2026-07-19T01:00:00.000Z',
    app: "cy's Stift",
    cards: [card(id, id)],
    mediaAssets: {},
    ...extra,
  })
}

function storedCards(): Array<{ id: string; title: string }> {
  return (JSON.parse(window.localStorage.getItem(CARDS_KEY)!) as {
    cards: Array<{ id: string; title: string }>
  }).cards
}

beforeEach(async () => {
  vi.restoreAllMocks()
  vi.resetModules()
  window.localStorage.clear()
  service = await import('../export-service')
})

describe('pre-import recovery checkpoint', () => {
  it('keeps portable exports redacted while persisting complete local recovery state', async () => {
    const media = {
      id: 'media-old',
      kind: 'image',
      mimeType: 'image/png',
      byteSize: 3,
      dataUrl: 'data:image/png;base64,YWJj',
      createdAt: '2026-07-19T00:00:00.000Z',
      checksum: 'sha256:old',
    }
    window.localStorage.setItem(CARDS_KEY, JSON.stringify({ cards: [card('old', 'old')] }))
    window.localStorage.setItem(MEDIA_KEY, JSON.stringify({ assets: { [media.id]: media } }))
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      settings: {
        profiles: [{
          id: 'profile-1',
          provider: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          apiKey: 'device-local-secret',
        }],
      },
    }))

    const portable = await service.buildExportPayload()
    const portableSettings = portable.settings as {
      profiles?: Array<{ apiKey?: string }>
    }
    expect(portableSettings.profiles?.[0]?.apiKey).toBe('')
    expect(JSON.stringify(portable)).not.toContain('device-local-secret')

    const result = await service.importFromJson(importPayload())

    expect(result).toMatchObject({ ok: true, checkpointCreated: true })
    const checkpoint = service.getImportCheckpoint()
    expect(checkpoint).not.toBeNull()
    expect(checkpoint?.mode).toBe('replace')
    expect(checkpoint?.payload.cards.map((item) => item.title)).toEqual(['old'])
    expect(checkpoint?.payload.mediaAssets).toEqual({ [media.id]: media })
    const settings = checkpoint?.payload.settings as {
      profiles?: Array<{ apiKey?: string }>
    }
    expect(settings.profiles?.[0]?.apiKey).toBe('device-local-secret')
    expect(storedCards().map((item) => item.title)).toEqual(['incoming'])
  })

  it('dryRun validates without creating or replacing a checkpoint', async () => {
    window.localStorage.setItem(CARDS_KEY, JSON.stringify({ cards: [card('old', 'old')] }))
    await service.saveImportCheckpoint('replace')
    const before = window.localStorage.getItem(service.IMPORT_CHECKPOINT_STORAGE_KEY)

    const result = await service.importFromJson(importPayload(), {
      mode: 'merge',
      dryRun: true,
    })

    expect(result.ok).toBe(true)
    expect(window.localStorage.getItem(service.IMPORT_CHECKPOINT_STORAGE_KEY)).toBe(before)
  })

  it('restores the pre-import state with replace semantics and clears only after success', async () => {
    window.localStorage.setItem(CARDS_KEY, JSON.stringify({ cards: [card('old', 'old')] }))
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      settings: {
        profiles: [{
          id: 'old-profile',
          provider: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          apiKey: 'old-device-key',
        }],
      },
    }))

    const imported = await service.importFromJson(importPayload('incoming', {
      settings: { profiles: [] },
    }), { mode: 'replace' })
    expect(imported.ok).toBe(true)
    expect(storedCards().map((item) => item.title)).toEqual(['incoming'])
    expect(JSON.parse(window.localStorage.getItem(SETTINGS_KEY)!).settings.profiles).toEqual([])
    expect(service.hasImportCheckpoint()).toBe(true)

    const restored = await service.restoreImportCheckpoint()

    expect(restored).toMatchObject({ ok: true, checkpointCleared: true })
    expect(storedCards().map((item) => item.title)).toEqual(['old'])
    const restoredSettings = JSON.parse(window.localStorage.getItem(SETTINGS_KEY)!) as {
      settings: { profiles: Array<{ apiKey: string }> }
    }
    expect(restoredSettings.settings.profiles[0]?.apiKey).toBe('old-device-key')
    expect(service.getImportCheckpoint()).toBeNull()
    expect(window.localStorage.getItem(service.IMPORT_CHECKPOINT_STORAGE_KEY)).toBeNull()
  })

  it('checkpoints merge imports so restoring removes records added by the merge', async () => {
    window.localStorage.setItem(CARDS_KEY, JSON.stringify({ cards: [card('old', 'old')] }))

    const imported = await service.importFromJson(importPayload(), { mode: 'merge' })

    expect(imported.ok).toBe(true)
    expect(service.getImportCheckpoint()?.mode).toBe('merge')
    expect(storedCards().map((item) => item.title)).toEqual(['old', 'incoming'])

    expect((await service.restoreImportCheckpoint()).ok).toBe(true)
    expect(storedCards().map((item) => item.title)).toEqual(['old'])
  })

  it('keeps the checkpoint when a freeform write fails and the import rolls back', async () => {
    const canvasId = 'canvas-old' as CanvasId
    window.localStorage.setItem(CARDS_KEY, JSON.stringify({ cards: [card('old', 'old')] }))
    const { canvasFreeformStore } = await import('../canvas-freeform-store')
    vi.spyOn(canvasFreeformStore, 'save').mockResolvedValue(false)

    const result = await service.importFromJson(importPayload('incoming', {
      canvases: {
        canvases: [{
          id: canvasId,
          workspaceId: 'default',
          name: 'Imported canvas',
          view: { zoom: 1, pan: { x: 0, y: 0 }, gridMode: 'snap', gridSize: 8 },
          createdAt: '2026-07-19T00:00:00.000Z',
          updatedAt: '2026-07-19T00:00:00.000Z',
        }],
        activeCanvasId: canvasId,
      },
      freeform: {
        [canvasId]: {
          v: 1,
          app: 'cys-stift',
          elements: [{
            id: 'rect-1',
            kind: 'rect',
            x: 0,
            y: 0,
            w: 40,
            h: 40,
            rotation: 0,
            color: 'blue',
          }],
        },
      },
    }))

    expect(result).toMatchObject({ ok: false })
    expect(result.error).toMatch(/freeform write failed/i)
    expect(storedCards().map((item) => item.title)).toEqual(['old'])
    expect(service.getImportCheckpoint()).toBeNull()
  })

  it('restores the previous checkpoint when a later import fails', async () => {
    window.localStorage.setItem(CARDS_KEY, JSON.stringify({ cards: [card('before-a', 'before-a')] }))
    expect((await service.importFromJson(importPayload('a'))).ok).toBe(true)
    expect(service.getImportCheckpoint()?.payload.cards.map((item) => item.title)).toEqual(['before-a'])

    const canvasId = 'canvas-b' as CanvasId
    const { canvasFreeformStore } = await import('../canvas-freeform-store')
    vi.spyOn(canvasFreeformStore, 'save').mockResolvedValue(false)
    const failed = await service.importFromJson(importPayload('b', {
      canvases: {
        canvases: [{
          id: canvasId,
          workspaceId: 'default',
          name: 'B',
          view: { zoom: 1, pan: { x: 0, y: 0 }, gridMode: 'snap', gridSize: 8 },
          createdAt: '2026-07-19T00:00:00.000Z',
          updatedAt: '2026-07-19T00:00:00.000Z',
        }],
        activeCanvasId: canvasId,
      },
      freeform: {
        [canvasId]: {
          v: 1,
          app: 'cys-stift',
          elements: [{
            id: 'rect-b',
            kind: 'rect',
            x: 0,
            y: 0,
            w: 40,
            h: 40,
            rotation: 0,
            color: 'blue',
          }],
        },
      },
    }))

    expect(failed.ok).toBe(false)
    expect(storedCards().map((item) => item.title)).toEqual(['a'])
    expect(service.getImportCheckpoint()?.payload.cards.map((item) => item.title)).toEqual(['before-a'])
  })

  it('does not clear the recovery copy when restoring it fails validation', async () => {
    window.localStorage.setItem(CARDS_KEY, JSON.stringify({ cards: [card('old', 'old')] }))
    expect((await service.importFromJson(importPayload())).ok).toBe(true)
    const checkpoint = service.getImportCheckpoint()!
    checkpoint.payload.cards[0]!.capturedAt = new Date('invalid')
    const raw = JSON.stringify(checkpoint)
    window.localStorage.setItem(service.IMPORT_CHECKPOINT_STORAGE_KEY, raw)

    const result = await service.restoreImportCheckpoint()

    expect(result.ok).toBe(false)
    expect(window.localStorage.getItem(service.IMPORT_CHECKPOINT_STORAGE_KEY)).toBe(raw)
  })

  it('allows an internal recovery import to opt out of checkpoint creation', async () => {
    window.localStorage.setItem(CARDS_KEY, JSON.stringify({ cards: [card('old', 'old')] }))

    const result = await service.importFromJson(importPayload(), { checkpoint: false })

    expect(result.ok).toBe(true)
    expect(service.getImportCheckpoint()).toBeNull()
  })
})
