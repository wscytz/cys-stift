import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CanvasId } from '@cys-stift/domain'

const CANVAS_ID = 'canvas-imported'
const CARD_ID = 'card-imported'

let service: typeof import('../export-service')
let cards: typeof import('../db-client')
let settings: typeof import('../settings-store')
let drafts: typeof import('../draft-store')
let canvases: typeof import('../canvas-store')
let views: typeof import('../canvas-view-store')
let conversations: typeof import('../conversation-store')

beforeEach(async () => {
  vi.resetModules()
  window.localStorage.clear()
  ;[service, cards, settings, drafts, canvases, views, conversations] = await Promise.all([
    import('../export-service'),
    import('../db-client'),
    import('../settings-store'),
    import('../draft-store'),
    import('../canvas-store'),
    import('../canvas-view-store'),
    import('../conversation-store'),
  ])
})

function card(id: string, title: string) {
  return {
    id,
    title,
    body: `${title} body`,
    capturedAt: '2026-07-18T00:00:00.000Z',
    createdAt: '2026-07-18T00:00:00.000Z',
    updatedAt: '2026-07-18T00:00:00.000Z',
  }
}

function canvas(id: string, name: string) {
  return {
    id,
    workspaceId: 'default',
    name,
    view: { zoom: 1, pan: { x: 0, y: 0 }, gridMode: 'snap', gridSize: 8 },
    createdAt: '2026-07-18T00:00:00.000Z',
    updatedAt: '2026-07-18T00:00:00.000Z',
  }
}

function payload(extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    version: service.EXPORT_FORMAT_VERSION,
    exportedAt: '2026-07-18T00:00:00.000Z',
    app: "cy's Stift",
    cards: [card(CARD_ID, 'imported')],
    mediaAssets: {},
    ...extra,
  })
}

