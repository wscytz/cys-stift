import { beforeEach, describe, expect, it, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import InboxPage from '../page'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const {
  cards,
  moveToCanvasMock,
  removeFromCanvasMock,
  pushToastMock,
} = vi.hoisted(() => {
  const now = new Date('2026-07-19T00:00:00Z')
  const cards = ['card-a', 'card-b'].map((id, index) => ({
    id,
    title: `Card ${index + 1}`,
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
    canvasPosition: undefined as undefined | Record<string, unknown>,
  }))
  const moveToCanvasMock = vi.fn((id: string, position: Record<string, unknown>) => {
    const card = cards.find((item) => item.id === id)
    if (!card) return false
    card.canvasPosition = position
    return true
  })
  const removeFromCanvasMock = vi.fn((id: string) => {
    const card = cards.find((item) => item.id === id)
    if (!card?.canvasPosition) return false
    card.canvasPosition = undefined
    return true
  })
  return {
    cards,
    moveToCanvasMock,
    removeFromCanvasMock,
    pushToastMock: vi.fn(),
  }
})

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    locale: 'zh',
  }),
}))

vi.mock('@/lib/db-client', () => ({
  useDb: () => ({
    snap: { version: 1 },
    ready: true,
    service: {
      listInbox: () => cards.filter((card) => !card.canvasPosition),
      listAll: () => cards,
      listOnCanvas: (canvasId: string) =>
        cards.filter((card) => card.canvasPosition?.canvasId === canvasId),
      get: (id: string) => cards.find((card) => card.id === id),
      moveToCanvas: moveToCanvasMock,
      removeFromCanvas: removeFromCanvasMock,
      archive: vi.fn(),
      unarchive: vi.fn(),
      softDelete: vi.fn(),
      update: vi.fn(),
    },
  }),
}))

vi.mock('@/lib/canvas-store', () => ({
  useCanvases: () => ({
    ready: true,
    snapshot: {
      activeCanvasId: 'canvas-a',
      canvases: [
        { id: 'canvas-a', name: 'Alpha' },
        { id: 'canvas-b', name: 'Beta' },
      ],
    },
  }),
}))

vi.mock('@/features/graph/use-global-edges', () => ({ useGlobalEdges: () => ({ edges: [] }) }))
vi.mock('@/features/graph/aggregate-edges', () => ({ liveEdgesOnly: () => [] }))
vi.mock('@/features/capture/capture-sink', () => ({ captureSinkRegistry: { submit: vi.fn() } }))
vi.mock('@/lib/device-id', () => ({ getDeviceId: () => 'test-device' }))
vi.mock('@/lib/toast-store', () => ({ pushToast: pushToastMock }))
vi.mock('@/lib/use-platform', () => ({ useIsMobile: () => false }))
vi.mock('@/features/card/markdown-preview', () => ({ markdownPreview: () => '' }))
vi.mock('@/features/card/card-detail', () => ({ CardDetailModal: () => null }))
vi.mock('@/components/page-loading', () => ({ PageLoading: () => null }))
vi.mock('../create-card-form', () => ({ CreateCardForm: () => null }))
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...props}>{children}</a>
  ),
}))
vi.mock('@cys-stift/ui', () => ({
  BauhausMotif: () => null,
  Button: ({ children, variant: _variant, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => (
    <button type="button" {...props}>{children}</button>
  ),
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Modal: ({ open, title, children }: { open: boolean; title?: React.ReactNode; children: React.ReactNode }) =>
    open ? <div role="dialog"><h2>{title}</h2>{children}</div> : null,
  Tag: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Toolbar: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
}))

function mount() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => root.render(<InboxPage />))
  return {
    host,
    unmount() {
      act(() => root.unmount())
      host.remove()
    },
  }
}

function buttonByText(host: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(host.querySelectorAll('button')).find(
    (candidate) => candidate.textContent === text,
  )
  if (!button) throw new Error(`button not found: ${text}`)
  return button
}

describe('Inbox batch canvas flow', () => {
  beforeEach(() => {
    for (const card of cards) card.canvasPosition = undefined
    moveToCanvasMock.mockClear()
    removeFromCanvasMock.mockClear()
    pushToastMock.mockClear()
    document.body.innerHTML = ''
  })

  it('chooses a named target, assigns unique positions, and exposes one-shot undo', () => {
    const { host, unmount } = mount()
    const selectButtons = host.querySelectorAll<HTMLButtonElement>(
      'button[aria-label="inbox.batch.select"]',
    )
    act(() => {
      selectButtons[0]?.click()
      selectButtons[1]?.click()
    })

    act(() => buttonByText(host, 'inbox.batch.sendToCanvas').click())
    const picker = host.querySelector<HTMLSelectElement>('[data-testid="batch-canvas-target"]')
    expect(picker).toBeTruthy()
    expect(Array.from(picker!.options).map((option) => option.textContent)).toEqual([
      'Alpha',
      'Beta',
    ])
    expect(picker!.value).toBe('canvas-a')

    act(() => {
      picker!.value = 'canvas-b'
      picker!.dispatchEvent(new Event('change', { bubbles: true }))
    })
    act(() => buttonByText(host, 'inbox.batch.sendToCanvasConfirm').click())

    expect(moveToCanvasMock).toHaveBeenCalledTimes(2)
    const positions = moveToCanvasMock.mock.calls.map((call) => call[1])
    expect(positions.every((position) => position?.canvasId === 'canvas-b')).toBe(true)
    expect(new Set(positions.map((position) => `${position?.x}:${position?.y}`)).size).toBe(2)

    const movedToast = pushToastMock.mock.calls
      .map((call) => call[0] as { message?: string; actions?: Array<{ onClick: () => void }> })
      .find((toast) => toast.message?.includes('Beta'))
    expect(movedToast?.actions).toHaveLength(1)
    act(() => movedToast?.actions?.[0]?.onClick())
    act(() => movedToast?.actions?.[0]?.onClick())
    expect(removeFromCanvasMock).toHaveBeenCalledTimes(2)
    expect(cards.every((card) => card.canvasPosition === undefined)).toBe(true)
    unmount()
  })
})
