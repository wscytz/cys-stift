import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, type AnchorHTMLAttributes } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { CanvasId, Card } from '@cys-stift/domain'
import InboxPage from '../page'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const state = vi.hoisted(() => ({
  cards: [] as Card[],
  isMobile: false,
  isMac: false,
  ready: true,
}))

vi.mock('@/lib/db-client', () => ({
  useDb: () => ({
    snap: state.cards,
    ready: state.ready,
    service: {
      listInbox: () => state.cards.filter((card) => !card.canvasPosition && !card.archived && !card.deletedAt),
      listAll: () => state.cards,
    },
  }),
}))
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string>) => params ? `${key}:${params.combo}` : key,
  }),
}))
vi.mock('@/lib/use-platform', () => ({
  useIsMobile: () => state.isMobile,
  useIsMac: () => state.isMac,
}))
vi.mock('@/lib/settings-store', () => ({
  settingsStore: { get: () => ({ captureShortcut: { shift: true, code: 'KeyQ' } }) },
}))
vi.mock('@/lib/canvas-store', () => ({
  DEFAULT_CANVAS_NAME: 'Default',
  useCanvases: () => ({ snapshot: { activeCanvasId: 'canvas-test', canvases: [] } }),
}))
vi.mock('@/features/graph/use-global-edges', () => ({ useGlobalEdges: () => ({ edges: [] }) }))
vi.mock('@/features/graph/aggregate-edges', () => ({ liveEdgesOnly: () => [] }))
vi.mock('@/features/capture/capture-sink', () => ({ captureSinkRegistry: {} }))
vi.mock('@/lib/device-id', () => ({ getDeviceId: () => 'test-device' }))
vi.mock('@/lib/use-list-steady', () => ({ useListSteady: () => true }))
vi.mock('@/features/card/card-detail', () => ({ CardDetailModal: () => null }))
vi.mock('../create-card-form', () => ({ CreateCardForm: () => null }))
vi.mock('@/components/page-loading', () => ({ PageLoading: () => <p data-testid="loading">Loading</p> }))
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...props}>{children}</a>
  ),
}))

let root: Root | undefined
let container: HTMLDivElement

function card(overrides: Partial<Card> = {}): Card {
  const now = new Date('2026-11-17T00:00:00Z')
  return {
    id: 'card-test' as Card['id'],
    title: 'A captured card',
    body: '',
    type: 'note',
    capturedAt: now,
    createdAt: now,
    updatedAt: now,
    tags: [],
    media: [],
    links: [],
    codeSnippets: [],
    quotes: [],
    pinned: false,
    archived: false,
    source: { kind: 'manual', deviceId: 'test-device' },
    ...overrides,
  }
}

function onCanvas(): Card['canvasPosition'] {
  return { canvasId: 'canvas-test' as CanvasId, x: 0, y: 0, z: 0, w: 240, h: 120 }
}

function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(<InboxPage />))
}

function destinations(): string[] {
  return Array.from(container.querySelectorAll<HTMLAnchorElement>('.empty__ctas a'))
    .map((link) => link.getAttribute('href')!)
}

describe('Inbox empty-state routing', () => {
  beforeEach(() => {
    state.cards = []
    state.ready = true
    state.isMobile = false
    state.isMac = false
  })

  afterEach(() => {
    act(() => root?.unmount())
    container?.remove()
    root = undefined
  })

  it.each([
    { name: 'Windows', isMac: false, combo: 'Ctrl+⇧+Q' },
    { name: 'macOS', isMac: true, combo: '⌘+⇧+Q' },
  ])('shows first-card copy and the configured $name capture shortcut', ({ isMac, combo }) => {
    state.isMac = isMac
    mount()

    expect(container.querySelector('.page-empty h2')?.textContent).toBe('inbox.empty.title')
    expect(container.querySelector('.page-empty')?.textContent).toContain(`inbox.empty.hintCombo:${combo}`)
    expect(destinations()).toEqual([])
  })

  it('does not suggest a global desktop shortcut on mobile', () => {
    state.isMobile = true
    mount()

    expect(container.querySelector('.page-empty h2')?.textContent).toBe('inbox.empty.title')
    expect(container.querySelector('.page-empty')?.textContent).not.toContain('inbox.empty.hintCombo')
  })

  it.each([
    { name: 'canvas only', cards: [card({ canvasPosition: onCanvas() })], routes: ['/canvas'] },
    { name: 'archive only', cards: [card({ archived: true })], routes: ['/archive'] },
    {
      name: 'canvas and archive',
      cards: [card({ canvasPosition: onCanvas() }), card({ id: 'archived-card' as Card['id'], archived: true })],
      routes: ['/canvas', '/archive'],
    },
  ])('routes cleared Inbox to the existing $name cards', ({ cards, routes }) => {
    state.cards = cards
    mount()

    expect(container.querySelector('.page-empty h2')?.textContent).toBe('inbox.empty.titleMoved')
    expect(container.querySelector('.empty__lede')?.textContent).toBe('inbox.empty.ledeMoved')
    expect(destinations()).toEqual(routes)
    expect(container.querySelector('.page-empty')?.textContent).not.toContain('inbox.empty.hintCombo')
  })

  it('ignores deleted cards and does not count archived placements as live canvas cards', () => {
    state.cards = [
      card({ deletedAt: new Date(), canvasPosition: onCanvas() }),
      card({ id: 'deleted-archive' as Card['id'], deletedAt: new Date(), archived: true }),
    ]
    mount()
    expect(container.querySelector('.page-empty h2')?.textContent).toBe('inbox.empty.title')
    expect(destinations()).toEqual([])

    state.cards = [card({ archived: true, canvasPosition: onCanvas() })]
    act(() => root!.render(<InboxPage />))
    expect(destinations()).toEqual(['/archive'])
  })

  it('uses archived-empty copy without capture hints or moved-card links after tab switching', () => {
    state.cards = [card({ canvasPosition: onCanvas() })]
    mount()
    expect(destinations()).toEqual(['/canvas'])

    act(() => container.querySelector<HTMLButtonElement>('#tab-archived')!.click())
    expect(container.querySelector('.page-empty h2')?.textContent).toBe('inbox.empty.titleArchived')
    expect(container.querySelector('.empty__lede')?.textContent).toBe('inbox.empty.ledeArchived')
    expect(container.querySelector('.page-empty')?.textContent).not.toContain('inbox.empty.hintCombo')
    expect(destinations()).toEqual([])

    act(() => container.querySelector<HTMLButtonElement>('#tab-inbox')!.click())
    expect(container.querySelector('.page-empty h2')?.textContent).toBe('inbox.empty.titleMoved')
    expect(destinations()).toEqual(['/canvas'])
  })

  it('keeps empty-state guidance hidden until database hydration completes', () => {
    state.ready = false
    mount()
    expect(container.querySelector('[data-testid="loading"]')).not.toBeNull()
    expect(container.querySelector('.page-empty')).toBeNull()

    state.ready = true
    act(() => root!.render(<InboxPage />))
    expect(container.querySelector('[data-testid="loading"]')).toBeNull()
    expect(container.querySelector('.page-empty h2')?.textContent).toBe('inbox.empty.title')
  })
})