describe('importFromJson refreshes hydrate-once stores', () => {
  it('replaces warm in-memory snapshots before returning', async () => {
    const oldCanvas = canvas('canvas-old', 'old')
    window.localStorage.setItem(
      'cys-stift.cards.v1',
      JSON.stringify({ cards: [card('card-old', 'old')] }),
    )
    window.localStorage.setItem(
      'cys-stift.settings.v2',
      JSON.stringify({ settings: settings.DEFAULT_SETTINGS }),
    )
    window.localStorage.setItem(
      'cys-stift.drafts.v1',
      JSON.stringify({ drafts: { capture: { kind: 'capture', payload: { text: 'old' } } } }),
    )
    window.localStorage.setItem(
      'cys-stift.canvases.v1',
      JSON.stringify({ snapshot: { canvases: [oldCanvas], activeCanvasId: oldCanvas.id } }),
    )
    window.localStorage.setItem(
      'cys-stift.canvas-view.v1',
      JSON.stringify({ views: { [oldCanvas.id]: { zoom: 2, panX: 0, panY: 0, gridMode: 'snap', gridSize: 8 } } }),
    )
    window.localStorage.setItem(
      conversations.conversationKey(oldCanvas.id as CanvasId),
      JSON.stringify([{ role: 'user', content: 'old conversation' }]),
    )

    // Warm every hydrate-once store before writing the import.
    cards.rehydrateCards()
    settings.settingsStore.get()
    drafts.draftStore.get('capture')
    canvases.canvasStore.get()
    views.canvasViewStore.get(oldCanvas.id as CanvasId)
    conversations.loadConversation(oldCanvas.id as CanvasId)

    // Simulate an interrupted legacy migration leaving a stale v1 key behind.
    // The imported canonical v2 settings must win, and the stale key must not
    // be allowed to resurrect old settings during rehydration.
    window.localStorage.setItem(
      'cys-stift.settings.v1',
      JSON.stringify({ settings: { locale: 'zh', ai: null } }),
    )

    const seen: string[] = []
    const unsubConversation = conversations.subscribeConversationChanges(() => seen.push('conversation'))
    const settingsSubscriber = vi.fn()
    const canvasesSubscriber = vi.fn()
    const viewsSubscriber = vi.fn()
    const unsubSettings = settings.settingsStore.subscribe(settingsSubscriber)
    const unsubCanvases = canvases.subscribe(canvasesSubscriber)
    const unsubViews = views.subscribe(viewsSubscriber)
    const importedSettings = {
      ...settings.DEFAULT_SETTINGS,
      locale: 'en' as const,
      cardDisplayMode: 'auto' as const,
    }
    const result = await service.importFromJson(
      payload({
        settings: importedSettings,
        drafts: { capture: { kind: 'capture', payload: { text: 'new' }, updatedAt: '2026-07-18T00:00:00.000Z' } },
        canvases: { canvases: [canvas(CANVAS_ID, 'imported canvas')], activeCanvasId: CANVAS_ID },
        canvasView: {
          [CANVAS_ID]: { zoom: 3, panX: 4, panY: 5, gridMode: 'free', gridSize: 16 },
        },
        conversations: {
          [CANVAS_ID]: [{ role: 'assistant', content: 'new conversation' }],
        },
      }),
    )
    unsubConversation()
    unsubSettings()
    unsubCanvases()
    unsubViews()

    expect(result.ok).toBe(true)
    expect(cards.__test__.cardRepo.listAll().map((item) => item.id)).toEqual([CARD_ID])
    expect(settings.settingsStore.get().locale).toBe('en')
    expect(settings.settingsStore.get().cardDisplayMode).toBe('auto')
    expect(drafts.draftStore.get<{ text: string }>('capture')?.payload.text).toBe('new')
    expect(String(canvases.canvasStore.get().activeCanvasId)).toBe(CANVAS_ID)
    expect(canvases.canvasStore.get().canvases.some((item) => String(item.id) === CANVAS_ID)).toBe(true)
    expect(views.canvasViewStore.get(CANVAS_ID as CanvasId).zoom).toBe(3)
    expect(conversations.loadConversation(CANVAS_ID as CanvasId)[0]?.content).toBe('new conversation')
    expect(window.localStorage.getItem('cys-stift.settings.v1')).toBeNull()
    expect(seen).toContain('conversation')
    expect(settingsSubscriber).toHaveBeenCalled()
    expect(canvasesSubscriber).toHaveBeenCalled()
    expect(viewsSubscriber).toHaveBeenCalled()
  })

  it('clears warm optional snapshots in replace mode when fields are omitted', async () => {
    const oldCanvas = canvas('canvas-old', 'old')
    window.localStorage.setItem(
      'cys-stift.cards.v1',
      JSON.stringify({ cards: [card('card-old', 'old')] }),
    )
    window.localStorage.setItem(
      'cys-stift.settings.v2',
      JSON.stringify({ settings: settings.DEFAULT_SETTINGS }),
    )
    window.localStorage.setItem(
      'cys-stift.drafts.v1',
      JSON.stringify({ drafts: { capture: { kind: 'capture', payload: { text: 'old' } } } }),
    )
    window.localStorage.setItem(
      'cys-stift.canvases.v1',
      JSON.stringify({ snapshot: { canvases: [oldCanvas], activeCanvasId: oldCanvas.id } }),
    )
    window.localStorage.setItem(
      'cys-stift.canvas-view.v1',
      JSON.stringify({ views: { [oldCanvas.id]: { zoom: 2, panX: 0, panY: 0, gridMode: 'snap', gridSize: 8 } } }),
    )
    window.localStorage.setItem(
      conversations.conversationKey(oldCanvas.id as CanvasId),
      JSON.stringify([{ role: 'user', content: 'old conversation' }]),
    )

    // Warm all snapshots, then import a legacy cards-only payload.
    cards.rehydrateCards()
    settings.settingsStore.get()
    drafts.draftStore.get('capture')
    canvases.canvasStore.get()
    views.canvasViewStore.get(oldCanvas.id as CanvasId)
    conversations.loadConversation(oldCanvas.id as CanvasId)
    window.localStorage.setItem(
      'cys-stift.settings.v1',
      JSON.stringify({ settings: { locale: 'en', ai: null } }),
    )

    const result = await service.importFromJson(payload())

    expect(result.ok).toBe(true)
    expect(cards.__test__.cardRepo.listAll()).toHaveLength(1)
    expect(cards.__test__.cardRepo.listAll()[0]?.id).toBe(CARD_ID)
    expect(drafts.draftStore.get('capture')).toBeNull()
    expect(settings.settingsStore.get()).toMatchObject({ locale: 'zh', profiles: [], activeProfileId: null })
    expect(window.localStorage.getItem('cys-stift.settings.v1')).toBeNull()
    expect(String(canvases.canvasStore.get().activeCanvasId)).not.toBe(oldCanvas.id)
    expect(views.canvasViewStore.get(oldCanvas.id as CanvasId).zoom).toBe(1)
    expect(conversations.loadConversation(oldCanvas.id as CanvasId)).toEqual([])
  })
})
