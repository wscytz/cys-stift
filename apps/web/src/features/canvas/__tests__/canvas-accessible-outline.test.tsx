import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import type { Card } from '@cys-stift/domain'
import { SelfBuiltAdapter } from '@cys-stift/canvas-engine'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      `${key}${vars ? ` ${JSON.stringify(vars)}` : ''}`,
  }),
}))

import {
  CanvasAccessibleOutline,
  buildAccessibleCanvasObjects,
} from '../canvas-accessible-outline'

const card = (id: string, title: string) => ({
  id,
  title,
  body: '',
  type: 'note',
  capturedAt: 1,
  updatedAt: 1,
  pinned: false,
  source: { kind: 'manual', deviceId: 'test' },
  tags: [],
  links: [],
  media: [],
} as unknown as Card)

describe('buildAccessibleCanvasObjects', () => {
  it('exposes kind, label, position and incoming/outgoing relations', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    host.upsert({ id: 'c1', kind: 'card', x: 10, y: 20, w: 100, h: 60, rotation: 0 })
    host.upsert({ id: 'c2', kind: 'card', x: 200, y: 20, w: 100, h: 60, rotation: 0 })
    host.upsert({ id: 'a1', kind: 'arrow', x: 0, y: 0, w: 0, h: 0, rotation: 0, from: 'c1', to: 'c2', text: 'supports' })

    const objects = buildAccessibleCanvasObjects(
      host.getElements(),
      (id) => ({ c1: 'Alpha', c2: 'Beta' })[id],
    )

    expect(objects.find((object) => object.id === 'c1')).toMatchObject({
      kind: 'card',
      label: 'Alpha',
      x: 10,
      y: 20,
      outgoing: ['Beta'],
    })
    expect(objects.find((object) => object.id === 'c2')).toMatchObject({
      incoming: ['Alpha'],
    })
    expect(objects.find((object) => object.id === 'a1')).toMatchObject({
      label: 'supports',
      relation: 'Alpha -> Beta',
    })
  })
})

describe('CanvasAccessibleOutline keyboard journey', () => {
  it('selects, opens, moves, deletes and undoes against the live adapter', () => {
    const host = new SelfBuiltAdapter(document.createElement('canvas'))
    host.upsert({ id: 'c1', kind: 'card', x: 10, y: 20, w: 100, h: 60, rotation: 0 })
    host.upsert({ id: 'c2', kind: 'card', x: 200, y: 20, w: 100, h: 60, rotation: 0 })
    const cards = new Map([
      ['c1', card('c1', 'Alpha')],
      ['c2', card('c2', 'Beta')],
    ])
    const onOpenCard = vi.fn()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => {
      root.render(
        <CanvasAccessibleOutline
          host={host}
          getCard={(id) => cards.get(id)}
          onOpenCard={onOpenCard}
        />,
      )
    })

    const options = () =>
      [...container.querySelectorAll<HTMLButtonElement>('[role="option"]')]
    const outline = container.querySelector<HTMLElement>('.canvas-a11y-outline')
    const style = container.querySelector('style')
    expect(options()).toHaveLength(2)
    expect(options()[0]?.getAttribute('aria-label')).toContain('Alpha')
    expect(options()[0]?.getAttribute('aria-label')).toContain('10')
    // The outline must remain in the keyboard order while visually hidden.
    // `display: none` would fix the screenshot at the cost of AT access.
    expect(style?.textContent).toContain('clip-path: inset(50%)')
    expect(style?.textContent).not.toContain('display: none')
    expect(outline?.matches(':focus-within')).toBe(false)

    act(() => options()[0]?.focus())
    expect(outline?.matches(':focus-within')).toBe(true)
    act(() => {
      options()[0]?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
      )
    })
    expect(document.activeElement).toBe(options()[1])
    expect(host.getSelectedIds()).toEqual(['c2'])

    act(() => {
      options()[1]?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      )
    })
    expect(onOpenCard).toHaveBeenCalledWith(cards.get('c2'))

    act(() => {
      options()[1]?.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowRight',
          altKey: true,
          bubbles: true,
        }),
      )
    })
    expect(host.getElement('c2')).toMatchObject({ x: 201, y: 20 })

    act(() => {
      options()[1]?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }),
      )
    })
    expect(host.getElement('c2')).toBeUndefined()

    act(() => {
      options()[0]?.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'z',
          metaKey: true,
          bubbles: true,
        }),
      )
    })
    expect(host.getElement('c2')).toBeDefined()
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'canvas.a11y.undone',
    )

    act(() => root.unmount())
    host.detach()
    container.remove()
  })
})
